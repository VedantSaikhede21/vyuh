"""Abandonment (SPEC §4.5, Phase 4a Step 3): heartbeats, expiry on read, startup sweep."""

import uuid
from collections.abc import Callable
from datetime import UTC, datetime, timedelta

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import SessionEvent, TrainingSession, User
from app.schemas.generated import SessionStatus
from app.services.sessions import IDLE_LIMIT, expire_stale_sessions
from tests.conftest import assert_error, fixture_log
from tests.test_sessions import post_batch

Headers = Callable[[User], dict[str, str]]


def _active(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    start_session: Callable[..., str],
    user: User,
    headers: dict[str, str],
) -> str:
    sid = start_session(user, scenarios["S01"])
    events = fixture_log("s01_ignored")
    assert post_batch(client, sid, headers, 0, events[:2]).status_code == 200
    return sid


def _age(db: Session, sid: str, by: timedelta) -> None:
    row = db.get_one(TrainingSession, uuid.UUID(sid))
    row.last_batch_at = datetime.now(UTC) - by
    db.commit()


def test_heartbeat_keeps_a_session_alive_and_writes_no_rows(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid = _active(client, scenarios, start_session, user, headers)
    _age(db, sid, IDLE_LIMIT - timedelta(minutes=1))

    res = post_batch(client, sid, headers, 1, [])
    assert res.status_code == 200, res.text
    assert res.json() == {"accepted": 0, "lastSeq": 1}
    db.expire_all()
    row = db.get_one(TrainingSession, uuid.UUID(sid))
    assert row.last_batch_seq == 1 and row.status is SessionStatus.ACTIVE
    assert row.last_batch_at is not None
    assert datetime.now(UTC) - row.last_batch_at < timedelta(minutes=1)
    count = db.scalar(select(func.count()).where(SessionEvent.session_id == row.id))
    assert count == 2

    # The next real batch carries on after the heartbeat's batchSeq.
    events = fixture_log("s01_ignored")
    assert post_batch(client, sid, headers, 2, events[2:]).status_code == 200


def test_heartbeat_does_not_activate_a_created_session(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    sid = start_session(user, scenarios["S01"])
    assert post_batch(client, sid, auth_header(user), 0, []).status_code == 200
    db.expire_all()
    assert db.get_one(TrainingSession, uuid.UUID(sid)).status is SessionStatus.CREATED


def test_idle_session_is_abandoned_on_read_and_refuses_events(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid = _active(client, scenarios, start_session, user, headers)
    _age(db, sid, IDLE_LIMIT + timedelta(minutes=1))

    detail = client.get(f"/api/v1/sessions/{sid}", headers=headers).json()
    assert detail["status"] == "ABANDONED"
    assert detail["endedAt"] is not None
    err = assert_error(post_batch(client, sid, headers, 1, []), 409, "SESSION_NOT_ACTIVE")
    assert err["details"] == {"status": "ABANDONED"}
    body = {"endTMs": 1000, "clientMeta": {}}
    assert_error(
        client.post(f"/api/v1/sessions/{sid}/complete", json=body, headers=headers),
        409,
        "SESSION_NOT_ACTIVE",
    )


def test_idle_session_is_abandoned_when_events_arrive(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid = _active(client, scenarios, start_session, user, headers)
    _age(db, sid, IDLE_LIMIT + timedelta(seconds=5))
    events = fixture_log("s01_ignored")
    assert_error(post_batch(client, sid, headers, 1, events[2:]), 409, "SESSION_NOT_ACTIVE")


def test_startup_sweep_abandons_idle_active_sessions_only(
    app: FastAPI,
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    idle = _active(client, scenarios, start_session, user, headers)
    fresh = _active(client, scenarios, start_session, user, headers)
    created = start_session(user, scenarios["S01"])
    _age(db, idle, IDLE_LIMIT + timedelta(hours=3))
    # A session from before last_batch_at existed: judged by its start time.
    legacy = db.get_one(
        TrainingSession, uuid.UUID(_active(client, scenarios, start_session, user, headers))
    )
    legacy.last_batch_at = None
    legacy.started_at = datetime.now(UTC) - timedelta(days=2)
    db.commit()

    with TestClient(app):  # runs the lifespan startup sweep
        pass
    db.expire_all()
    status = {
        sid: db.get_one(TrainingSession, uuid.UUID(sid)).status
        for sid in (idle, fresh, created, str(legacy.id))
    }
    assert status == {
        idle: SessionStatus.ABANDONED,
        fresh: SessionStatus.ACTIVE,
        created: SessionStatus.CREATED,
        str(legacy.id): SessionStatus.ABANDONED,
    }
    assert expire_stale_sessions(db) == 0  # idempotent
