"""Seed the `e2e@demo` trainee with fixed completed sessions (Phase 4a Step 2).

Visual baselines log in as this user, so the training list's best scores never
depend on what was played locally. Each session comes from a committed sim log
(`seed/e2e/*.json`, written by `packages/sim-core/scripts/export-api-fixtures.ts`)
and goes through the real ingest + scoring path, so its score is server-computed.

Idempotent: the user's sessions are rebuilt only when the fixture set or a
scenario's content changed.
"""

import hashlib
import json
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import local_auth_id
from app.models import Scenario as ScenarioRow
from app.models import TrainingSession, Unit, User
from app.schemas.generated import (
    CompleteSessionRequest,
    CreateSessionRequest,
    EventBatchRequest,
    UserRole,
)
from app.services import sessions

E2E_EMAIL = "e2e@demo"
E2E_NAME = "E2E Trainee"
E2E_DIR = Path(__file__).resolve().parent / "e2e"
#: Plausibility limit on events per batch (SPEC §3.3).
BATCH = 500


def _fixtures() -> dict[str, dict[str, Any]]:
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(E2E_DIR.glob("*.json"))
    }


def _fingerprint(db: Session, fixtures: dict[str, dict[str, Any]]) -> str:
    """Changes when a fixture log or the content of a scenario it plays changes."""
    h = hashlib.sha256()
    for name, log in fixtures.items():
        row = db.scalar(select(ScenarioRow).where(ScenarioRow.code == log["scenarioCode"]))
        content = row.content if row is not None else None
        h.update(json.dumps([name, log, content], sort_keys=True).encode())
    return h.hexdigest()[:16]


def _ensure_user(db: Session, unit: Unit) -> User:
    user = db.scalar(select(User).where(User.auth_id == local_auth_id(E2E_EMAIL)))
    if user is None:
        user = User(auth_id=local_auth_id(E2E_EMAIL))
        db.add(user)
    user.name, user.email, user.role, user.unit_id = E2E_NAME, E2E_EMAIL, UserRole.TRAINEE, unit.id
    db.flush()
    return user


def _play(db: Session, user: User, name: str, log: dict[str, Any], fingerprint: str) -> None:
    row = db.scalar(select(ScenarioRow).where(ScenarioRow.code == log["scenarioCode"]))
    if row is None:
        raise ValueError(f"e2e fixture {name}: scenario {log['scenarioCode']} is not seeded")
    created = sessions.create_session(
        db,
        user,
        CreateSessionRequest.model_validate(
            {"scenarioId": str(row.id), "mode": log["mode"], "simVersion": log["simVersion"]}
        ),
    )
    events = log["events"]
    for i in range(0, len(events), BATCH):
        sessions.ingest_batch(
            db,
            user,
            created.session_id,
            EventBatchRequest.model_validate(
                {"batchSeq": i // BATCH, "events": events[i : i + BATCH]}
            ),
        )
    sessions.complete_session(
        db,
        user,
        created.session_id,
        CompleteSessionRequest.model_validate(
            {"endTMs": events[-1]["tMs"], "clientMeta": {"browser": f"e2e fixture {name}"}}
        ),
    )
    session = db.get_one(TrainingSession, created.session_id)
    session.client_meta = {"browser": f"e2e fixture {name}", "fixture": fingerprint}
    db.commit()


def seed_e2e_user(db: Session, unit: Unit) -> int:
    """Create or refresh `e2e@demo` and its fixed sessions; returns sessions (re)created."""
    user = _ensure_user(db, unit)
    fixtures = _fixtures()
    fingerprint = _fingerprint(db, fixtures)
    existing = db.scalars(select(TrainingSession).where(TrainingSession.user_id == user.id)).all()
    if len(existing) == len(fixtures) and all(
        (s.client_meta or {}).get("fixture") == fingerprint for s in existing
    ):
        return 0
    db.execute(delete(TrainingSession).where(TrainingSession.user_id == user.id))
    db.commit()
    for name, log in fixtures.items():
        _play(db, user, name, log, fingerprint)
    return len(fixtures)
