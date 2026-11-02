from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ChatThreadCreate(BaseModel):
    scope: str = Field(pattern=r"^(all|single)$")
    conversation_id: UUID | None = None
    related_conversation_id: UUID | None = None


class ChatThreadUpdate(BaseModel):
    title: str = Field(min_length=1, max_length=200)


class ChatMessageCreate(BaseModel):
    content: str = Field(min_length=1)


class ChatMessageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    role: str
    content: str
    meta: dict[str, object] = Field(default_factory=dict)
    created_at: datetime


class ChatThreadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    scope: str
    conversation_id: UUID | None
    title: str
    created_at: datetime
    updated_at: datetime
    last_message_preview: str | None = None
    message_count: int = 0
    conversation_title: str | None = None


class ChatThreadDetail(ChatThreadRead):
    messages: list[ChatMessageRead]


class ChatThreadListResponse(BaseModel):
    items: list[ChatThreadRead]
    total: int
    limit: int
    offset: int


class ChatSuggestion(BaseModel):
    label: str
    prompt: str
    scope: str = Field(pattern=r"^(all|single)$")
    conversation_id: UUID | None = None
