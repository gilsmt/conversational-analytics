from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class ImportFileResult(BaseModel):
    filename: str
    status: str
    session_id: UUID | None = None
    message_count: int = 0
    error: str | None = None


class ImportSummary(BaseModel):
    imported: int
    skipped: int
    failed: int
    files: list[ImportFileResult]


class MessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    speaker: str
    message_type: str
    text: str
    content: dict[str, Any]
    confidence: float | None
    created_at: datetime


class ConversationListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    session_id: UUID
    title: str
    message_count: int
    analysis_status: str
    analysis_error: str | None
    insight_results: dict[str, Any]
    qualifying_results: dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ConversationDetail(ConversationListItem):
    messages: list[MessageRead]


class ConversationListResponse(BaseModel):
    items: list[ConversationListItem]
    total: int
    limit: int
    offset: int
