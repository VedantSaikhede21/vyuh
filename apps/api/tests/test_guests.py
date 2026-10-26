"""Guest demo accounts (Phase 6E): POST /auth/guest, what a guest may reach, cleanup, limits."""

from collections.abc import Callable, Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import AuthMode
from app.main import create_app
from app.models import Scenario, TrainingSession, Unit, User
from app.schemas.generated import UserRole
from app.services.ai.from_text import DEMO_TEXT
from app.services.guests import cleanup_expired
from tests.conftest import assert_error, make_settings

GUEST = "/api/v1/auth/guest"


@pytest.fixture
def guest_app() -> Iterator[FastAPI]:
    application = create_app(make_settings(guest_mode_enabled=True))
    yield application
    application.state.engine.dispose()


@pytest.fixture
def gclient(guest_app: FastAPI, db: Session) -> TestClient:
    return TestClient(guest_app, raise_server_exceptions=False)


def new_guest(client: TestClient) -> dict[str, str]:
    res = client.post(GUEST)
    assert res.status_code == 200, res.text
    return {"Authorization": f"Bearer {res.json()['accessToken']}"}


def test_guest_endpoint_is_off_unless_enabled(client: TestClient) -> None:
    assert_error(client.post(GUEST), 404, "NOT_FOUND")


def test_guest_identity(gclient: TestClient, db: Session) -> None:
    res = gclient.post(GUEST)
    assert res.json()["expiresIn"] == 24 * 3600
    me = gclient.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {res.json()['accessToken']}"}
    ).json()
    assert me["role"] == "GUEST" and me["isGuest"] is True
    assert me["name"].startswith("Guest ") and me["email"] is None and me["unit"] is None


def test_guest_sees_and_plays_only_demo_scenarios(
    gclient: TestClient, scenarios: dict[str, Scenario]
) -> None:
    h = new_guest(gclient)
    codes = {s["code"] for s in gclient.get("/api/v1/scenarios", headers=h).json()["items"]}
    assert codes == {"S01", "S02", "S06", "S15"}
    s04 = gclient.get(f"/api/v1/scenarios/{scenarios['S04'].id}", headers=h)
    assert_error(s04, 404, "NOT_FOUND")
    play = {"scenarioId": str(scenarios["S15"].id), "mode": "PRACTICE", "simVersion": 6}
    assert gclient.post("/api/v1/sessions", json=play, headers=h).status_code == 201
    play["scenarioId"] = str(scenarios["S04"].id)
    assert_error(gclient.post("/api/v1/sessions", json=play, headers=h), 404, "NOT_FOUND")
    gen = {"terrainPreset": "PUNJAB_PLAINS", "difficulty": 2, "seed": 1}
    assert_error(gclient.post("/api/v1/scenarios/generate", json=gen, headers=h), 403, "FORBIDDEN")


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("get", "/api/v1/assignments", None),
        ("post", "/api/v1/assignments", {"scenarioId": "00000000-0000-4000-8000-000000000000"}),
        ("get", "/api/v1/scoring/trees", None),
        ("post", "/api/v1/scenarios/from-text", {"text": "two quads at night"}),
        ("post", "/api/v1/scenarios/preview", {}),
        ("get", "/api/v1/sessions/active", None),
        (
            "post",
            "/api/v1/sessions/00000000-0000-4000-8000-000000000000/rescore",
            {"treeId": "default_v4"},
        ),
        (
            "post",
            "/api/v1/aar/sessions/00000000-0000-4000-8000-000000000000/remarks",
            {"body": "x"},
        ),
        (
            "post",
            "/api/v1/record/00000000-0000-4000-8000-000000000000/signoffs",
            {"level": "BASIC_OPERATOR"},
        ),
    ],
)
def test_guest_is_refused_staff_routes(
    gclient: TestClient, method: str, path: str, body: dict[str, Any] | None
) -> None:
    h = new_guest(gclient)
    res = getattr(gclient, method)(path, headers=h, **({"json": body} if body else {}))
    # Role checks run before body validation: FORBIDDEN, never a 422 with details.
    assert_error(res, 403, "FORBIDDEN")


def test_guest_views_demo_units_read_only(
    gclient: TestClient, db: Session, make_user: Callable[..., User]
) -> None:
    demo, real = Unit(name="Demo Unit Alpha", is_demo=True), Unit(name="Real Unit")
    db.add_all([demo, real])
    db.commit()
    trainee = make_user(UserRole.TRAINEE, "t@test", unit_id=demo.id)
    outsider = make_user(UserRole.TRAINEE, "o@test", unit_id=real.id)
    h = new_guest(gclient)
    names = [u["name"] for u in gclient.get("/api/v1/units", headers=h).json()["items"]]
    assert names == ["Demo Unit Alpha"]
    assert gclient.get(f"/api/v1/aar/units/{demo.id}", headers=h).status_code == 200
    assert_error(gclient.get(f"/api/v1/aar/units/{real.id}", headers=h), 403, "FORBIDDEN")
    trends = "/api/v1/aar/users/{}/trends"
    assert gclient.get(trends.format(trainee.id), headers=h).status_code == 200
    assert_error(gclient.get(trends.format(outsider.id), headers=h), 403, "FORBIDDEN")


def test_cleanup_deletes_expired_guests_with_their_data(
    gclient: TestClient, db: Session, scenarios: dict[str, Scenario]
) -> None:
    h = new_guest(gclient)
    play = {"scenarioId": str(scenarios["S15"].id), "mode": "PRACTICE", "simVersion": 6}
    assert gclient.post("/api/v1/sessions", json=play, headers=h).status_code == 201
    fresh = new_guest(gclient)
    old = datetime.now(UTC) - timedelta(hours=25)
    guest_id = db.scalars(select(User.id).where(User.is_guest.is_(True))).first()
    db.execute(update(User).where(User.id == guest_id).values(created_at=old))
    db.commit()

    assert cleanup_expired(db, 24) == 1
    assert db.scalar(select(TrainingSession).where(TrainingSession.user_id == guest_id)) is None
    assert_error(gclient.get("/api/v1/auth/me", headers=h), 401, "UNAUTHORIZED")
    assert gclient.get("/api/v1/auth/me", headers=fresh).status_code == 200


def test_guest_limits(db: Session) -> None:
    app = create_app(
        make_settings(guest_mode_enabled=True, guest_create_per_hour=2, guest_max_active=3)
    )
    client = TestClient(app, raise_server_exceptions=False)
    try:
        client.post(GUEST)
        client.post(GUEST)
        assert_error(client.post(GUEST), 429, "RATE_LIMITED")  # per address
        app.state.guest_limiter.per_minute = 100
        client.post(GUEST)
        assert_error(client.post(GUEST), 429, "RATE_LIMITED")  # three alive at once
    finally:
        app.state.engine.dispose()


def test_guest_token_works_in_supabase_mode_and_never_provisions(db: Session) -> None:
    settings = make_settings(
        auth_mode=AuthMode.SUPABASE,
        supabase_url="https://demo-project.supabase.co",
        guest_mode_enabled=True,
    )
    app = create_app(settings)
    client = TestClient(app, raise_server_exceptions=False)
    try:
        h = new_guest(client)
        assert client.get("/api/v1/auth/me", headers=h).json()["role"] == "GUEST"
        db.execute(
            update(User)
            .where(User.is_guest.is_(True))
            .values(created_at=datetime(2000, 1, 1, tzinfo=UTC))
        )
        db.commit()
        cleanup_expired(db, 24)
        assert_error(client.get("/api/v1/auth/me", headers=h), 401, "UNAUTHORIZED")
        assert db.scalar(select(User).where(User.role == UserRole.TRAINEE)) is None
    finally:
        app.state.engine.dispose()


def test_guest_text_to_scenario_preset_with_the_llm_off(gclient: TestClient, db: Session) -> None:
    h = new_guest(gclient)
    url = "/api/v1/scenarios/from-text"
    other = gclient.post(url, json={"text": "ten fixed-wing drones at dawn"}, headers=h)
    assert_error(other, 403, "FORBIDDEN")
    res = gclient.post(
        url, json={"text": "  night SWARM of 8 from the north with 2 decoys, hard "}, headers=h
    )
    assert res.status_code == 200, res.text
    body = res.json()
    assert body["source"] == "TEMPLATE" and body["model"] == "template"
    assert body["notes"][0].startswith("The LLM is off on this server")
    req = body["request"]
    assert (req["timeBand"], req["swarmSize"], req["decoys"], req["difficulty"]) == (
        "NIGHT",
        8,
        2,
        4,
    )

    gen = gclient.post("/api/v1/scenarios/generate", json=req, headers=h)
    assert gen.status_code == 201, gen.text
    sid = gen.json()["scenarioId"]
    assert gclient.get(f"/api/v1/scenarios/{sid}", headers=h).status_code == 200
    mine = gclient.get("/api/v1/scenarios?mine=true", headers=h).json()["items"]
    assert [s["id"] for s in mine] == [sid]
    # Any other seed is free generation: refused. Three AI calls per hour in all.
    assert_error(
        gclient.post("/api/v1/scenarios/generate", json={**req, "seed": 1}, headers=h),
        403,
        "FORBIDDEN",
    )
    assert gclient.post(url, json={"text": DEMO_TEXT}, headers=h).status_code == 200
    assert_error(gclient.post(url, json={"text": DEMO_TEXT}, headers=h), 429, "RATE_LIMITED")

    # The generated scenario goes with the guest.
    db.execute(
        update(User)
        .where(User.is_guest.is_(True))
        .values(created_at=datetime(2000, 1, 1, tzinfo=UTC))
    )
    db.commit()
    cleanup_expired(db, 24)
    assert db.scalar(select(Scenario).where(Scenario.id == sid)) is None


def test_demo_text_matches_the_shared_constant() -> None:
    ai_ts = (Path(__file__).resolve().parents[3] / "packages/shared/src/ai.ts").read_text(
        encoding="utf-8"
    )
    assert f"export const DEMO_FROM_TEXT = '{DEMO_TEXT}';" in ai_ts
