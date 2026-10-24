"""One rounding rule for every score shown (audit P0-4, decision 149)."""

from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient

from app.models import Scenario, User
from app.services.display import display_int, display_opt, display_round
from tests.conftest import fixture_log
from tests.test_sessions import post_batch


@pytest.mark.parametrize(
    ("value", "digits", "expected"),
    [
        (62.5, 0, 63),  # the audit case: half up, not Python's half to even (62)
        (63.5, 0, 64),
        (62.49, 0, 62),
        (0.5, 0, 1),
        (100.0, 0, 100),
        (12.25, 1, 12.3),  # on the written decimal, not the binary float
        (12.35, 1, 12.4),
        (0.05, 1, 0.1),
    ],
)
def test_half_up(value: float, digits: int, expected: float) -> None:
    assert display_round(value, digits) == expected


def test_int_helpers() -> None:
    assert display_int(62.5) == 63 and isinstance(display_int(62.5), int)
    assert display_opt(None) is None
    assert display_opt(-0.5) == -1  # a change (trend delta) rounds away from zero


def test_session_score_carries_display_and_recommendation_rating(
    client: TestClient,
    scenarios: dict[str, Scenario],
    make_user: Callable[..., User],
    auth_header: Callable[[User], dict[str, str]],
    start_session: Callable[..., str],
) -> None:
    user = make_user(email="display@test")
    h = auth_header(user)
    sid = start_session(user, scenarios["S06"], "ASSESSMENT")
    log = fixture_log("s06_roe_attempts")
    assert post_batch(client, sid, h, 0, log).status_code == 200
    r = client.post(
        f"/api/v1/sessions/{sid}/complete",
        json={"endTMs": log[-1]["tMs"], "clientMeta": {}},
        headers=h,
    )
    assert r.status_code == 200, r.text
    score = client.get(f"/api/v1/sessions/{sid}", headers=h).json()["score"]
    assert score["display"]["total"] == display_int(score["total"])
    for c, v in score["components"].items():
        assert score["display"]["components"][c] == display_round(v, 1)
    # Assessment: recommended from the rating after this session.
    assert score["recommendationRating"] == score["rating"]["after"]
    # The template debrief quotes the same number.
    debrief = client.post(f"/api/v1/aar/sessions/{sid}/debrief", headers=h).json()
    assert debrief["content"]["summary"].startswith(f"Score {score['display']['total']} / 100")
