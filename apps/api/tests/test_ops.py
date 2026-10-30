"""S4 durable limits, S9 client errors, S10 body limits (Part 6G)."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.errors import ApiError
from app.models import ClientError, User
from app.schemas.generated import UserRole
from app.services.ai.llm import LlmClient, LlmError
from app.services.ratelimit import LlmBudget, PostgresHits, RateLimiter
from tests.conftest import assert_error, make_settings

Headers = Callable[[User], dict[str, str]]

REPORT = {
    "route": "/train",
    "message": "boom",
    "stack": "at x",
    "userAgent": "Chrome",
    "webBuild": "abc",
    "simVersion": "6",
}


def factory(db: Session) -> sessionmaker[Session]:
    return sessionmaker(bind=db.get_bind(), autoflush=False, expire_on_commit=False)


def test_two_limiters_share_one_postgres_store(db: Session) -> None:
    store = PostgresHits(factory(db))
    a = RateLimiter(2, store=store)
    b = RateLimiter(2, store=store)
    a.check("shared-key")
    b.check("shared-key")
    with pytest.raises(ApiError):
        a.check("shared-key")
    b.check("another-key")


def test_memory_limiter_is_unchanged_without_a_store() -> None:
    limiter = RateLimiter(1, clock=lambda: 0.0)
    limiter.check("k")
    with pytest.raises(ApiError):
        limiter.check("k")


def test_llm_budget_stops_calls_and_the_reason_is_budget(db: Session) -> None:
    budget = LlmBudget(factory(db), daily_tokens=100)
    assert not budget.exceeded()
    budget.add(150)
    assert budget.exceeded()
    client = LlmClient(make_settings(llm_enabled=True, llm_api_key="k"), lambda *_: "{}")
    client.budget = budget
    with pytest.raises(LlmError) as err:
        client.complete_json("u", "s", "t", lambda o: o)
    assert err.value.reason == "BUDGET"


def test_zero_budget_means_no_limit(db: Session) -> None:
    budget = LlmBudget(factory(db), daily_tokens=0)
    budget.add(10_000_000)
    assert not budget.exceeded()


def test_client_error_is_stored_without_personal_fields(client: TestClient, db: Session) -> None:
    res = client.post("/api/v1/client-errors", json={**REPORT, "email": "a@b.c"})
    assert res.status_code in (204, 422), res.text
    assert client.post("/api/v1/client-errors", json=REPORT).status_code == 204
    row = db.query(ClientError).order_by(ClientError.id.desc()).first()
    assert row is not None
    assert row.message == "boom"
    assert row.user_id is None


def test_client_error_list_is_admin_only(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    trainee = auth_header(make_user())
    admin = auth_header(make_user(UserRole.ADMIN, email="admin@test"))
    assert_error(client.get("/api/v1/client-errors", headers=trainee), 403, "FORBIDDEN")
    assert client.get("/api/v1/client-errors", headers=admin).status_code == 200


def test_oversized_bodies_are_refused(client: TestClient) -> None:
    big: dict[str, Any] = {**REPORT, "stack": "x" * 70_000}
    assert client.post("/api/v1/client-errors", json=big).status_code == 413
