"""Test fixtures. Tests run against a real Postgres (jsonb, text[]), default `vyuh_test`
from docker compose. Override with TEST_DATABASE_URL (CI does)."""

import json
import os
from collections.abc import Callable, Iterator
from pathlib import Path
from typing import Any

import pytest
from alembic import command
from alembic.config import Config
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from app.core.config import AuthMode, Env, Settings
from app.core.security import create_local_token, local_auth_id
from app.main import create_app
from app.models import Base, Scenario, Unit, User
from app.schemas.generated import UserRole
from app.seed.scenarios import seed_scenarios

API_DIR = Path(__file__).resolve().parent.parent
TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL", "postgresql+psycopg://vyuh:vyuh@localhost:5432/vyuh_test"
)
TEST_SECRET = "test-secret-" + "x" * 40

# Code that calls get_settings() directly (e.g. the generator's TERRAIN_DIR) must not
# depend on the developer's .env: environment variables take precedence over it.
os.environ["AUTH_MODE"] = "local"
os.environ["LOCAL_JWT_SECRET"] = TEST_SECRET


def make_settings(**overrides: Any) -> Settings:
    values: dict[str, Any] = {
        "env": Env.DEV,
        "database_url": TEST_DATABASE_URL,
        "auth_mode": AuthMode.LOCAL,
        "local_jwt_secret": SecretStr(TEST_SECRET),
        "cors_origins": ["http://localhost:3000"],
        "log_level": "WARNING",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)  # type: ignore[call-arg]


def alembic_config() -> Config:
    cfg = Config(str(API_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(API_DIR / "alembic"))
    cfg.attributes["database_url"] = TEST_DATABASE_URL
    return cfg


@pytest.fixture(scope="session", autouse=True)
def migrated_db() -> Iterator[None]:
    """Fresh schema via the real migrations (also proves downgrade works)."""
    cfg = alembic_config()
    command.downgrade(cfg, "base")
    command.upgrade(cfg, "head")
    yield


@pytest.fixture
def settings() -> Settings:
    return make_settings()


@pytest.fixture
def app(settings: Settings) -> Iterator[FastAPI]:
    application = create_app(settings)
    yield application
    application.state.engine.dispose()


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def db(app: FastAPI) -> Iterator[Session]:
    with app.state.session_factory() as session:
        yield session
        session.rollback()
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        session.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        session.commit()


@pytest.fixture
def make_user(db: Session) -> Callable[..., User]:
    def _make(role: UserRole = UserRole.TRAINEE, email: str = "trainee@test", **kw: Any) -> User:
        user = User(auth_id=local_auth_id(email), name=email.split("@")[0], email=email, **kw)
        user.role = role
        db.add(user)
        db.commit()
        db.refresh(user)
        return user

    return _make


@pytest.fixture
def unit(db: Session) -> Unit:
    u = Unit(name="Test Unit")
    db.add(u)
    db.commit()
    return u


@pytest.fixture
def staff_for(db: Session, make_user: Callable[..., User]) -> Callable[..., User]:
    """An instructor of `subject`'s unit (instructors see their own unit only, Phase 6E);
    gives the subject a unit first if it has none."""

    def _make(subject: User, email: str = "instructor@test") -> User:
        if subject.unit_id is None:
            u = Unit(name=f"Unit of {subject.name}")
            db.add(u)
            db.flush()
            subject.unit_id = u.id
            db.commit()
        return make_user(UserRole.INSTRUCTOR, email, unit_id=subject.unit_id)

    return _make


@pytest.fixture
def auth_header(settings: Settings) -> Callable[[User], dict[str, str]]:
    def _header(user: User) -> dict[str, str]:
        return {"Authorization": f"Bearer {create_local_token(user.auth_id, settings)}"}

    return _header


def assert_error(response: Any, status: int, code: str) -> dict[str, Any]:
    assert response.status_code == status, response.text
    body = response.json()
    assert set(body) == {"error"}
    assert set(body["error"]) == {"code", "message", "details"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str)
    assert isinstance(body["error"]["details"], dict)
    return body["error"]


# ---- scenarios & sessions ------------------------------------------------------

FIXTURES = Path(__file__).resolve().parent / "fixtures"


def fixture_log(name: str) -> list[dict[str, Any]]:
    """Real sim event log recorded by packages/sim-core/scripts/export-api-fixtures.ts."""
    return json.loads((FIXTURES / f"{name}.json").read_text(encoding="utf-8"))


@pytest.fixture
def scenarios(db: Session) -> dict[str, Scenario]:
    """The scripted scenarios, seeded; keyed by code."""
    seed_scenarios(db)
    db.commit()
    return {row.code: row for row in db.scalars(select(Scenario)) if row.code}


@pytest.fixture
def start_session(
    client: TestClient, auth_header: Callable[[User], dict[str, str]]
) -> Callable[..., str]:
    def _start(user: User, scenario: Scenario, mode: str = "PRACTICE") -> str:
        response = client.post(
            "/api/v1/sessions",
            json={"scenarioId": str(scenario.id), "mode": mode, "simVersion": 1},
            headers=auth_header(user),
        )
        assert response.status_code == 201, response.text
        return response.json()["sessionId"]

    return _start
