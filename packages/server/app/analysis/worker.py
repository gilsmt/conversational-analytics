from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.analysis.gemini import analyze_conversation_with_gemini
from app.db.session import SessionLocal
from models import AnalysisRun, Conversation, Insight, QualifyingQuestion


TRANSIENT_RETRIES = 2
logger = logging.getLogger(__name__)


async def _conversation_ids(reanalyze_all: bool) -> list[UUID]:
    async with SessionLocal() as session:
        statement = select(Conversation.id).order_by(Conversation.created_at.asc())
        if not reanalyze_all:
            statement = statement.where(
                Conversation.analysis_status.in_(("pending", "failed"))
            )
        return list(await session.scalars(statement))


async def run_analysis(analysis_run_id: UUID) -> None:
    try:
        await _run_analysis(analysis_run_id)
    except Exception:
        logger.exception(
            "Analysis run %s failed before normal completion", analysis_run_id
        )
        async with SessionLocal() as session:
            run = await session.get(AnalysisRun, analysis_run_id)
            if run is not None and run.status in {"queued", "running", "canceling"}:
                run.status = "failed"
                run.last_error = "Analysis worker failed before completion"
                run.finished_at = datetime.now(UTC)
                await session.commit()


async def _run_analysis(analysis_run_id: UUID) -> None:
    ids: list[UUID] = []
    async with SessionLocal() as session:
        run = await session.get(AnalysisRun, analysis_run_id)
        if run is None:
            logger.warning("Analysis run %s was not found", analysis_run_id)
            return
        ids = await _conversation_ids(run.reanalyze_all)
        if run.cancel_requested:
            run.status = "canceled"
            run.total = len(ids)
            run.finished_at = datetime.now(UTC)
            await session.commit()
            return
        run.status = "running"
        run.total = len(ids)
        run.started_at = datetime.now(UTC)
        # Background analysis is outside request-scoped session management.
        # Commit each durable run-state transition so polling clients can see progress.
        await session.commit()
    logger.info(
        "Analysis run %s started with %s conversations", analysis_run_id, len(ids)
    )

    for conversation_id in ids:
        should_continue = await _process_conversation(analysis_run_id, conversation_id)
        if not should_continue:
            return

    async with SessionLocal() as session:
        run = await session.get(AnalysisRun, analysis_run_id)
        if run is not None:
            if run.cancel_requested:
                run.status = "canceled"
            elif run.failed == 0:
                run.status = "completed"
            else:
                run.status = "failed"
            run.finished_at = datetime.now(UTC)
            # Final status is the last background-work transaction boundary.
            await session.commit()
            logger.info(
                "Analysis run %s finished with status %s", analysis_run_id, run.status
            )


async def _process_conversation(analysis_run_id: UUID, conversation_id: UUID) -> bool:
    async with SessionLocal() as session:
        run = await session.get(AnalysisRun, analysis_run_id)
        if run is None:
            return False
        if run.cancel_requested:
            run.status = "canceled"
            run.finished_at = datetime.now(UTC)
            # See run-state note above: cancellation must be visible immediately.
            await session.commit()
            return False
        conversation = await session.scalar(
            select(Conversation).where(Conversation.id == conversation_id)
        )
        if conversation is None:
            run.processed += 1
            # Missing conversations are a completed unit of background work.
            await session.commit()
            return True
        conversation.analysis_status = "processing"
        conversation.analysis_error = None
        # Persist per-conversation progress before making the external LLM call.
        await session.commit()

    error: Exception | None = None
    for attempt in range(TRANSIENT_RETRIES + 1):
        try:
            async with SessionLocal() as session:
                conversation = await session.scalar(
                    select(Conversation)
                    .where(Conversation.id == conversation_id)
                    .options(selectinload(Conversation.messages))
                )
                if conversation is None:
                    break
                insights = list(
                    await session.scalars(
                        select(Insight)
                        .where(Insight.is_active.is_(True))
                        .order_by(Insight.created_at.asc())
                    )
                )
                questions = list(
                    await session.scalars(
                        select(QualifyingQuestion)
                        .where(QualifyingQuestion.is_active.is_(True))
                        .order_by(QualifyingQuestion.created_at.asc())
                    )
                )
                (
                    insight_results,
                    qualifying_results,
                ) = await analyze_conversation_with_gemini(
                    conversation, insights, questions
                )
                conversation.insight_results = {
                    **(conversation.insight_results or {}),
                    **insight_results,
                }
                conversation.qualifying_results = {
                    **(conversation.qualifying_results or {}),
                    **qualifying_results,
                }
                conversation.analysis_status = "completed"
                conversation.analysis_error = None
                run = await session.get(AnalysisRun, analysis_run_id)
                if run is not None:
                    run.processed += 1
                # One conversation is the analysis unit of work; commit after it
                # succeeds so later failures do not roll back earlier results.
                await session.commit()
                return True
        except Exception as exc:
            error = exc
            logger.warning(
                "Analysis run %s failed conversation %s on attempt %s/%s",
                analysis_run_id,
                conversation_id,
                attempt + 1,
                TRANSIENT_RETRIES + 1,
                exc_info=True,
            )
            if attempt < TRANSIENT_RETRIES:
                await asyncio.sleep(1 + attempt)

    if error is not None:
        async with SessionLocal() as session:
            conversation = await session.get(Conversation, conversation_id)
            run = await session.get(AnalysisRun, analysis_run_id)
            if conversation is not None:
                conversation.analysis_status = "failed"
                conversation.analysis_error = str(error)
            if run is not None:
                run.processed += 1
                run.failed += 1
                run.last_error = str(error)
            # Failure is isolated to this conversation and should be pollable.
            await session.commit()
    return True
