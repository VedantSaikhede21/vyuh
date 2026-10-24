"""Structured (JSON-lines) logging with a per-request id. No PII in logs (SPEC §16)."""

import json
import logging
import sys
import time
import uuid
from collections.abc import Awaitable, Callable
from contextvars import ContextVar
from datetime import UTC, datetime

from fastapi import Request, Response

request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)

REQUEST_ID_HEADER = "X-Request-ID"
#: Test hook (decision 148): `template` forces the template debrief so e2e runs never
#: depend on (or spend) the LLM. Honoured only where dev login is (local auth, not prod).
TEST_DEBRIEF_HEADER = "X-Vyuh-Test-Debrief"
_MAX_REQUEST_ID_LEN = 64

logger = logging.getLogger("app.request")


class JsonFormatter(logging.Formatter):
    _EXTRA_KEYS = ("method", "path", "status", "duration_ms")

    def format(self, record: logging.LogRecord) -> str:
        entry: dict[str, object] = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_ctx.get(),
        }
        for key in self._EXTRA_KEYS:
            if hasattr(record, key):
                entry[key] = getattr(record, key)
        if record.exc_info:
            entry["exc"] = self.formatException(record.exc_info)
        return json.dumps(entry, default=str)


def configure_logging(level: str) -> None:
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger()
    root.handlers[:] = [handler]
    root.setLevel(level.upper())
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging.getLogger(name).handlers[:] = []
        logging.getLogger(name).propagate = name != "uvicorn.access"


def _clean_request_id(raw: str | None) -> str:
    if raw and len(raw) <= _MAX_REQUEST_ID_LEN and raw.replace("-", "").isalnum():
        return raw
    return uuid.uuid4().hex


async def request_id_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    request_id = _clean_request_id(request.headers.get(REQUEST_ID_HEADER))
    request.state.request_id = request_id  # survives for the outermost 500 handler
    token = request_id_ctx.set(request_id)
    start = time.perf_counter()
    status = 500
    try:
        response = await call_next(request)
        status = response.status_code
        response.headers[REQUEST_ID_HEADER] = request_id
        return response
    finally:
        logger.info(
            "request",
            extra={
                "method": request.method,
                "path": request.url.path,
                "status": status,
                "duration_ms": round((time.perf_counter() - start) * 1000, 1),
            },
        )
        request_id_ctx.reset(token)
