"""A run the trainee ends early is never a final score (SPEC §4.5, decision 173).

Threats still to come are left out of the score, so without this rule quitting at
once scored 100: every component had nothing to judge and fell back to full marks.
"""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import RatingHistory, ScoreRow, TrainingSession, User
from app.models import Scenario as ScenarioRow
from app.schemas.generated import SessionStatus
from tests.conftest import fixture_log

Headers = Callable[[User], dict[str, str]]
QUIT_AT_MS = 1000


def quit_log(mode: str) -> list[dict[str, Any]]:
    """The first second of a real run, then the trainee's End session."""
    log = [
        e
        for e in fixture_log("s01_ignored")
        if e["tMs"] <= QUIT_AT_MS and e["type"] != "SESSION_ENDED"
    ]
    log[0]["payload"]["mode"] = mode
    end = {
        "seq": len(log),
        "tMs": QUIT_AT_MS,
        "type": "SESSION_ENDED",
        "payload": {"reason": "ABORTED"},
    }
    return [*log, end]


def quit_run(client: TestClient, sid: str, headers: dict[str, str], mode: str = "PRACTICE") -> Any:
    batch = client.post(
        f"/api/v1/sessions/{sid}/events",
        json={"batchSeq": 0, "events": quit_log(mode)},
        headers=headers,
    )
    assert batch.status_code == 200, batch.text
    return client.post(
        f"/api/v1/sessions/{sid}/complete",
        json={"endTMs": QUIT_AT_MS, "clientMeta": {}},
        headers=headers,
    )


@pytest.fixture
def trainee(make_user: Callable[..., User]) -> User:
    return make_user()


def test_assessment_ended_early_is_stored_but_not_scored(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    trainee: User,
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    headers = auth_header(trainee)
    rating = trainee.rating
    sid = start_session(trainee, scenarios["S01"], "ASSESSMENT")

    response = quit_run(client, sid, headers, "ASSESSMENT")

    assert response.status_code == 204
    assert response.content == b""
    db.expire_all()
    row = db.scalar(select(TrainingSession).where(TrainingSession.user_id == trainee.id))
    assert row is not None
    assert row.status is SessionStatus.ABANDONED
    assert row.ended_early is True
    assert db.scalar(select(func.count()).select_from(ScoreRow)) == 0
    assert db.scalar(select(func.count()).select_from(RatingHistory)) == 0
    assert db.get_one(User, trainee.id).rating == rating

    detail = client.get(f"/api/v1/sessions/{sid}", headers=headers).json()
    assert detail["status"] == "ABANDONED"
    assert detail["score"] is None
    assert detail["ended"] == {"reason": "ABORTED", "tMs": QUIT_AT_MS}

    listed = client.get("/api/v1/scenarios", headers=headers).json()["items"]
    assert all(s["bestScore"] is None for s in listed)
    assert client.get("/api/v1/home", headers=headers).json()["recent"] == []
    assert client.get("/api/v1/aar/sessions/" + sid, headers=headers).status_code != 200


def test_practice_ended_early_keeps_feedback_without_a_final_score(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    trainee: User,
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    headers = auth_header(trainee)
    sid = start_session(trainee, scenarios["S01"], "PRACTICE")

    response = quit_run(client, sid, headers)

    assert response.status_code == 200
    assert response.json()["partial"] is True
    assert response.json()["perContact"]
    detail = client.get(f"/api/v1/sessions/{sid}", headers=headers).json()
    assert detail["status"] == "COMPLETED"
    assert detail["score"]["partial"] is True

    listed = client.get("/api/v1/scenarios", headers=headers).json()["items"]
    assert all(s["bestScore"] is None for s in listed)
    assert client.get("/api/v1/home", headers=headers).json()["recent"] == []


def test_partial_debrief_is_the_template_and_claims_no_score(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    trainee: User,
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    headers = auth_header(trainee)
    sid = start_session(trainee, scenarios["S01"], "PRACTICE")
    quit_run(client, sid, headers)

    body = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=headers).json()

    assert body["source"] == "TEMPLATE"
    assert body["fallbackReason"] == "ENDED_EARLY"
    summary = body["content"]["summary"]
    assert summary.startswith("Partial run on S01")
    assert "/ 100" not in summary
    assert not any("points" in s for s in body["content"]["strengths"])


def test_a_run_played_to_the_end_is_not_partial(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    trainee: User,
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    headers = auth_header(trainee)
    sid = start_session(trainee, scenarios["S01"], "PRACTICE")
    log = fixture_log("s01_ignored")
    client.post(
        f"/api/v1/sessions/{sid}/events", json={"batchSeq": 0, "events": log}, headers=headers
    )
    score = client.post(
        f"/api/v1/sessions/{sid}/complete",
        json={"endTMs": log[-1]["tMs"], "clientMeta": {}},
        headers=headers,
    ).json()
    assert "partial" not in score
    assert score["total"] == 0
