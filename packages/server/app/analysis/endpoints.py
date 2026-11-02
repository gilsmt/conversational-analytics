from typing import Annotated
from datetime import UTC, datetime
from uuid import UUID

from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.analysis.schemas import AnalysisRunCreate, AnalysisRunRead
from app.analysis.worker import run_analysis
from app.core.errors import not_found
from app.db.session import get_session
from models import AnalysisRun

router = APIRouter(prefix="/analysis-runs", tags=["analysis"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.post("", response_model=AnalysisRunRead, status_code=201)
async def create_analysis_run(
    payload: AnalysisRunCreate,
    background_tasks: BackgroundTasks,
    session: SessionDep,
) -> AnalysisRun:
    run = AnalysisRun(reanalyze_all=payload.reanalyze_all, status="queued")
    session.add(run)
    await session.flush()
    # Background tasks use their own database session. Commit the queued run
    # before scheduling so the worker can see it immediately.
    await session.commit()
    background_tasks.add_task(run_analysis, run.id)
    return run


@router.get("/latest", response_model=AnalysisRunRead | None)
async def get_latest_analysis_run(session: SessionDep) -> AnalysisRun | None:
    return await session.scalar(
        select(AnalysisRun).order_by(AnalysisRun.created_at.desc()).limit(1)
    )


@router.get("/{analysis_run_id}", response_model=AnalysisRunRead)
async def get_analysis_run(
    analysis_run_id: UUID,
    session: SessionDep,
) -> AnalysisRun:
    run = await session.get(AnalysisRun, analysis_run_id)
    if run is None:
        raise not_found("Analysis run", str(analysis_run_id))
    return run


@router.post("/{analysis_run_id}/cancel", response_model=AnalysisRunRead)
async def cancel_analysis_run(
    analysis_run_id: UUID,
    session: SessionDep,
) -> AnalysisRun:
    run = await session.get(AnalysisRun, analysis_run_id)
    if run is None:
        raise not_found("Analysis run", str(analysis_run_id))
    if run.status == "queued":
        run.cancel_requested = True
        run.status = "canceled"
        run.finished_at = datetime.now(UTC)
    elif run.status == "running":
        run.cancel_requested = True
        run.status = "canceling"
    return run
