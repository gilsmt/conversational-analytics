from __future__ import annotations

import asyncio
import json
import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any
from uuid import UUID, uuid4

from google import genai
from google.genai import types
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.gemini import _response_text
from app.core.config import get_settings
from models import ChatThread, Conversation, Insight, Message, QualifyingQuestion

logger = logging.getLogger(__name__)
MAX_CHAT_TOOL_CALLS = 5
SEARCH_TOKEN_RE = re.compile(r"[a-zA-Z0-9_]{2,}")


@dataclass(frozen=True)
class ChatAgentEvent:
    event: str
    data: dict[str, Any]


@dataclass(frozen=True)
class ChatAgentFinal:
    answer: str
    meta: dict[str, Any]


def _message_line(message: Message) -> str:
    return f"[{message.row_index}] {message.speaker}: {message.text}"


def _conversation_transcript(conversation: Conversation) -> str:
    return "\n".join(
        _message_line(message) for message in conversation.messages if message.text
    )


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False)


def _tokens(value: str) -> set[str]:
    return {match.group(0).casefold() for match in SEARCH_TOKEN_RE.finditer(value)}


def _snippet(value: str, query_tokens: set[str], *, length: int = 360) -> str:
    if not value:
        return ""
    lower = value.casefold()
    positions = [lower.find(token) for token in query_tokens if token in lower]
    start = max(min((pos for pos in positions if pos >= 0), default=0) - 80, 0)
    excerpt = value[start : start + length].strip()
    prefix = "..." if start > 0 else ""
    suffix = "..." if start + length < len(value) else ""
    return f"{prefix}{excerpt}{suffix}"


def _conversation_ref(conversation: Conversation) -> dict[str, str]:
    return {
        "conversation_id": str(conversation.id),
        "session_id": str(conversation.session_id),
        "title": conversation.title,
    }


def _analysis_notice(aggregate: dict[str, Any]) -> str:
    if (
        aggregate.get("conversation_count", 0) > 0
        and aggregate.get(
            "completed_analysis_count",
            0,
        )
        == 0
    ):
        return (
            "Predefined analysis results are unavailable because no conversations "
            "have completed analysis yet. You can still answer from transcripts."
        )
    return ""


def _compact_results_map(values: dict[str, Any]) -> dict[str, Any]:
    return {
        key: value for key, value in values.items() if value not in (None, "", {}, [])
    }


async def _aggregate_context(session: AsyncSession) -> dict[str, Any]:
    total = await session.scalar(select(func.count()).select_from(Conversation))
    completed = await session.scalar(
        select(func.count())
        .select_from(Conversation)
        .where(Conversation.analysis_status == "completed")
    )
    insights = list(
        await session.scalars(select(Insight).where(Insight.is_active.is_(True)))
    )
    questions = list(
        await session.scalars(
            select(QualifyingQuestion).where(QualifyingQuestion.is_active.is_(True))
        )
    )
    conversations = list(await session.scalars(select(Conversation)))

    insight_distributions: dict[str, dict[str, int]] = {}
    for insight in insights:
        counts: dict[str, int] = {}
        for conversation in conversations:
            result = (conversation.insight_results or {}).get(str(insight.id))
            value = str(result.get("value") or "") if isinstance(result, dict) else ""
            normalized = " ".join(value.split()).casefold() or "No value"
            counts[normalized] = counts.get(normalized, 0) + 1
        insight_distributions[insight.name] = counts

    qualifying_summaries: dict[str, dict[str, int]] = {}
    for question in questions:
        counts: dict[str, int] = {}
        for conversation in conversations:
            value = (conversation.qualifying_results or {}).get(str(question.id))
            normalized = "Not answered" if value is None else str(value)
            normalized = " ".join(normalized.split()).casefold()
            counts[normalized] = counts.get(normalized, 0) + 1
        qualifying_summaries[question.question_text] = counts

    return {
        "conversation_count": total or 0,
        "completed_analysis_count": completed or 0,
        "insight_distributions": insight_distributions,
        "qualifying_summaries": qualifying_summaries,
    }


async def _tool_snapshot(
    session: AsyncSession,
    *,
    scoped_conversation_id: UUID | None,
) -> dict[str, Any]:
    statement = (
        select(Conversation)
        .options(selectinload(Conversation.messages))
        .order_by(Conversation.created_at.desc())
    )
    if scoped_conversation_id is not None:
        statement = statement.where(Conversation.id == scoped_conversation_id)
    conversations = list(await session.scalars(statement))
    aggregate = (
        {} if scoped_conversation_id is not None else await _aggregate_context(session)
    )
    return {"conversations": conversations, "aggregate": aggregate}


def _ranked_message_matches(
    conversations: list[Conversation],
    query: str,
    *,
    limit: int,
) -> list[dict[str, Any]]:
    query_tokens = _tokens(query)
    if not query_tokens:
        return []
    matches: list[tuple[int, datetime_key, dict[str, Any]]] = []
    for conversation in conversations:
        conversation_tokens = _tokens(f"{conversation.title} {conversation.session_id}")
        for message in conversation.messages:
            haystack = f"{message.speaker} {message.text}"
            message_tokens = _tokens(haystack)
            overlap = query_tokens & (message_tokens | conversation_tokens)
            if not overlap:
                continue
            score = len(overlap) * 5
            if query.casefold() in haystack.casefold():
                score += 12
            if query_tokens & conversation_tokens:
                score += 3
            matches.append(
                (
                    score,
                    (message.created_at, message.row_index),
                    {
                        **_conversation_ref(conversation),
                        "message_id": str(message.id),
                        "row_index": message.row_index,
                        "speaker": message.speaker,
                        "snippet": _snippet(message.text, query_tokens),
                        "score": score,
                    },
                )
            )
    matches.sort(key=lambda item: (item[0], item[1]), reverse=True)
    return [item[2] for item in matches[:limit]]


datetime_key = tuple[Any, int]


def _collect_citation(
    citations: dict[str, dict[str, str]],
    conversation: Conversation | None,
) -> None:
    if conversation is None:
        return
    citations[str(conversation.id)] = _conversation_ref(conversation)


def _tool_summary(name: str, payload: Any) -> str:
    if isinstance(payload, list):
        return f"{name}: {len(payload)} result{'s' if len(payload) != 1 else ''}"
    if isinstance(payload, dict):
        if "error" in payload:
            return f"{name}: {payload['error']}"
        if "conversation_count" in payload:
            return f"{name}: {payload['conversation_count']} conversations"
        if "title" in payload:
            return f"{name}: {payload['title']}"
    return name


async def stream_chat_response(
    session: AsyncSession,
    thread: ChatThread,
    user_message: str,
    *,
    current_user_message_id: UUID | None = None,
) -> AsyncIterator[ChatAgentEvent | ChatAgentFinal]:
    settings = get_settings()
    scoped_conversation_id = (
        thread.conversation_id if thread.scope == "single" else None
    )
    yield ChatAgentEvent("status", {"message": "Preparing conversation context"})
    snapshot = await _tool_snapshot(
        session,
        scoped_conversation_id=scoped_conversation_id,
    )
    conversations: list[Conversation] = snapshot["conversations"]
    conversations_by_id = {str(item.id): item for item in conversations}
    tool_events: dict[str, dict[str, Any]] = {}
    citations: dict[str, dict[str, str]] = {}

    queue: asyncio.Queue[ChatAgentEvent | ChatAgentFinal | BaseException] = (
        asyncio.Queue()
    )
    loop = asyncio.get_running_loop()

    def emit(event: str, data: dict[str, Any]) -> None:
        loop.call_soon_threadsafe(queue.put_nowait, ChatAgentEvent(event, data))

    def run_tool(
        name: str,
        input_data: dict[str, Any],
        callback: Any,
    ) -> str:
        tool_id = str(uuid4())
        started = {
            "id": tool_id,
            "name": name,
            "status": "running",
            "input": input_data,
        }
        tool_events[tool_id] = started
        emit("tool_start", {"tool": started})
        try:
            payload = callback()
            summary = _tool_summary(name, payload)
            completed = {
                "id": tool_id,
                "name": name,
                "status": "completed",
                "input": input_data,
                "summary": summary,
            }
            tool_events[tool_id] = completed
            emit("tool_result", {"tool": completed})
            return _json(payload)
        except Exception as exc:
            logger.exception("Chat tool %s failed", name)
            failed = {
                "id": tool_id,
                "name": name,
                "status": "failed",
                "input": input_data,
                "summary": str(exc),
            }
            tool_events[tool_id] = failed
            emit("tool_result", {"tool": failed})
            return _json({"error": str(exc)})

    def list_conversations(limit: int = 50) -> str:
        """List imported conversations with title, session id, status, and size."""

        def body() -> list[dict[str, Any]]:
            bounded_limit = max(1, min(limit, 100))
            return [
                {
                    **_conversation_ref(item),
                    "analysis_status": item.analysis_status,
                    "message_count": item.message_count,
                }
                for item in conversations[:bounded_limit]
            ]

        return run_tool("list_conversations", {"limit": limit}, body)

    def get_conversation(conversation_id: str) -> str:
        """Get a full conversation transcript by conversation id."""

        def body() -> dict[str, Any]:
            if scoped_conversation_id is not None and conversation_id != str(
                scoped_conversation_id
            ):
                return {"error": "Conversation outside this chat scope"}
            conversation = conversations_by_id.get(conversation_id)
            if conversation is None:
                return {"error": "Conversation not found"}
            _collect_citation(citations, conversation)
            return {
                **_conversation_ref(conversation),
                "analysis_status": conversation.analysis_status,
                "transcript": _conversation_transcript(conversation),
            }

        return run_tool("get_conversation", {"conversation_id": conversation_id}, body)

    def search_transcripts(query: str, limit: int = 10) -> str:
        """Rank transcript snippets by query relevance."""

        def body() -> list[dict[str, Any]]:
            bounded_limit = max(1, min(limit, 20))
            matches = _ranked_message_matches(
                conversations,
                query,
                limit=bounded_limit,
            )
            for match in matches:
                conversation = conversations_by_id.get(match["conversation_id"])
                _collect_citation(citations, conversation)
            return matches

        return run_tool("search_transcripts", {"query": query, "limit": limit}, body)

    def get_analysis_results(conversation_id: str = "") -> str:
        """Get predefined insight and qualifying-question results."""

        def body() -> dict[str, Any] | list[dict[str, Any]]:
            if conversation_id:
                conversation = conversations_by_id.get(conversation_id)
                if conversation is None:
                    return {"error": "Conversation not found"}
                _collect_citation(citations, conversation)
                return {
                    **_conversation_ref(conversation),
                    "insight_results": _compact_results_map(
                        conversation.insight_results or {}
                    ),
                    "qualifying_results": _compact_results_map(
                        conversation.qualifying_results or {}
                    ),
                }
            results = []
            for conversation in conversations[:50]:
                if conversation.insight_results or conversation.qualifying_results:
                    _collect_citation(citations, conversation)
                    results.append(
                        {
                            **_conversation_ref(conversation),
                            "insight_results": _compact_results_map(
                                conversation.insight_results or {}
                            ),
                            "qualifying_results": _compact_results_map(
                                conversation.qualifying_results or {}
                            ),
                        }
                    )
            return results

        return run_tool(
            "get_analysis_results",
            {"conversation_id": conversation_id},
            body,
        )

    def compare_conversations(theme: str, limit: int = 5) -> str:
        """Find conversations relevant to a theme for comparison."""

        def body() -> list[dict[str, Any]]:
            matches = _ranked_message_matches(
                conversations,
                theme,
                limit=max(1, min(limit * 3, 30)),
            )
            grouped: dict[str, dict[str, Any]] = {}
            for match in matches:
                item = grouped.setdefault(
                    match["conversation_id"],
                    {
                        "conversation_id": match["conversation_id"],
                        "session_id": match["session_id"],
                        "title": match["title"],
                        "score": 0,
                        "snippets": [],
                    },
                )
                item["score"] += match["score"]
                if len(item["snippets"]) < 3:
                    item["snippets"].append(
                        {
                            "row_index": match["row_index"],
                            "speaker": match["speaker"],
                            "snippet": match["snippet"],
                        }
                    )
            ranked = sorted(
                grouped.values(),
                key=lambda item: item["score"],
                reverse=True,
            )[: max(1, min(limit, 10))]
            for item in ranked:
                _collect_citation(
                    citations, conversations_by_id.get(item["conversation_id"])
                )
            return ranked

        return run_tool("compare_conversations", {"theme": theme, "limit": limit}, body)

    def summarize_dataset() -> str:
        """Return aggregate counts and predefined analysis distributions."""
        return run_tool("summarize_dataset", {}, lambda: snapshot["aggregate"])

    history_messages = [
        message
        for message in thread.messages[-12:]
        if current_user_message_id is None or message.id != current_user_message_id
    ]
    history = "\n".join(
        f"{message.role}: {message.content}" for message in history_messages
    )
    if thread.scope == "single" and thread.conversation_id:
        conversation = conversations_by_id.get(str(thread.conversation_id))
        _collect_citation(citations, conversation)
        scope_context = (
            f"Scope: single conversation\n"
            f"Conversation: {conversation.title if conversation else 'Unknown'}\n"
            f"Session: {conversation.session_id if conversation else 'Unknown'}\n"
            f"Transcript:\n{_conversation_transcript(conversation) if conversation else ''}\n"
            f"Analysis:\n{_json(conversation.insight_results if conversation else {})}\n"
            f"Qualifying answers:\n"
            f"{_json(conversation.qualifying_results if conversation else {})}"
        )
        tools = [get_conversation, get_analysis_results, search_transcripts]
    else:
        notice = _analysis_notice(snapshot["aggregate"])
        scope_context = (
            "Scope: all conversations\n"
            f"Aggregate context:\n{_json(snapshot['aggregate'])}\n"
            f"{notice}\n"
            "Use tools before making dataset-level claims. Cite conversation "
            "titles or session IDs for evidence."
        )
        tools = [
            list_conversations,
            search_transcripts,
            get_conversation,
            get_analysis_results,
            compare_conversations,
            summarize_dataset,
        ]

    prompt = f"""
You are Conversational Analytics, an analyst for AI sales/product conversations.

Answer with concise, grounded observations. For analytical prompts, compare
patterns across conversations and include light citations using conversation
titles or session IDs. If evidence is thin, say so directly.

{scope_context}

Chat history:
{history}

User: {user_message}
"""

    client = genai.Client(api_key=settings.gemini_api_key)

    def run_model() -> None:
        answer_parts: list[str] = []
        try:
            emit("status", {"message": "Thinking through the evidence"})
            for chunk in client.models.generate_content_stream(
                model=settings.gemini_model,
                contents=prompt,
                config=types.GenerateContentConfig(
                    tools=tools,
                    automatic_function_calling=types.AutomaticFunctionCallingConfig(
                        maximum_remote_calls=MAX_CHAT_TOOL_CALLS
                    ),
                    temperature=0.3,
                ),
            ):
                text = _response_text(chunk)
                if text:
                    answer_parts.append(text)
                    emit("token", {"text": text})

            answer = "".join(answer_parts).strip()
            if not answer:
                fallback = client.models.generate_content(
                    model=settings.gemini_model,
                    contents=(
                        f"{prompt}\n\nAnswer now without calling tools. "
                        "Use the available aggregate and transcript context."
                    ),
                    config=types.GenerateContentConfig(temperature=0.3),
                )
                answer = _response_text(fallback) or ""
                if answer:
                    emit("token", {"text": answer})
            if not answer:
                raise RuntimeError("Gemini did not return a text response.")
            loop.call_soon_threadsafe(
                queue.put_nowait,
                ChatAgentFinal(
                    answer=answer,
                    meta={
                        "tool_events": list(tool_events.values()),
                        "citations": list(citations.values()),
                    },
                ),
            )
        except BaseException as exc:
            loop.call_soon_threadsafe(queue.put_nowait, exc)

    worker = asyncio.create_task(asyncio.to_thread(run_model))
    try:
        while True:
            item = await queue.get()
            if isinstance(item, BaseException):
                raise item
            yield item
            if isinstance(item, ChatAgentFinal):
                break
    finally:
        if not worker.done():
            worker.cancel()
