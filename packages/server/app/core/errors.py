from typing import Any

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


class AppError(Exception):
    def __init__(
        self,
        error: str,
        message: str,
        status_code: int,
        details: dict[str, Any] | None = None,
    ) -> None:
        self.error = error
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


async def app_error_handler(_request: Request, exc: AppError) -> JSONResponse:
    payload: dict[str, Any] = {"error": exc.error, "message": exc.message}
    if exc.details:
        payload["details"] = exc.details
    return JSONResponse(payload, status_code=exc.status_code)


async def validation_error_handler(
    _request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    return JSONResponse(
        {
            "error": "ValidationError",
            "message": "Request validation failed",
            "details": {"errors": exc.errors()},
        },
        status_code=422,
    )


def not_found(resource: str, resource_id: str) -> AppError:
    return AppError(
        "NotFound",
        f"{resource} {resource_id} was not found",
        404,
        {"id": resource_id},
    )
