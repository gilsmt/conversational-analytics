from __future__ import annotations

import asyncio
import json
from typing import Any

from google import genai
from google.genai import types

from app.core.config import get_settings
from models import ChatThread, Conversation, Message


def _response_text(response: types.GenerateContentResponse) -> str | None:
    parts = response.parts or []
    text = "".join(
        part.text
        for part in parts
        if isinstance(part.text, str)
        and not (isinstance(part.thought, bool) and part.thought)
    )
    return text.strip() or None


def _json_from_text(text: str) -> Any:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.startswith("json"):
            stripped = stripped[4:].strip()
    return json.loads(stripped)


def _message_excerpt(messages: list[Message], *, limit: int = 12) -> str:
    lines: list[str] = []
    for message in messages[:limit]:
        if message.text:
            lines.append(f"{message.speaker}: {message.text[:500]}")
    return "\n".join(lines)


async def generate_short_title(
    *,
    subject: str,
    context: str,
    fallback: str,
) -> str:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    prompt = f"""
Create a concise navigation title for this {subject}.

Rules:
- 3 to 7 words.
- No quotes.
- No trailing punctuation.
- Be specific to the content.

Content:
{context[:6000]}
"""

    def call_model() -> types.GenerateContentResponse:
        return client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(temperature=0.2),
        )

    try:
        response = await asyncio.to_thread(call_model)
        title = (_response_text(response) or "").splitlines()[0].strip().strip('"')
    except Exception:
        title = ""
    normalized = " ".join(title.split())
    return normalized[:80] if normalized else fallback


async def generate_conversation_title(
    *,
    messages: list[Message],
    fallback: str,
) -> str:
    return await generate_short_title(
        subject="conversation transcript",
        context=_message_excerpt(messages),
        fallback=fallback,
    )


async def generate_chat_title(
    *,
    thread: ChatThread,
    user_message: str,
    assistant_message: str,
    fallback: str,
) -> str:
    scope = "all conversations" if thread.scope == "all" else "one conversation"
    return await generate_short_title(
        subject="analytics chat",
        context=(
            f"Scope: {scope}\n"
            f"User request: {user_message}\n"
            f"Assistant answer: {assistant_message[:1600]}"
        ),
        fallback=fallback,
    )


async def generate_chat_suggestions(
    *,
    thread: ChatThread,
    conversations: list[Conversation],
    history: str,
) -> list[dict[str, str | None]]:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    scope = "all conversations" if thread.scope == "all" else "single conversation"
    conversation_context = [
        {
            "id": str(conversation.id),
            "session_id": str(conversation.session_id),
            "title": conversation.title,
            "analysis_status": conversation.analysis_status,
            "message_count": conversation.message_count,
        }
        for conversation in conversations[:30]
    ]
    prompt = f"""
Generate 4 useful next-step suggestion chips for a Conversational Analytics chat.

Return strict JSON array. Each item must be:
{{"label": "2-5 words", "prompt": "full user prompt", "scope": "all" or "single", "conversation_id": null or id}}

Make suggestions concrete and analytical, not generic.
Keep prompts short enough to fit into a chat composer.

Current scope: {scope}
Current chat history:
{history[-3000:]}

Available conversations:
{json.dumps(conversation_context)}
"""

    def call_model() -> types.GenerateContentResponse:
        return client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=0.4,
            ),
        )

    try:
        response = await asyncio.to_thread(call_model)
        parsed = _json_from_text(response.text or "[]")
    except Exception:
        return []
    if not isinstance(parsed, list):
        return []
    suggestions: list[dict[str, str | None]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        label = str(item.get("label") or "").strip()
        prompt_text = str(item.get("prompt") or "").strip()
        scope_value = str(item.get("scope") or thread.scope)
        conversation_id = item.get("conversation_id")
        if label and prompt_text and scope_value in {"all", "single"}:
            suggestions.append(
                {
                    "label": label[:48],
                    "prompt": prompt_text[:500],
                    "scope": scope_value,
                    "conversation_id": str(conversation_id)
                    if conversation_id
                    else None,
                }
            )
        if len(suggestions) >= 5:
            break
    return suggestions
