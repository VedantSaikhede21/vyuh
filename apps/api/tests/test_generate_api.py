"""POST /scenarios/generate (Phase 3a Step 9): RBAC, determinism, storage, visibility, 429."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import User
from app.schemas.generated import Scenario, ScenarioKind, UserRole
from app.services.generator import GENERATOR_VERSION
from app.services.ratelimit import RateLimiter
from tests.conftest import assert_error, make_settings

URL = "/api/v1/scenarios/generate"
TRAINEE_BODY = {"terrainPreset": "PUNJAB_PLAINS", "difficulty": 2, "seed": 77, "timeBand": "DAY"}
FULL_BODY = TRAINEE_BODY | {
    "difficulty": 4,
    "weatherPreset": "HAZE",
    "durationS": 600,
    "roe": "WEAPONS_FREE",
    "threatMix": {"QUAD_SMALL": 2},
    "falseContactDensity": "LOW",
    "aiAssistAccuracy": 0.6,
}

Headers = Callable[[User], dict[str, str]]

#: Trainee library list (difficulty, then code); test scenarios S11-S14 hidden.
LIBRARY = ["S01", "S02", "S03", "S15", "S04", "S05", "S06", "S07", "S08", "S09", "S10"]


def generate(client: TestClient, headers: dict[str, str], body: dict[str, Any]) -> Any:
    return client.post(URL, json=body, headers=headers)


def test_trainee_may_set_only_terrain_time_band_difficulty_and_seed(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    headers = auth_header(make_user())
    ok = generate(client, headers, TRAINEE_BODY)
    assert ok.status_code == 201, ok.text
    body = ok.json()
    assert set(body) == {"scenarioId", "scenario"}
    Scenario.model_validate(body["scenario"])
    assert body["scenario"]["generatorVersion"] == GENERATOR_VERSION
    assert "null" not in ok.text  # optional fields omitted, never null

    err = assert_error(generate(client, headers, FULL_BODY), 403, "FORBIDDEN")
    assert err["details"]["fields"] == [
        "aiAssistAccuracy",
        "durationS",
        "falseContactDensity",
        "roe",
        "threatMix",
        "weatherPreset",
    ]


@pytest.mark.parametrize("role", [UserRole.INSTRUCTOR, UserRole.ADMIN])
def test_staff_may_set_every_field(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers, role: UserRole
) -> None:
    res = generate(client, auth_header(make_user(role, f"{role.value.lower()}@test")), FULL_BODY)
    assert res.status_code == 201, res.text
    s = res.json()["scenario"]
    assert (s["roe"], s["durationS"]) == ("WEAPONS_FREE", 600)
    assert s["request"]["threatMix"] == {"QUAD_SMALL": 2}


def test_requires_auth_and_valid_input(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    assert_error(client.post(URL, json=TRAINEE_BODY), 401, "UNAUTHORIZED")
    headers = auth_header(make_user())
    assert_error(
        generate(client, headers, TRAINEE_BODY | {"difficulty": 6}), 422, "VALIDATION_ERROR"
    )
    err = assert_error(
        generate(client, headers, TRAINEE_BODY | {"terrainPreset": "NOWHERE"}),
        422,
        "VALIDATION_ERROR",
    )
    assert "NOWHERE" in err["message"]
    staff = auth_header(make_user(UserRole.INSTRUCTOR, "i@test"))
    assert_error(
        generate(client, staff, FULL_BODY | {"weatherPreset": "DUST"}), 422, "VALIDATION_ERROR"
    )


def test_deterministic_and_stored_once_per_user(
    client: TestClient, db: Session, make_user: Callable[..., User], auth_header: Headers
) -> None:
    a, b = make_user(), make_user(email="other@test")
    first = generate(client, auth_header(a), TRAINEE_BODY).json()
    again = generate(client, auth_header(a), TRAINEE_BODY).json()
    other = generate(client, auth_header(b), TRAINEE_BODY).json()
    assert again == first  # same request, same user: the same row
    assert other["scenario"] == first["scenario"]  # byte-identical content
    assert other["scenarioId"] != first["scenarioId"]  # but each user owns a copy

    rows = db.scalars(select(ScenarioRow).where(ScenarioRow.kind == ScenarioKind.GENERATED)).all()
    assert len(rows) == 2
    row = next(r for r in rows if str(r.id) == first["scenarioId"])
    assert (row.kind, row.tags, row.created_by, row.code) == (
        ScenarioKind.GENERATED,
        ["generated"],
        a.id,
        None,
    )
    assert row.request == first["scenario"]["request"]
    assert row.difficulty == 2 and row.seed == 77


def test_generated_runs_stay_out_of_the_library_list(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
) -> None:
    trainee = auth_header(make_user())
    staff = auth_header(make_user(UserRole.INSTRUCTOR, "i@test"))
    made = generate(client, trainee, TRAINEE_BODY).json()

    def codes(headers: dict[str, str], query: str = "") -> list[str | None]:
        return [
            i["code"]
            for i in client.get(f"/api/v1/scenarios{query}", headers=headers).json()["items"]
        ]

    assert codes(trainee) == LIBRARY
    assert None not in codes(staff)
    assert codes(trainee, "?kind=GENERATED") == LIBRARY  # filter ignored
    listed = client.get("/api/v1/scenarios?kind=GENERATED", headers=staff).json()["items"]
    assert [i["id"] for i in listed] == [made["scenarioId"]]


def test_visible_by_id_to_creator_and_staff_only(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    owner = make_user()
    made = generate(client, auth_header(owner), TRAINEE_BODY).json()
    url = f"/api/v1/scenarios/{made['scenarioId']}"
    assert client.get(url, headers=auth_header(owner)).status_code == 200
    staff = auth_header(make_user(UserRole.INSTRUCTOR, "i@test"))
    assert client.get(url, headers=staff).json()["scenario"] == made["scenario"]
    stranger = auth_header(make_user(email="stranger@test"))
    assert_error(client.get(url, headers=stranger), 404, "NOT_FOUND")

    session = {"scenarioId": made["scenarioId"], "mode": "PRACTICE", "simVersion": 3}
    assert_error(client.post("/api/v1/sessions", json=session, headers=stranger), 404, "NOT_FOUND")
    started = client.post("/api/v1/sessions", json=session, headers=auth_header(owner))
    assert started.status_code == 201, started.text
    assert started.json()["scenario"] == made["scenario"]


def test_rate_limited_per_user(
    db: Session, make_user: Callable[..., User], auth_header: Headers
) -> None:
    from app.main import create_app

    app = create_app(make_settings(generate_rate_limit_per_min=2))
    try:
        client = TestClient(app, raise_server_exceptions=False)
        a, b = auth_header(make_user()), auth_header(make_user(email="b@test"))
        for seed in (1, 2):
            assert generate(client, a, TRAINEE_BODY | {"seed": seed}).status_code == 201
        err = assert_error(generate(client, a, TRAINEE_BODY | {"seed": 3}), 429, "RATE_LIMITED")
        assert 1 <= err["details"]["retryAfterS"] <= 60
        assert generate(client, b, TRAINEE_BODY).status_code == 201  # per user
    finally:
        app.state.engine.dispose()


def test_rate_limiter_window() -> None:
    now = [0.0]
    limiter = RateLimiter(2, clock=lambda: now[0])
    limiter.check("u")
    limiter.check("u")
    with pytest.raises(Exception, match="per minute"):
        limiter.check("u")
    now[0] = 60.0
    limiter.check("u")  # the oldest call left the window
