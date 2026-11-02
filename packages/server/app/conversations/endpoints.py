from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, File, Form, Query, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from fastapi import Depends

from app.conversations.importer import (
    SourceFile,
    import_sources,
    source_files_from_upload,
)
from app.conversations.repository import ConversationRepository
from app.conversations.schemas import (
    ConversationDetail,
    ConversationListResponse,
    ImportSummary,
)
from app.core.errors import AppError, not_found
from app.db.session import get_session

router = APIRouter(prefix="/conversations", tags=["conversations"])
SessionDep = Annotated[AsyncSession, Depends(get_session)]


@router.get("", response_model=ConversationListResponse)
async def list_conversations(
    session: SessionDep,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ConversationListResponse:
    items, total = await ConversationRepository(session).list_recent(
        limit=limit,
        offset=offset,
    )
    return ConversationListResponse(
        items=items, total=total, limit=limit, offset=offset
    )


@router.get("/{conversation_id}", response_model=ConversationDetail)
async def get_conversation(
    conversation_id: UUID, session: SessionDep
) -> ConversationDetail:
    conversation = await ConversationRepository(session).get_detail(conversation_id)
    if conversation is None:
        raise not_found("Conversation", str(conversation_id))
    return ConversationDetail.model_validate(conversation)


@router.post("/import", response_model=ImportSummary)
async def import_conversations(
    session: SessionDep,
    files: Annotated[list[UploadFile], File()],
    paths: Annotated[list[str] | None, Form()] = None,
) -> ImportSummary:
    sources: list[SourceFile] = []
    for index, uploaded in enumerate(files):
        filename = paths[index] if paths and index < len(paths) else uploaded.filename
        data = await uploaded.read()
        try:
            if uploaded.filename.lower().endswith(".zip"):
                sources.extend(source_files_from_upload(uploaded.filename, data))
            elif uploaded.filename.lower().endswith(".csv"):
                sources.append(SourceFile(filename or uploaded.filename, data))
            else:
                raise ValueError(f"{uploaded.filename} is not a .zip or .csv file")
        except Exception as exc:
            raise AppError("InvalidImport", str(exc), 422) from exc

    if not sources:
        raise AppError("InvalidImport", "No CSV transcripts were found", 422)
    return await import_sources(session, sources)


@router.delete("/{conversation_id}", status_code=204)
async def delete_conversation(conversation_id: UUID, session: SessionDep) -> None:
    repository = ConversationRepository(session)
    conversation = await repository.get(conversation_id)
    if conversation is None:
        raise not_found("Conversation", str(conversation_id))
    await repository.delete_with_single_threads(conversation)
