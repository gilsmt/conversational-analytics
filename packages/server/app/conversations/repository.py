from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repository import RepositoryBase
from models import ChatThread, Conversation


class ConversationRepository(RepositoryBase[Conversation]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, Conversation)

    async def list_recent(
        self, *, limit: int, offset: int
    ) -> tuple[list[Conversation], int]:
        total = await self.session.scalar(
            select(func.count()).select_from(Conversation)
        )
        result = await self.session.scalars(
            select(Conversation)
            .order_by(Conversation.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result), total or 0

    async def get_detail(self, conversation_id: UUID) -> Conversation | None:
        return await self.session.scalar(
            select(Conversation)
            .where(Conversation.id == conversation_id)
            .options(selectinload(Conversation.messages))
        )

    async def delete_with_single_threads(self, conversation: Conversation) -> None:
        threads = await self.session.scalars(
            select(ChatThread).where(ChatThread.conversation_id == conversation.id)
        )
        for thread in threads:
            await self.session.delete(thread)
        await self.session.delete(conversation)
