from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.repository import RepositoryBase
from models import ChatMessage, ChatThread, Conversation


class ChatThreadRepository(RepositoryBase[ChatThread]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, ChatThread)

    async def list_recent(
        self, *, limit: int, offset: int
    ) -> tuple[list[ChatThread], int]:
        total = await self.session.scalar(select(func.count()).select_from(ChatThread))
        result = await self.session.scalars(
            select(ChatThread)
            .options(
                selectinload(ChatThread.messages), selectinload(ChatThread.conversation)
            )
            .order_by(ChatThread.updated_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result), total or 0

    async def get_detail(self, thread_id: UUID) -> ChatThread | None:
        return await self.session.scalar(
            select(ChatThread)
            .where(ChatThread.id == thread_id)
            .options(
                selectinload(ChatThread.messages), selectinload(ChatThread.conversation)
            )
        )

    async def create_thread(
        self,
        *,
        scope: str,
        conversation_id: UUID | None,
    ) -> ChatThread:
        thread = ChatThread(
            scope=scope,
            conversation_id=conversation_id,
            title="All conversations" if scope == "all" else "Conversation chat",
        )
        await self.add(thread, flush=True)
        return thread

    async def conversation_exists(self, conversation_id: UUID) -> bool:
        return (
            await self.session.scalar(
                select(Conversation.id).where(Conversation.id == conversation_id)
            )
        ) is not None

    async def add_message(
        self, thread: ChatThread, *, role: str, content: str
    ) -> ChatMessage:
        message = ChatMessage(thread_id=thread.id, role=role, content=content, meta={})
        self.session.add(message)
        if role == "user" and len(thread.messages) == 0:
            thread.title = content[:80] + ("..." if len(content) > 80 else "")
        thread.updated_at = datetime.now(UTC)
        await self.session.flush()
        return message

    async def add_assistant_message(
        self,
        thread: ChatThread,
        *,
        content: str,
        meta: dict,
    ) -> ChatMessage:
        message = ChatMessage(
            thread_id=thread.id,
            role="assistant",
            content=content,
            meta=meta,
        )
        self.session.add(message)
        thread.updated_at = datetime.now(UTC)
        await self.session.flush()
        return message
