"""Elo on Assessment completion (SPEC §9.3, decision 129)."""

from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import RatingHistory, Scenario, User
from app.services.sessions import recompute_rating
from tests.conftest import fixture_log
from tests.test_sessions import post_batch

Headers = Callable[[User], dict[str, str]]


def _run(
    client: TestClient,
    start: Callable[..., str],
    user: User,
    headers: dict,
    scen: Scenario,
    mode: str,
) -> tuple[str, Any]:
    sid = start(user, scen, mode)
    log = fixture_log("s01_defended")
    log[0]["payload"]["mode"] = mode
    assert post_batch(client, sid, headers, 0, log).status_code == 200
    r = client.post(
        f"/api/v1/sessions/{sid}/complete",
        json={"endTMs": log[-1]["tMs"], "clientMeta": {}},
        headers=headers,
    )
    assert r.status_code == 200, r.text
    return sid, r.json()


def test_assessment_updates_rating_and_history(
    client: TestClient,
    db: Session,
    scenarios: dict[str, Scenario],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid, score = _run(client, start_session, user, headers, scenarios["S01"], "ASSESSMENT")
    assert score["total"] == 100
    # S01 is D1: D = 950, E = 0.5715, R' = 1000 + 32 * 0.4285 = 1013.7 → 1014.
    assert score["rating"] == {
        "before": 1000,
        "after": 1014,
        "scenarioRating": 950,
        "expected": 0.5715,
    }
    assert (score["recommendedDifficulty"], score["recommendationBasis"]) == (2, "ELO_V1")
    db.refresh(user)
    assert user.rating == 1014
    hist = db.scalars(select(RatingHistory).where(RatingHistory.user_id == user.id)).all()
    assert [(h.before, h.after, str(h.session_id)) for h in hist] == [(1000, 1014, sid)]

    # The session read and the trends carry the same change.
    detail = client.get(f"/api/v1/sessions/{sid}", headers=headers).json()
    assert detail["score"]["rating"]["after"] == 1014
    trends = client.get(f"/api/v1/aar/users/{user.id}/trends", headers=headers).json()
    assert trends["rating"] == 1014
    assert [(p["ratingBefore"], p["ratingAfter"]) for p in trends["points"]] == [(1000, 1014)]

    # A second Assessment chains from the new rating.
    _, second = _run(client, start_session, user, headers, scenarios["S01"], "ASSESSMENT")
    assert second["rating"]["before"] == 1014
    assert second["rating"]["after"] == 1014 + round(32 * (1 - second["rating"]["expected"]))


def test_practice_never_changes_rating(
    client: TestClient,
    db: Session,
    scenarios: dict[str, Scenario],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    _, score = _run(client, start_session, user, auth_header(user), scenarios["S01"], "PRACTICE")
    assert "rating" not in score
    db.refresh(user)
    assert user.rating == 1000
    assert db.scalars(select(RatingHistory).where(RatingHistory.user_id == user.id)).all() == []


def test_recompute_rating_after_delete(
    client: TestClient,
    db: Session,
    scenarios: dict[str, Scenario],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    from app.models import TrainingSession

    user = make_user()
    sid, _ = _run(client, start_session, user, auth_header(user), scenarios["S01"], "ASSESSMENT")
    db.refresh(user)
    assert user.rating == 1014
    db.delete(db.get(TrainingSession, __import__("uuid").UUID(sid)))
    db.flush()
    recompute_rating(db, user)
    assert user.rating == 1000
