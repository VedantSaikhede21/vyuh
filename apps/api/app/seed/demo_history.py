"""Seed the demo history (SPEC §22, decision 125): ~40 Assessment sessions for
trainee1..6@demo and a few assignments, so trends and the unit dashboard are not empty.

Each session is a committed sim log (`seed/demo_sessions/*.json`, written by
`packages/sim-core/scripts/export-demo-sessions.ts` from a skill-scaled trainee
policy) played through the real ingest + scoring path: real logs, server scores,
replayable. Rows are flagged `is_demo` and dated on a fixed calendar so the
history reads the same on every machine.

Idempotent: rebuilt only when the logs or the scenarios they play changed.
"""

import hashlib
import json
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.core.security import local_auth_id
from app.models import Assignment, TrainingSession, Unit, User
from app.models import Scenario as ScenarioRow
from app.schemas.generated import (
    CompleteSessionRequest,
    CreateSessionRequest,
    EventBatchRequest,
)
from app.services import sessions

DEMO_DIR = Path(__file__).resolve().parent / "demo_sessions"
INSTRUCTOR_EMAIL = "instructor@demo"
#: Day 0 of the demo calendar (08:00 IST).
DAY0 = datetime(2026, 9, 7, 2, 30, tzinfo=UTC)
DAYS_BETWEEN_RUNS = 4
BATCH = 500

#: (scenario code, unit name or trainee email, created on day, due on day)
DEMO_ASSIGNMENTS: list[tuple[str, str, int, int]] = [
    ("S05", "Demo Unit Alpha", 5, 13),
    ("S07", "Demo Unit Bravo", 14, 53),
    ("S10", "trainee2@demo", 26, 59),
]


def _logs() -> dict[str, dict[str, Any]]:
    return {
        p.stem: json.loads(p.read_text(encoding="utf-8")) for p in sorted(DEMO_DIR.glob("*.json"))
    }


def _fingerprint(db: Session, logs: dict[str, dict[str, Any]]) -> str:
    h = hashlib.sha256()
    codes = sorted({log["scenarioCode"] for log in logs.values()})
    for code in codes:
        row = db.scalar(select(ScenarioRow).where(ScenarioRow.code == code))
        h.update(json.dumps([code, row.content if row else None], sort_keys=True).encode())
    for name, log in logs.items():
        h.update(json.dumps([name, log], sort_keys=True).encode())
    h.update(json.dumps(DEMO_ASSIGNMENTS).encode())
    return h.hexdigest()[:16]


def _user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.auth_id == local_auth_id(email)))


def started_at(trainee_no: int, index: int) -> datetime:
    """Run `index` of trainee N: every four days, each trainee at their own hour."""
    return DAY0 + timedelta(days=index * DAYS_BETWEEN_RUNS, hours=trainee_no - 1)


def _play(db: Session, user: User, log: dict[str, Any], fingerprint: str) -> None:
    row = db.scalar(select(ScenarioRow).where(ScenarioRow.code == log["scenarioCode"]))
    if row is None:
        raise ValueError(f"demo log: scenario {log['scenarioCode']} is not seeded")
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
    end_t = events[-1]["tMs"]
    sessions.complete_session(
        db,
        user,
        created.session_id,
        CompleteSessionRequest.model_validate(
            {"endTMs": end_t, "clientMeta": {"browser": "demo history"}}
        ),
    )
    session = db.get_one(TrainingSession, created.session_id)
    trainee_no = int(log["email"].split("@")[0].removeprefix("trainee"))
    start = started_at(trainee_no, log["index"])
    session.is_demo = True
    session.started_at = start
    session.last_batch_at = start + timedelta(milliseconds=end_t)
    session.ended_at = start + timedelta(milliseconds=end_t)
    session.client_meta = {"browser": "demo history", "demo": fingerprint}
    db.commit()


def _assignments(db: Session) -> None:
    instructor = _user(db, INSTRUCTOR_EMAIL)
    if instructor is None:
        return
    db.execute(delete(Assignment).where(Assignment.assigned_by == instructor.id))
    for code, target, created_day, due_day in DEMO_ASSIGNMENTS:
        scenario = db.scalar(select(ScenarioRow).where(ScenarioRow.code == code))
        if scenario is None:
            continue
        a = Assignment(
            scenario_id=scenario.id,
            assigned_by=instructor.id,
            created_at=DAY0 + timedelta(days=created_day),
            due_at=DAY0 + timedelta(days=due_day, hours=13, minutes=30),
        )
        if "@" in target:
            user = _user(db, target)
            if user is None:
                continue
            a.user_id = user.id
        else:
            unit = db.scalar(select(Unit).where(Unit.name == target))
            if unit is None:
                continue
            a.unit_id = unit.id
        db.add(a)
    db.commit()


def seed_demo_history(db: Session) -> int:
    """(Re)build the demo sessions and assignments; returns sessions (re)created."""
    logs = _logs()
    fingerprint = _fingerprint(db, logs)
    existing = db.scalars(select(TrainingSession).where(TrainingSession.is_demo.is_(True))).all()
    if len(existing) == len(logs) and all(
        (s.client_meta or {}).get("demo") == fingerprint for s in existing
    ):
        return 0
    db.execute(delete(TrainingSession).where(TrainingSession.is_demo.is_(True)))
    db.commit()
    played = 0
    for log in logs.values():
        user = _user(db, log["email"])
        if user is None:
            continue
        _play(db, user, log, fingerprint)
        played += 1
    _assignments(db)
    return played
