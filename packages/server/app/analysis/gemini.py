from __future__ import annotations

import asyncio
import json
from typing import Any

from google import genai
from google.genai import types

from app.core.config import get_settings
from models import Conversation, Insight, QualifyingQuestion


def _transcript(conversation: Conversation) -> str:
    lines: list[str] = []
    for message in conversation.messages:
        if message.text:
            lines.append(f"{message.speaker}: {message.text}")
    return "\n".join(lines)


def _json_from_text(text: str) -> dict[str, Any]:
    stripped = text.strip()
    if stripped.startswith("```"):
        stripped = stripped.strip("`")
        if stripped.startswith("json"):
            stripped = stripped[4:].strip()
    return json.loads(stripped)


async def analyze_conversation_with_gemini(
    conversation: Conversation,
    insights: list[Insight],
    questions: list[QualifyingQuestion],
) -> tuple[dict[str, Any], dict[str, Any]]:
    settings = get_settings()
    client = genai.Client(api_key=settings.gemini_api_key)
    insight_spec = [
        {"id": str(item.id), "name": item.name, "description": item.description}
        for item in insights
    ]
    question_spec = [
        {"id": str(item.id), "key": item.key, "question": item.question_text}
        for item in questions
    ]
    prompt = f"""
You analyze sales/product discovery transcripts.

Return strict JSON with this shape:
{{
  "insights": {{
    "<insight_id>": {{"value": "concise value", "explanation": "short explanation"}}
  }},
  "qualifying_questions": {{
    "<question_id>": "answer string or null"
  }}
}}

Every provided insight and question id must be present. Use null for unanswered
qualifying questions. Keep values concise.

Insights:
{json.dumps(insight_spec)}

Qualifying questions:
{json.dumps(question_spec)}

Transcript:
{_transcript(conversation)}
"""

    def call_model():
        return client.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=types.GenerateContentConfig(response_mime_type="application/json"),
        )

    response = await asyncio.to_thread(call_model)
    parsed = _json_from_text(response.text or "{}")

    raw_insights = parsed.get("insights") if isinstance(parsed, dict) else {}
    raw_questions = (
        parsed.get("qualifying_questions") if isinstance(parsed, dict) else {}
    )
    normalized_insights: dict[str, Any] = {}
    for insight in insights:
        key = str(insight.id)
        value = raw_insights.get(key) if isinstance(raw_insights, dict) else None
        if isinstance(value, dict):
            normalized_insights[key] = {
                "value": str(value.get("value") or ""),
                "explanation": str(value.get("explanation") or ""),
            }
        else:
            normalized_insights[key] = {
                "value": "",
                "explanation": "Gemini did not return this insight.",
            }

    normalized_questions: dict[str, str | None] = {}
    for question in questions:
        key = str(question.id)
        value = raw_questions.get(key) if isinstance(raw_questions, dict) else None
        normalized_questions[key] = None if value is None else str(value)

    return normalized_insights, normalized_questions
