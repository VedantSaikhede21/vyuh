"""Config guards, generated schemas, migrations and seed."""

import json
from pathlib import Path

import pytest
from alembic import command
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import AuthMode, Env
from app.models import Unit, User
from app.schemas.generated import EventBatchRequest, Scenario, UserRole
from app.seed.demo import DEMO_USERS, seed_units, seed_users
from tests.conftest import alembic_config, make_settings

REPO = Path(__file__).resolve().parents[3]
EXAMPLE = REPO / "packages" / "shared" / "examples" / "scenario-s04-night-drop.json"
GENERATED = REPO / "apps" / "api" / "app" / "schemas" / "generated" / "models.py"


# ---- config -------------------------------------------------------------------


def test_prod_requires_supabase() -> None:
    with pytest.raises(ValidationError, match="ENV=prod requires AUTH_MODE=supabase"):
        make_settings(env=Env.PROD)


def test_local_secret_min_length() -> None:
    with pytest.raises(ValidationError, match="at least 32 bytes"):
        make_settings(local_jwt_secret="short")


def test_supabase_jwks_url_derived() -> None:
    s = make_settings(auth_mode=AuthMode.SUPABASE, supabase_url="https://p.supabase.co/")
    assert s.supabase_jwks_url == "https://p.supabase.co/auth/v1/.well-known/jwks.json"
    assert s.supabase_issuer == "https://p.supabase.co/auth/v1"
    with pytest.raises(ValidationError, match="SUPABASE_URL or SUPABASE_JWKS_URL"):
        make_settings(auth_mode=AuthMode.SUPABASE)


def test_env_parsing(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CORS_ORIGINS", "http://a.test, http://b.test/")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:p@h:5432/d")
    monkeypatch.setenv("LOCAL_JWT_SECRET", "z" * 32)
    from app.core.config import Settings

    s = Settings(_env_file=None)  # type: ignore[call-arg]
    assert s.cors_origins == ["http://a.test", "http://b.test"]
    assert s.database_url == "postgresql+psycopg://u:p@h:5432/d"
    assert s.auth_mode is AuthMode.LOCAL
    assert s.llm_enabled is False


# ---- generated schemas ------------------------------------------------------------


def test_generated_models_validate_example_scenario() -> None:
    scenario = Scenario.model_validate(json.loads(EXAMPLE.read_text(encoding="utf-8")))
    assert scenario.contacts[0].class_.value == "QUAD_HEAVY"
    dumped = scenario.model_dump(mode="json", by_alias=True, exclude_none=True)
    assert dumped["schemaVersion"] == 1 and "durationS" in dumped


def test_generated_models_reject_invalid() -> None:
    with pytest.raises(ValidationError):
        Scenario.model_validate({"id": "x"})
    with pytest.raises(ValidationError):
        EventBatchRequest.model_validate(
            {"batchSeq": 0, "events": [{"seq": 1, "tMs": 0, "type": "CLASSIFIED", "payload": {}}]}
        )


def test_generated_file_has_header() -> None:
    assert GENERATED.read_text(encoding="utf-8").startswith("# GENERATED FILE — DO NOT EDIT.")


# ---- migrations & seed -----------------------------------------------------------


def test_models_match_migrations() -> None:
    command.check(alembic_config())  # raises if autogenerate would emit operations


def test_seed_is_idempotent(db: Session) -> None:
    units = seed_units(db)
    assert seed_users(db, units) == len(DEMO_USERS)
    db.commit()
    assert seed_users(db, seed_units(db)) == 0
    db.commit()
    assert db.scalar(select(func.count()).select_from(Unit)) == 2
    assert db.scalar(select(func.count()).select_from(User)) == 8
    admin = db.scalar(select(User).where(User.email == "admin@demo"))
    assert admin is not None and admin.role is UserRole.ADMIN
    assert admin.auth_id == "local:admin@demo"
