"""e2e@demo seed (Phase 4a Step 2): fixed sessions, scored by the real session path."""

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Scenario, ScoreRow, TrainingSession, Unit, User
from app.schemas.generated import SessionStatus
from app.seed import e2e
from app.seed.e2e import E2E_EMAIL, seed_e2e_user


def _sessions(db: Session) -> list[TrainingSession]:
    user = db.scalar(select(User).where(User.email == E2E_EMAIL))
    assert user is not None
    return list(db.scalars(select(TrainingSession).where(TrainingSession.user_id == user.id)))


def test_seed_scores_every_fixture_and_is_idempotent(
    db: Session, scenarios: dict[str, Scenario], unit: Unit
) -> None:
    assert seed_e2e_user(db, unit) == 2
    rows = _sessions(db)
    assert {r.status for r in rows} == {SessionStatus.COMPLETED}
    by_scenario = {db.get_one(Scenario, r.scenario_id).code: r for r in rows}
    assert set(by_scenario) == {"S01", "S04"}
    assert by_scenario["S04"].mode.value == "ASSESSMENT"
    scores = {
        code: db.scalar(select(ScoreRow.total).where(ScoreRow.session_id == r.id))
        for code, r in by_scenario.items()
    }
    assert all(s is not None and s > 0 for s in scores.values()), scores

    ids = {r.id for r in rows}
    assert seed_e2e_user(db, unit) == 0  # nothing changed: nothing rebuilt
    assert {r.id for r in _sessions(db)} == ids


def test_seed_rebuilds_when_a_fixture_changes(
    db: Session,
    scenarios: dict[str, Scenario],
    unit: Unit,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_e2e_user(db, unit)
    before = {r.id for r in _sessions(db)}
    only = tmp_path / "s01_practice.json"
    only.write_text((e2e.E2E_DIR / "s01_practice.json").read_text(encoding="utf-8"))
    monkeypatch.setattr(e2e, "E2E_DIR", tmp_path)
    assert seed_e2e_user(db, unit) == 1
    after = _sessions(db)
    assert len(after) == 1 and after[0].id not in before


def test_list_best_scores_come_from_the_fixtures(
    client: TestClient,
    db: Session,
    scenarios: dict[str, Scenario],
    unit: Unit,
    auth_header: Callable[[User], dict[str, str]],
) -> None:
    seed_e2e_user(db, unit)
    user = db.scalar(select(User).where(User.email == E2E_EMAIL))
    assert user is not None
    items = client.get("/api/v1/scenarios", headers=auth_header(user)).json()["items"]
    best = {i["code"]: i["bestScore"] for i in items if i["bestScore"] is not None}
    assert set(best) == {"S01", "S04"}
    log = json.loads((e2e.E2E_DIR / "s04_assessment.json").read_text(encoding="utf-8"))
    assert log["mode"] == "ASSESSMENT"


def test_seed_puts_e2e_user_in_its_own_unit(app: Any, settings: Any, db: Session) -> None:
    """Decision 127: e2e@demo never appears on the demo units' dashboards."""
    from app.seed.demo import UNITS, seed_all
    from app.seed.e2e import E2E_UNIT

    seed_all(app.state.session_factory, settings)
    db.expire_all()
    user = db.scalar(select(User).where(User.email == E2E_EMAIL))
    assert user is not None and user.unit is not None
    assert user.unit.name == E2E_UNIT and E2E_UNIT not in UNITS
    demo_units = db.scalars(select(Unit).where(Unit.name.in_(UNITS))).all()
    members = db.scalars(select(User.email).where(User.unit_id.in_([u.id for u in demo_units])))
    assert E2E_EMAIL not in set(members)
