"""POST /sessions/{id}/resume (system plan S2): counted, owner only, ACTIVE only."""

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import TrainingSession, User
from app.schemas.generated import SessionStatus
from tests.conftest import assert_error

Headers = Callable[[User], dict[str, str]]


def _session(
    client: TestClient, scenario: ScenarioRow, headers: dict[str, str], db: Session
) -> TrainingSession:
    res = client.post(
        "/api/v1/sessions",
        json={"scenarioId": str(scenario.id), "mode": "ASSESSMENT", "simVersion": 7},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    row = db.get(TrainingSession, res.json()["sessionId"])
    assert row is not None
    row.status = SessionStatus.ACTIVE
    db.commit()
    return row


def test_resume_is_counted_and_shown_in_the_session(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
) -> None:
    user = make_user()
    headers = auth_header(user)
    row = _session(client, scenarios["S01"], headers, db)
    for count in (1, 2):
        res = client.post(f"/api/v1/sessions/{row.id}/resume", headers=headers)
        assert res.status_code == 200, res.text
        assert res.json()["resumeCount"] == count
    db.refresh(row)
    assert len(row.resumed_at) == 2
    assert client.get(f"/api/v1/sessions/{row.id}", headers=headers).json()["resumeCount"] == 2


def test_resume_is_refused_for_another_user_and_after_the_run(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
) -> None:
    owner = auth_header(make_user())
    row = _session(client, scenarios["S01"], owner, db)
    other: Any = client.post(
        f"/api/v1/sessions/{row.id}/resume", headers=auth_header(make_user(email="b@test"))
    )
    assert_error(other, 403, "FORBIDDEN")
    row.status = SessionStatus.COMPLETED
    db.commit()
    done = client.post(f"/api/v1/sessions/{row.id}/resume", headers=owner)
    assert_error(done, 409, "SESSION_NOT_ACTIVE")
