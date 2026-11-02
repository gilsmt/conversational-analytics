from __future__ import annotations

import asyncio
import json
from typing import Annotated, AsyncIterator
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini import generate_chat_suggestions, generate_chat_title
from app.chat.agent import ChatAgentFinal, stream_chat_response
from app.chat.repository import ChatThreadRepository
from app.chat.schemas import (
    ChatMessageCreate,
    ChatMessageRead,
    ChatSuggestion,
    ChatThreadCreate,
    ChatThreadDetail,
    ChatThreadListResponse,
    ChatThreadRead,
    ChatThreadUpdate,
)
from app.core.errors import AppError, not_found
from app.db.session import SessionLocal, get_session
from models import ChatThread, Conversation

router = APIRouter(prefix="/chat/threads", tags=["chat"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


def _thread_read(thread: ChatThread) -> ChatThreadRead:
    last_message = thread.messages[-1] if thread.messages else None
    return ChatThreadRead(
        id=thread.id,
        scope=thread.scope,
        conversation_id=thread.conversation_id,
        title=thread.title,
        created_at=thread.created_at,
        updated_at=thread.updated_at,
        last_message_preview=last_message.content[:120] if last_message else None,
        message_count=len(thread.messages),
        conversation_title=thread.conversation.title if thread.conversation else None,
    )


@router.get("", response_model=ChatThreadListResponse)
async def list_threads(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ChatThreadListResponse:
    items, total = await ChatThreadRepository(session).list_recent(
        limit=limit,
        offset=offset,
    )
    return ChatThreadListResponse(
        items=[_thread_read(item) for item in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ChatThreadRead, status_code=201)
async def create_thread(
    payload: ChatThreadCreate, session: SessionDep
) -> ChatThreadRead:
    repository = ChatThreadRepository(session)
    if payload.scope == "all" and payload.conversation_id is not None:
        raise AppError(
            "ValidationError", "All-scope threads cannot include conversation_id", 422
        )
    if payload.scope == "single":
        if payload.conversation_id is None:
            raise AppError(
                "ValidationError", "Single-scope threads require conversation_id", 422
            )
        if not await repository.conversation_exists(payload.conversation_id):
            raise not_found("Conversation", str(payload.conversation_id))
    thread = await repository.create_thread(
        scope=payload.scope,
        conversation_id=payload.conversation_id,
    )
    thread = await repository.get_detail(thread.id)
    assert thread is not None
    return _thread_read(thread)


@router.get("/{thread_id}", response_model=ChatThreadDetail)
async def get_thread(thread_id: UUID, session: SessionDep) -> ChatThreadDetail:
    thread = await ChatThreadRepository(session).get_detail(thread_id)
    if thread is None:
        raise not_found("Chat thread", str(thread_id))
    base = _thread_read(thread).model_dump()
    return ChatThreadDetail(**base, messages=thread.messages)


@router.patch("/{thread_id}", response_model=ChatThreadRead)
async def rename_thread(
    thread_id: UUID,
    payload: ChatThreadUpdate,
    session: SessionDep,
) -> ChatThreadRead:
    repository = ChatThreadRepository(session)
    thread = await repository.get_detail(thread_id)
    if thread is None:
        raise not_found("Chat thread", str(thread_id))
    thread.title = payload.title
    return _thread_read(thread)


@router.delete("/{thread_id}", status_code=204)
async def delete_thread(thread_id: UUID, session: SessionDep) -> None:
    repository = ChatThreadRepository(session)
    thread = await repository.get(thread_id)
    if thread is None:
        raise not_found("Chat thread", str(thread_id))
    await repository.delete(thread)


@router.post("/{thread_id}/suggestions", response_model=list[ChatSuggestion])
async def suggest_next_prompts(
    thread_id: UUID,
    session: SessionDep,
) -> list[ChatSuggestion]:
    repository = ChatThreadRepository(session)
    thread = await repository.get_detail(thread_id)
    if thread is None:
        raise not_found("Chat thread", str(thread_id))
    statement = select(Conversation).order_by(Conversation.created_at.desc())
    if thread.scope == "single" and thread.conversation_id is not None:
        statement = statement.where(Conversation.id == thread.conversation_id)
    conversations = list(await session.scalars(statement.limit(50)))
    history = "\n".join(
        f"{message.role}: {message.content}" for message in thread.messages[-8:]
    )
    suggestions = await generate_chat_suggestions(
        thread=thread,
        conversations=conversations,
        history=history,
    )
    return [ChatSuggestion.model_validate(suggestion) for suggestion in suggestions]


def _sse(event: str, payload: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(payload)}\n\n"


@router.post("/{thread_id}/messages")
async def send_message(
    thread_id: UUID,
    payload: ChatMessageCreate,
    session: SessionDep,
) -> StreamingResponse:
    repository = ChatThreadRepository(session)
    thread = await repository.get_detail(thread_id)
    if thread is None:
        raise not_found("Chat thread", str(thread_id))
    if thread.messages and thread.scope not in {"all", "single"}:
        raise AppError("ValidationError", "Invalid chat scope", 422)

    async def stream() -> AsyncIterator[str]:
        yield _sse("status", {"message": "Reading conversations"})
        async with SessionLocal() as local_session:
            local_repository = ChatThreadRepository(local_session)
            local_thread = await local_repository.get_detail(thread_id)
            if local_thread is None:
                yield _sse("error", {"message": "Chat thread was deleted"})
                return
            # Streaming responses outlive the request dependency, so the user
            # message is persisted in this explicit stream unit of work. This
            # also preserves the user's prompt when the client aborts before
            # an assistant response is produced.
            was_empty = len(local_thread.messages) == 0
            user_message = await local_repository.add_message(
                local_thread,
                role="user",
                content=payload.content,
            )
            await local_session.commit()
            final: ChatAgentFinal | None = None
            try:
                async for agent_event in stream_chat_response(
                    local_session,
                    local_thread,
                    payload.content,
                    current_user_message_id=user_message.id,
                ):
                    if isinstance(agent_event, ChatAgentFinal):
                        final = agent_event
                    else:
                        yield _sse(agent_event.event, agent_event.data)
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                yield _sse("error", {"message": str(exc)})
                return
            if final is None:
                yield _sse("error", {"message": "Chat failed before completion"})
                return

            meta = {
                **final.meta,
                "responding_to": str(user_message.id),
            }
            assistant = await local_repository.add_assistant_message(
                local_thread,
                content=final.answer,
                meta=meta,
            )
            if was_empty:
                yield _sse("status", {"message": "Naming this chat"})
                local_thread.title = await generate_chat_title(
                    thread=local_thread,
                    user_message=payload.content,
                    assistant_message=final.answer,
                    fallback=local_thread.title,
                )
            # The assistant response is committed only after a complete model
            # answer; if the stream is aborted, partial output is discarded.
            await local_session.commit()
            await local_session.refresh(assistant)
            message = ChatMessageRead.model_validate(assistant).model_dump(mode="json")
            yield _sse("done", {"message": message})

    return StreamingResponse(stream(), media_type="text/event-stream")
