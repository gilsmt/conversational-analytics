from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class InsightCreate(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1)
    is_active: bool = True


class InsightUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, min_length=1)
    is_active: bool | None = None


class InsightRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    description: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
