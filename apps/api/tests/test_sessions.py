"""POST /sessions, POST /sessions/{id}/events, GET /sessions/{id}."""

import json
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import SessionEvent, TrainingSession, User
from app.schemas.generated import SessionStatus, UserRole
from tests.conftest import assert_error, fixture_log

Headers = Callable[[User], dict[str, str]]


def post_batch(
    client: TestClient, sid: str, headers: dict[str, str], batch_seq: int, events: list[Any]
) -> Any:
    return client.post(
        f"/api/v1/sessions/{sid}/events",
        json={"batchSeq": batch_seq, "events": events},
        headers=headers,
    )


def test_create_session_returns_scenario(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
) -> None:
    user = make_user()
    response = client.post(
        "/api/v1/sessions",
        json={"scenarioId": str(scenarios["S01"].id), "mode": "ASSESSMENT", "simVersion": 7},
        headers=auth_header(user),
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["scenario"] == scenarios["S01"].content
    assert body["simVersion"] == 7
    row = db.get(TrainingSession, uuid.UUID(body["sessionId"]))
    assert row is not None
    assert row.sim_version == 7
    detail = client.get(f"/api/v1/sessions/{body['sessionId']}", headers=auth_header(user))
    assert detail.json()["simVersion"] == 7
    assert (row.user_id, row.status, row.mode.value) == (
        user.id,
        SessionStatus.CREATED,
        "ASSESSMENT",
    )


def test_create_session_unknown_scenario(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    response = client.post(
        "/api/v1/sessions",
        json={"scenarioId": str(uuid.uuid4()), "mode": "PRACTICE", "simVersion": 1},
        headers=auth_header(make_user()),
    )
    assert_error(response, 404, "NOT_FOUND")


@pytest.mark.parametrize("sim_version", [None, 0])
def test_create_session_requires_sim_version(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    sim_version: int | None,
) -> None:
    body: dict[str, object] = {"scenarioId": str(scenarios["S01"].id), "mode": "PRACTICE"}
    if sim_version is not None:
        body["simVersion"] = sim_version
    response = client.post("/api/v1/sessions", json=body, headers=auth_header(make_user()))
    assert_error(response, 422, "VALIDATION_ERROR")


def test_ingest_real_log_in_batches(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    sid = start_session(user, scenarios["S01"])
    log = fixture_log("s01_defended")
    headers = auth_header(user)

    first = post_batch(client, sid, headers, 0, log[:4])
    assert first.json() == {"accepted": 4, "lastSeq": 3}
    second = post_batch(client, sid, headers, 1, log[4:])
    assert second.json() == {"accepted": len(log) - 4, "lastSeq": len(log) - 1}

    row = db.get(TrainingSession, uuid.UUID(sid))
    db.refresh(row)
    assert row is not None
    assert (row.status, row.last_batch_seq) == (SessionStatus.ACTIVE, 1)
    stored = db.scalars(
        select(SessionEvent).where(SessionEvent.session_id == row.id).order_by(SessionEvent.seq)
    ).all()
    assert [e.seq for e in stored] == list(range(len(log)))
    created = next(e for e in stored if e.type == "SENSOR_TRACK_CREATED")
    assert (created.track_id, created.contact_id) == ("T001", "c01")
    assert "trackId" not in created.payload  # ids live only in columns


def test_resent_batch_is_ignored(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    sid = start_session(user, scenarios["S01"])
    log = fixture_log("s01_defended")
    headers = auth_header(user)
    assert post_batch(client, sid, headers, 0, log[:4]).json()["accepted"] == 4
    again = post_batch(client, sid, headers, 0, log[:4])
    assert again.status_code == 200
    assert again.json() == {"accepted": 0, "lastSeq": 3}
    count = db.scalar(select(func.count()).where(SessionEvent.session_id == uuid.UUID(sid)))
    assert count == 4


def test_implausible_batch_is_rejected_whole(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    sid = start_session(user, scenarios["S01"])
    log = fixture_log("s01_defended")
    gap = [log[0], log[2]]
    error = assert_error(
        post_batch(client, sid, auth_header(user), 0, gap), 422, "IMPLAUSIBLE_EVENTS"
    )
    assert error["details"]["violations"][0]["rule"] == "SEQ_NOT_CONTIGUOUS"
    assert db.scalar(select(func.count()).where(SessionEvent.session_id == uuid.UUID(sid))) == 0
    # Not consumed: the same batchSeq with good events is accepted.
    assert post_batch(client, sid, auth_header(user), 0, log[:2]).json()["accepted"] == 2


def test_schema_invalid_batch(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    sid = start_session(user, scenarios["S01"])
    bad = [{"seq": 0, "tMs": 0, "type": "TELEPORTED", "payload": {}}]
    assert_error(post_batch(client, sid, auth_header(user), 0, bad), 422, "VALIDATION_ERROR")
    too_big = [
        {"seq": i, "tMs": 0, "type": "TRACK_SELECTED", "trackId": "T1", "payload": {}}
        for i in range(501)
    ]
    assert_error(post_batch(client, sid, auth_header(user), 0, too_big), 422, "VALIDATION_ERROR")


def test_events_ownership_and_status(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    owner = make_user()
    other = make_user(email="other@test")
    instructor = make_user(UserRole.INSTRUCTOR, "instructor@test")
    sid = start_session(owner, scenarios["S01"])
    log = fixture_log("s01_defended")

    assert_error(post_batch(client, sid, auth_header(other), 0, log[:1]), 403, "FORBIDDEN")
    assert_error(post_batch(client, sid, auth_header(instructor), 0, log[:1]), 403, "FORBIDDEN")
    assert_error(
        post_batch(client, str(uuid.uuid4()), auth_header(owner), 0, log[:1]), 404, "NOT_FOUND"
    )
    assert_error(post_batch(client, sid, {}, 0, log[:1]), 401, "UNAUTHORIZED")

    row = db.get(TrainingSession, uuid.UUID(sid))
    assert row is not None
    row.status = SessionStatus.COMPLETED
    db.commit()
    error = assert_error(
        post_batch(client, sid, auth_header(owner), 0, log[:1]), 409, "SESSION_NOT_ACTIVE"
    )
    assert error["details"] == {"status": "COMPLETED"}


def test_get_session(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    owner = make_user()
    sid = start_session(owner, scenarios["S02"], "ASSESSMENT")
    body = client.get(f"/api/v1/sessions/{sid}", headers=auth_header(owner)).json()
    assert body["id"] == sid
    assert body["scenarioId"] == str(scenarios["S02"].id)
    assert body["scenarioName"] == "Two Axes"
    assert (body["mode"], body["status"]) == ("ASSESSMENT", "CREATED")
    assert body["endedAt"] is None  # explicit null, not omitted
    assert body["score"] is None

    instructor = make_user(UserRole.INSTRUCTOR, "instructor@test")
    assert client.get(f"/api/v1/sessions/{sid}", headers=auth_header(instructor)).status_code == 200
    other = make_user(email="other@test")
    assert_error(
        client.get(f"/api/v1/sessions/{sid}", headers=auth_header(other)), 403, "FORBIDDEN"
    )


# ---- complete + score ----------------------------------------------------------------


def _play(
    client: TestClient, sid: str, headers: dict[str, str], name: str = "s01_defended"
) -> list[Any]:
    log = fixture_log(name)
    assert post_batch(client, sid, headers, 0, log).status_code == 200
    return log


def _complete(client: TestClient, sid: str, headers: dict[str, str], end_t_ms: int) -> Any:
    return client.post(
        f"/api/v1/sessions/{sid}/complete",
        json={"endTMs": end_t_ms, "clientMeta": {"avgFps": 55, "browser": "Test"}},
        headers=headers,
    )


def test_complete_scores_on_server(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid = start_session(user, scenarios["S01"])
    log = _play(client, sid, headers)
    response = _complete(client, sid, headers, log[-1]["tMs"])
    assert response.status_code == 200, response.text
    score = response.json()
    assert score["total"] == 100
    assert score["componentMax"]["decision"] == 30
    assert score["treeVersion"] == "default_v1"
    assert "unavoidable" not in json.dumps(score)  # unset optionals are omitted, not null
    assert "null" not in json.dumps(score)

    row = db.get(TrainingSession, uuid.UUID(sid))
    db.refresh(row)
    assert row is not None
    assert row.status is SessionStatus.COMPLETED
    assert row.ended_at is not None
    assert row.client_meta == {"avgFps": 55, "browser": "Test"}

    detail = client.get(f"/api/v1/sessions/{sid}", headers=headers).json()
    assert detail["status"] == "COMPLETED"
    assert detail["score"] == score  # stored score reads back identically

    again = _complete(client, sid, headers, log[-1]["tMs"])
    assert_error(again, 409, "SESSION_NOT_ACTIVE")
    assert_error(post_batch(client, sid, headers, 1, []), 409, "SESSION_NOT_ACTIVE")


def test_complete_ignored_run_scores_zero(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid = start_session(user, scenarios["S01"])
    log = _play(client, sid, headers, "s01_ignored")
    score = _complete(client, sid, headers, log[-1]["tMs"]).json()
    assert score["total"] == 0
    assert score["perContact"][0]["leaves"] == ["MISSED"]
    assert score["perContact"][0]["outcome"] == "LEAKED"


def test_complete_rejects_unfinished_or_inconsistent_logs(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid = start_session(user, scenarios["S01"])
    log = fixture_log("s01_defended")
    post_batch(client, sid, headers, 0, log[:-1])  # no SESSION_ENDED yet
    error = assert_error(_complete(client, sid, headers, 100_000), 422, "IMPLAUSIBLE_EVENTS")
    assert {v["rule"] for v in error["details"]["violations"]} == {"NOT_ENDED"}

    post_batch(client, sid, headers, 1, log[-1:])
    error = assert_error(_complete(client, sid, headers, 1_000), 422, "IMPLAUSIBLE_EVENTS")
    assert {v["rule"] for v in error["details"]["violations"]} == {"END_TIME_MISMATCH"}
    assert _complete(client, sid, headers, log[-1]["tMs"]).status_code == 200


def test_complete_ownership_and_state(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    owner = make_user()
    sid = start_session(owner, scenarios["S01"])
    other = make_user(email="other@test")
    assert_error(_complete(client, sid, auth_header(other), 0), 403, "FORBIDDEN")
    # CREATED (no events yet) cannot be completed.
    assert_error(_complete(client, sid, auth_header(owner), 0), 409, "SESSION_NOT_ACTIVE")
