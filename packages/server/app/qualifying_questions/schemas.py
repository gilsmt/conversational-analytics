from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class QualifyingQuestionCreate(BaseModel):
    question_text: str = Field(min_length=1)
    key: str = Field(min_length=1, max_length=120, pattern=r"^[a-z0-9_]+$")
    is_active: bool = True


class QualifyingQuestionUpdate(BaseModel):
    question_text: str | None = Field(default=None, min_length=1)
    key: str | None = Field(
        default=None, min_length=1, max_length=120, pattern=r"^[a-z0-9_]+$"
    )
    is_active: bool | None = None


class QualifyingQuestionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    question_text: str
    key: str
    is_active: bool
    created_at: datetime
    updated_at: datetime
