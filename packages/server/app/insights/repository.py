from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repository import RepositoryBase
from models import Conversation, Insight


class InsightRepository(RepositoryBase[Insight]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Insight)

    async def list_ordered(self) -> list[Insight]:
        return list(
            await self.session.scalars(
                select(Insight).order_by(Insight.created_at.asc())
            )
        )

    async def mark_conversations_pending_with_result(self, insight_id: UUID) -> None:
        conversations = await self.session.scalars(
            select(Conversation).where(
                Conversation.insight_results.has_key(str(insight_id))
            )  # noqa: W601
        )
        for conversation in conversations:
            conversation.analysis_status = "pending"

    async def remove_result_keys(self, insight_id: UUID) -> None:
        conversations = await self.session.scalars(
            select(Conversation).where(
                Conversation.insight_results.has_key(str(insight_id))
            )  # noqa: W601
        )
        key = str(insight_id)
        for conversation in conversations:
            results = dict(conversation.insight_results or {})
            results.pop(key, None)
            conversation.insight_results = results
