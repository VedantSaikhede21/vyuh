"""Error envelope (SPEC §11.2): every error is `{"error": {"code", "message", "details"}}`."""

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.core.logging import request_id_ctx
from app.schemas.generated import ErrorBody, ErrorCode, ErrorEnvelope

logger = logging.getLogger(__name__)

# Mirrors ERROR_HTTP_STATUS in packages/shared/src/enums.ts (checked by tests).
ERROR_HTTP_STATUS: dict[ErrorCode, int] = {
    ErrorCode.VALIDATION_ERROR: 422,
    ErrorCode.IMPLAUSIBLE_EVENTS: 422,
    ErrorCode.UNAUTHORIZED: 401,
    ErrorCode.FORBIDDEN: 403,
    ErrorCode.NOT_FOUND: 404,
    ErrorCode.SESSION_NOT_ACTIVE: 409,
    ErrorCode.RATE_LIMITED: 429,
    ErrorCode.LLM_UNAVAILABLE: 503,
    ErrorCode.INTERNAL: 500,
}

_HTTP_TO_CODE: dict[int, ErrorCode] = {
    401: ErrorCode.UNAUTHORIZED,
    403: ErrorCode.FORBIDDEN,
    404: ErrorCode.NOT_FOUND,
    405: ErrorCode.NOT_FOUND,
    409: ErrorCode.SESSION_NOT_ACTIVE,
    422: ErrorCode.VALIDATION_ERROR,
    429: ErrorCode.RATE_LIMITED,
}


class ApiError(Exception):
    """Raise from routes/services to return a §11.2 error."""

    def __init__(
        self, code: ErrorCode, message: str, details: dict[str, Any] | None = None
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.details = details or {}

    @property
    def status_code(self) -> int:
        return ERROR_HTTP_STATUS[self.code]


def error_response(
    code: ErrorCode,
    message: str,
    details: dict[str, Any] | None = None,
    status_code: int | None = None,
    headers: dict[str, str] | None = None,
) -> JSONResponse:
    body = ErrorEnvelope(error=ErrorBody(code=code, message=message, details=details or {}))
    return JSONResponse(
        status_code=status_code or ERROR_HTTP_STATUS[code],
        content=body.model_dump(mode="json", by_alias=True),
        headers=headers,
    )


async def _api_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, ApiError)  # noqa: S101
    headers = {"WWW-Authenticate": "Bearer"} if exc.code is ErrorCode.UNAUTHORIZED else None
    return error_response(exc.code, exc.message, exc.details, headers=headers)


async def _validation_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, RequestValidationError)  # noqa: S101
    # Never echo submitted input back (could contain PII); location + reason only.
    errors = [
        {"loc": list(e.get("loc", ())), "msg": e.get("msg", ""), "type": e.get("type", "")}
        for e in exc.errors()
    ]
    return error_response(
        ErrorCode.VALIDATION_ERROR, "Request validation failed", {"errors": errors}
    )


async def _http_error(_: Request, exc: Exception) -> JSONResponse:
    assert isinstance(exc, StarletteHTTPException)  # noqa: S101
    code = _HTTP_TO_CODE.get(exc.status_code, ErrorCode.INTERNAL)
    message = exc.detail if isinstance(exc.detail, str) else "HTTP error"
    return error_response(code, message, status_code=exc.status_code, headers=exc.headers)


async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
    # Runs outside the request-id middleware, so read the id from request state.
    request_id = getattr(request.state, "request_id", None) or request_id_ctx.get()
    logger.exception("Unhandled error", exc_info=exc)
    return error_response(ErrorCode.INTERNAL, "Internal server error", {"requestId": request_id})


def install_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(ApiError, _api_error)
    app.add_exception_handler(RequestValidationError, _validation_error)
    app.add_exception_handler(StarletteHTTPException, _http_error)
    app.add_exception_handler(Exception, _unhandled)
