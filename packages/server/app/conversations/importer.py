from __future__ import annotations

import csv
import io
import json
import zipfile
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path, PurePosixPath
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.gemini import generate_short_title
from app.conversations.schemas import ImportFileResult, ImportSummary
from models import Conversation, Insight, Message, QualifyingQuestion


DEFAULT_INSIGHTS = [
    (
        "User sentiment",
        "Overall sentiment of the prospect or user during the conversation.",
    ),
    (
        "Purchase intent",
        "How likely the prospect appears to be to buy or continue evaluating.",
    ),
    (
        "Pain points",
        "The main operational, support, onboarding, or product-understanding pain points mentioned.",
    ),
]

DEFAULT_QUESTIONS = [
    ("role", "What is the user's role?"),
    ("budget", "What budget or pricing expectation did the user mention?"),
    ("timeline", "What timeline did the user mention?"),
]


@dataclass(frozen=True)
class SourceFile:
    filename: str
    data: bytes


@dataclass(frozen=True)
class ParsedMessage:
    speaker: str
    message_type: str
    text: str
    content: dict
    confidence: float | None
    created_at: datetime
    row_index: int


@dataclass(frozen=True)
class ParsedConversation:
    session_id: UUID
    title: str
    messages: list[ParsedMessage]


def _safe_zip_name(name: str) -> bool:
    path = PurePosixPath(name)
    if path.is_absolute() or ".." in path.parts:
        return False
    if any(part.startswith(".") for part in path.parts):
        return False
    if "__MACOSX" in path.parts:
        return False
    return path.suffix.lower() == ".csv"


def source_files_from_path(path: Path) -> list[SourceFile]:
    if path.is_dir():
        return [
            SourceFile(str(file.relative_to(path)), file.read_bytes())
            for file in sorted(path.rglob("*.csv"))
            if not any(part.startswith(".") for part in file.relative_to(path).parts)
        ]

    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as archive:
            return [
                SourceFile(info.filename, archive.read(info))
                for info in archive.infolist()
                if not info.is_dir() and _safe_zip_name(info.filename)
            ]

    if path.suffix.lower() == ".csv":
        return [SourceFile(path.name, path.read_bytes())]

    msg = f"Unsupported seed source {path}"
    raise ValueError(msg)


def source_files_from_upload(filename: str, data: bytes) -> list[SourceFile]:
    if filename.lower().endswith(".zip"):
        with zipfile.ZipFile(io.BytesIO(data)) as archive:
            return [
                SourceFile(info.filename, archive.read(info))
                for info in archive.infolist()
                if not info.is_dir() and _safe_zip_name(info.filename)
            ]
    if filename.lower().endswith(".csv"):
        return [SourceFile(filename, data)]
    msg = f"{filename} is not a .zip or .csv file"
    raise ValueError(msg)


def _parse_datetime(value: str) -> datetime:
    parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if parsed.tzinfo is None:
        msg = "created_at must include timezone information"
        raise ValueError(msg)
    return parsed


def _extract_text(content: dict) -> str:
    text = content.get("text")
    return text.strip() if isinstance(text, str) else ""


def parse_csv_transcript(source: SourceFile) -> ParsedConversation:
    try:
        text = source.data.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        msg = "file is not valid UTF-8"
        raise ValueError(msg) from exc

    reader = csv.DictReader(io.StringIO(text))
    required = {
        "session_id",
        "speaker",
        "message_type",
        "content",
        "confidence",
        "created_at",
    }
    if not reader.fieldnames or not required.issubset(set(reader.fieldnames)):
        msg = f"{source.filename} is missing required columns"
        raise ValueError(msg)

    session_id: UUID | None = None
    messages: list[ParsedMessage] = []
    first_user_text: str | None = None

    for row_index, row in enumerate(reader):
        try:
            row_session_id = UUID((row.get("session_id") or "").strip())
            if session_id is None:
                session_id = row_session_id
            elif row_session_id != session_id:
                msg = "file contains multiple session_id values"
                raise ValueError(msg)

            speaker = (row.get("speaker") or "").strip()
            if not speaker:
                msg = "speaker cannot be empty"
                raise ValueError(msg)

            raw_content = row.get("content") or ""
            content = json.loads(raw_content)
            if not isinstance(content, dict):
                msg = "content must be a JSON object"
                raise ValueError(msg)

            confidence_text = (row.get("confidence") or "").strip()
            confidence = float(confidence_text) if confidence_text else None
            created_at = _parse_datetime((row.get("created_at") or "").strip())
            message_text = _extract_text(content)
            if not message_text:
                continue
            if speaker == "user" and first_user_text is None and message_text:
                first_user_text = message_text

            messages.append(
                ParsedMessage(
                    speaker=speaker,
                    message_type=(row.get("message_type") or "").strip() or "text",
                    text=message_text,
                    content=content,
                    confidence=confidence,
                    created_at=created_at,
                    row_index=row_index,
                )
            )
        except Exception as exc:
            msg = f"{source.filename} row {row_index + 2}: {exc}"
            raise ValueError(msg) from exc

    if session_id is None or not messages:
        msg = f"{source.filename} contains no messages"
        raise ValueError(msg)

    title_source = first_user_text or str(session_id)
    title = title_source[:80] + ("..." if len(title_source) > 80 else "")
    return ParsedConversation(session_id=session_id, title=title, messages=messages)


async def import_sources(
    session: AsyncSession, sources: list[SourceFile]
) -> ImportSummary:
    results: list[ImportFileResult] = []
    imported = skipped = failed = 0

    for source in sources:
        try:
            parsed = parse_csv_transcript(source)
            exists = await session.scalar(
                select(Conversation.id).where(
                    Conversation.session_id == parsed.session_id
                )
            )
            if exists:
                skipped += 1
                results.append(
                    ImportFileResult(
                        filename=source.filename,
                        status="skipped",
                        session_id=parsed.session_id,
                        message_count=len(parsed.messages),
                    )
                )
                continue

            title_context = "\n".join(
                f"{message.speaker}: {message.text[:500]}"
                for message in parsed.messages[:12]
            )
            title = await generate_short_title(
                subject="conversation transcript",
                context=title_context,
                fallback=parsed.title,
            )
            conversation = Conversation(
                session_id=parsed.session_id,
                title=title,
                message_count=len(parsed.messages),
                analysis_status="pending",
                insight_results={},
                qualifying_results={},
            )
            conversation.messages = [
                Message(
                    speaker=message.speaker,
                    message_type=message.message_type,
                    text=message.text,
                    content=message.content,
                    confidence=message.confidence,
                    created_at=message.created_at,
                    row_index=message.row_index,
                )
                for message in parsed.messages
            ]
            session.add(conversation)
            imported += 1
            results.append(
                ImportFileResult(
                    filename=source.filename,
                    status="imported",
                    session_id=parsed.session_id,
                    message_count=len(parsed.messages),
                )
            )
        except Exception as exc:
            failed += 1
            results.append(
                ImportFileResult(
                    filename=source.filename, status="failed", error=str(exc)
                )
            )

    await session.flush()
    return ImportSummary(
        imported=imported, skipped=skipped, failed=failed, files=results
    )


async def seed_default_definitions(session: AsyncSession) -> None:
    for name, description in DEFAULT_INSIGHTS:
        existing = await session.scalar(select(Insight.id).where(Insight.name == name))
        if existing is None:
            session.add(Insight(name=name, description=description, is_active=True))

    for key, question_text in DEFAULT_QUESTIONS:
        existing = await session.scalar(
            select(QualifyingQuestion.id).where(QualifyingQuestion.key == key)
        )
        if existing is None:
            session.add(
                QualifyingQuestion(
                    key=key,
                    question_text=question_text,
                    is_active=True,
                )
            )
