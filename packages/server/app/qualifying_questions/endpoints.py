from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import AppError, not_found
from app.db.session import get_session
from app.qualifying_questions.repository import QualifyingQuestionRepository
from app.qualifying_questions.schemas import (
    QualifyingQuestionCreate,
    QualifyingQuestionRead,
    QualifyingQuestionUpdate,
)
from models import QualifyingQuestion

router = APIRouter(prefix="/qualifying-questions", tags=["qualifying questions"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[QualifyingQuestionRead])
async def list_questions(session: SessionDep) -> list[QualifyingQuestion]:
    return await QualifyingQuestionRepository(session).list_ordered()


@router.post("", response_model=QualifyingQuestionRead, status_code=201)
async def create_question(
    payload: QualifyingQuestionCreate,
    session: SessionDep,
) -> QualifyingQuestion:
    repository = QualifyingQuestionRepository(session)
    existing = await repository.get_by_key(payload.key)
    if existing is not None:
        raise AppError("Conflict", f"Question key {payload.key} already exists", 409)
    question = QualifyingQuestion(**payload.model_dump())
    await repository.add(question, flush=True)
    return question


@router.patch("/{question_id}", response_model=QualifyingQuestionRead)
async def update_question(
    question_id: UUID,
    payload: QualifyingQuestionUpdate,
    session: SessionDep,
) -> QualifyingQuestion:
    repository = QualifyingQuestionRepository(session)
    question = await repository.get(question_id)
    if question is None:
        raise not_found("Qualifying question", str(question_id))
    changes = payload.model_dump(exclude_unset=True)
    if "key" in changes and changes["key"] != question.key:
        existing = await repository.get_by_key(changes["key"])
        if existing is not None:
            raise AppError(
                "Conflict", f"Question key {changes['key']} already exists", 409
            )
    for key, value in changes.items():
        setattr(question, key, value)
    if changes:
        await repository.mark_conversations_pending_with_result(question.id)
    return question


@router.delete("/{question_id}", status_code=204)
async def delete_question(question_id: UUID, session: SessionDep) -> None:
    repository = QualifyingQuestionRepository(session)
    question = await repository.get(question_id)
    if question is None:
        raise not_found("Qualifying question", str(question_id))
    await repository.remove_result_keys(question.id)
    await repository.delete(question)
