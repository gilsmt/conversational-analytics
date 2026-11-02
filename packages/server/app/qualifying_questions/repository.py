from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.repository import RepositoryBase
from models import Conversation, QualifyingQuestion


class QualifyingQuestionRepository(RepositoryBase[QualifyingQuestion]):
    def __init__(self, session: AsyncSession) -> None:
        super().__init__(session, QualifyingQuestion)

    async def list_ordered(self) -> list[QualifyingQuestion]:
        return list(
            await self.session.scalars(
                select(QualifyingQuestion).order_by(QualifyingQuestion.created_at.asc())
            )
        )

    async def get_by_key(self, key: str) -> QualifyingQuestion | None:
        return await self.session.scalar(
            select(QualifyingQuestion).where(QualifyingQuestion.key == key)
        )

    async def mark_conversations_pending_with_result(self, question_id: UUID) -> None:
        conversations = await self.session.scalars(
            select(Conversation).where(
                Conversation.qualifying_results.has_key(str(question_id))
            )  # noqa: W601
        )
        for conversation in conversations:
            conversation.analysis_status = "pending"

    async def remove_result_keys(self, question_id: UUID) -> None:
        conversations = await self.session.scalars(
            select(Conversation).where(
                Conversation.qualifying_results.has_key(str(question_id))
            )  # noqa: W601
        )
        key = str(question_id)
        for conversation in conversations:
            results = dict(conversation.qualifying_results or {})
            results.pop(key, None)
            conversation.qualifying_results = results
