from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from app.analysis.endpoints import router as analysis_router
from app.chat.endpoints import router as chat_router
from app.conversations.endpoints import router as conversations_router
from app.core.config import get_settings
from app.core.errors import AppError, app_error_handler, validation_error_handler
from app.insights.endpoints import router as insights_router
from app.qualifying_questions.endpoints import router as questions_router

settings = get_settings()

app = FastAPI(title="Conversational Analytics API", version="0.1.0")
app.add_exception_handler(AppError, app_error_handler)
app.add_exception_handler(RequestValidationError, validation_error_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

api_prefix = "/api/v1"
app.include_router(conversations_router, prefix=api_prefix)
app.include_router(insights_router, prefix=api_prefix)
app.include_router(questions_router, prefix=api_prefix)
app.include_router(analysis_router, prefix=api_prefix)
app.include_router(chat_router, prefix=api_prefix)


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "model": settings.gemini_model}
