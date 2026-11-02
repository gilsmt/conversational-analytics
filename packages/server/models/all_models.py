from __future__ import annotations

from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from models.base import Base, TimestampMixin, UUIDMixin


class Conversation(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "conversations"

    session_id: Mapped[UUID] = mapped_column(PG_UUID(as_uuid=True), unique=True)
    title: Mapped[str] = mapped_column(Text)
    message_count: Mapped[int] = mapped_column(Integer, default=0)
    analysis_status: Mapped[str] = mapped_column(String(32), default="pending")
    analysis_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    insight_results: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    qualifying_results: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    messages: Mapped[list[Message]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="(Message.created_at, Message.row_index)",
    )
    chat_threads: Mapped[list[ChatThread]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    __table_args__ = (
        CheckConstraint(
            "analysis_status in ('pending', 'processing', 'completed', 'failed')",
            name="ck_conversations_analysis_status",
        ),
    )


class Message(UUIDMixin, Base):
    __tablename__ = "messages"

    conversation_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        index=True,
    )
    speaker: Mapped[str] = mapped_column(String(128))
    message_type: Mapped[str] = mapped_column(String(64))
    text: Mapped[str] = mapped_column(Text, default="")
    content: Mapped[dict[str, Any]] = mapped_column(JSONB)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    row_index: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)

    conversation: Mapped[Conversation] = relationship(back_populates="messages")

    __table_args__ = (
        UniqueConstraint(
            "conversation_id",
            "row_index",
            name="uq_messages_conversation_row_index",
        ),
    )


class Insight(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "insights"

    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class QualifyingQuestion(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "qualifying_questions"

    question_text: Mapped[str] = mapped_column(Text)
    key: Mapped[str] = mapped_column(String(120), unique=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class AnalysisRun(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "analysis_runs"

    status: Mapped[str] = mapped_column(String(32), default="queued")
    total: Mapped[int] = mapped_column(Integer, default=0)
    processed: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    reanalyze_all: Mapped[bool] = mapped_column(Boolean, default=False)
    cancel_requested: Mapped[bool] = mapped_column(Boolean, default=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    finished_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    __table_args__ = (
        CheckConstraint(
            "status in ('queued', 'running', 'canceling', 'completed', 'failed', 'canceled')",
            name="ck_analysis_runs_status",
        ),
    )


class ChatThread(UUIDMixin, TimestampMixin, Base):
    __tablename__ = "chat_threads"

    scope: Mapped[str] = mapped_column(String(16))
    conversation_id: Mapped[UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("conversations.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(String(200), default="New chat")

    conversation: Mapped[Conversation | None] = relationship(
        back_populates="chat_threads"
    )
    messages: Mapped[list[ChatMessage]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="ChatMessage.created_at",
    )

    __table_args__ = (
        CheckConstraint("scope in ('all', 'single')", name="ck_chat_threads_scope"),
        CheckConstraint(
            "(scope = 'all' and conversation_id is null) or "
            "(scope = 'single' and conversation_id is not null)",
            name="ck_chat_threads_scope_conversation",
        ),
    )


class ChatMessage(UUIDMixin, Base):
    __tablename__ = "chat_messages"

    thread_id: Mapped[UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("chat_threads.id", ondelete="CASCADE"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    meta: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    thread: Mapped[ChatThread] = relationship(back_populates="messages")

    __table_args__ = (
        CheckConstraint("role in ('user', 'assistant')", name="ck_chat_messages_role"),
    )
