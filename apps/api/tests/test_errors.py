import re
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.core.errors import ERROR_HTTP_STATUS, ApiError
from app.schemas.generated import ErrorCode, ErrorEnvelope
from tests.conftest import assert_error

SHARED_ENUMS = Path(__file__).resolve().parents[3] / "packages" / "shared" / "src" / "enums.ts"


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    @app.get("/api/v1/_test/boom")
    def boom() -> None:
        raise RuntimeError("secret internal detail")

    @app.get("/api/v1/_test/conflict")
    def conflict() -> None:
        raise ApiError(ErrorCode.SESSION_NOT_ACTIVE, "Session is not active", {"status": "X"})

    return TestClient(app, raise_server_exceptions=False)


def test_unknown_route_is_not_found(client: TestClient) -> None:
    response = client.get("/api/v1/does-not-exist")
    assert_error(response, 404, "NOT_FOUND")
    ErrorEnvelope.model_validate(response.json())


def test_validation_error_envelope(client: TestClient) -> None:
    response = client.post("/api/v1/auth/dev-login", json={"mail": "x"})
    error = assert_error(response, 422, "VALIDATION_ERROR")
    assert error["details"]["errors"][0]["loc"] == ["body", "email"]
    assert "input" not in error["details"]["errors"][0]


def test_api_error_envelope(client: TestClient) -> None:
    error = assert_error(client.get("/api/v1/_test/conflict"), 409, "SESSION_NOT_ACTIVE")
    assert error["details"] == {"status": "X"}


def test_unhandled_error_is_internal_without_leaking(client: TestClient) -> None:
    response = client.get("/api/v1/_test/boom", headers={"X-Request-ID": "req-42"})
    error = assert_error(response, 500, "INTERNAL")
    assert "secret" not in response.text
    assert error["details"]["requestId"] == "req-42"


def test_status_map_matches_shared_ts() -> None:
    """ERROR_HTTP_STATUS in Python must mirror the one in packages/shared."""
    source = SHARED_ENUMS.read_text(encoding="utf-8")
    block = source.split("export const ERROR_HTTP_STATUS", 1)[1].split("}", 1)[0]
    ts_map = {code: int(status) for code, status in re.findall(r"(\w+):\s*(\d+)", block)}
    assert ts_map == {code.value: status for code, status in ERROR_HTTP_STATUS.items()}
    assert set(ERROR_HTTP_STATUS) == set(ErrorCode)
