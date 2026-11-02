from typing import Generic, TypeVar
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from models.base import Base

ModelT = TypeVar("ModelT", bound=Base)


class RepositoryBase(Generic[ModelT]):
    def __init__(self, session: AsyncSession, model: type[ModelT]) -> None:
        self.session = session
        self.model = model

    async def get(self, item_id: UUID) -> ModelT | None:
        return await self.session.get(self.model, item_id)

    async def list(self, *, limit: int = 50, offset: int = 0) -> list[ModelT]:
        result = await self.session.scalars(
            select(self.model).limit(limit).offset(offset)
        )
        return list(result)

    async def add(self, obj: ModelT, *, flush: bool = False) -> ModelT:
        self.session.add(obj)
        if flush:
            await self.session.flush()
        return obj

    async def delete(self, obj: ModelT, *, flush: bool = False) -> None:
        await self.session.delete(obj)
        if flush:
            await self.session.flush()
