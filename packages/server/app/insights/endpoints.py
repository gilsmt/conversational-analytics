from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import not_found
from app.db.session import get_session
from app.insights.repository import InsightRepository
from app.insights.schemas import InsightCreate, InsightRead, InsightUpdate
from models import Insight

router = APIRouter(prefix="/insights", tags=["insights"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=list[InsightRead])
async def list_insights(session: SessionDep) -> list[Insight]:
    return await InsightRepository(session).list_ordered()


@router.post("", response_model=InsightRead, status_code=201)
async def create_insight(payload: InsightCreate, session: SessionDep) -> Insight:
    insight = Insight(**payload.model_dump())
    await InsightRepository(session).add(insight, flush=True)
    return insight


@router.patch("/{insight_id}", response_model=InsightRead)
async def update_insight(
    insight_id: UUID,
    payload: InsightUpdate,
    session: SessionDep,
) -> Insight:
    repository = InsightRepository(session)
    insight = await repository.get(insight_id)
    if insight is None:
        raise not_found("Insight", str(insight_id))
    changes = payload.model_dump(exclude_unset=True)
    for key, value in changes.items():
        setattr(insight, key, value)
    if changes:
        await repository.mark_conversations_pending_with_result(insight.id)
    return insight


@router.delete("/{insight_id}", status_code=204)
async def delete_insight(insight_id: UUID, session: SessionDep) -> None:
    repository = InsightRepository(session)
    insight = await repository.get(insight_id)
    if insight is None:
        raise not_found("Insight", str(insight_id))
    await repository.remove_result_keys(insight.id)
    await repository.delete(insight)
