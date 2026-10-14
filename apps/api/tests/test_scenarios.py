"""Scripted scenario seeding, cross-field rules, and GET /scenarios[/{id}]."""

import json
import uuid
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import User
from app.schemas.generated import Scenario
from app.seed.scenarios import SCENARIO_DIR, load_scripted, seed_scenarios
from app.services.scenarios import scenario_rule_violations
from tests.conftest import assert_error

S01 = json.loads((SCENARIO_DIR / "S01.json").read_text(encoding="utf-8"))


def test_scripted_scenarios_are_valid() -> None:
    codes = [s.id for s in load_scripted()]
    assert codes == ["S01", "S02", "S03", "S11", "S12"]
    for s in load_scripted():
        if s.id in {"S11", "S12"}:  # Phase 2 test scenarios on real-DEM presets
            assert s.terrain.preset in {"JK_MOUNTAIN", "PUNJAB_PLAINS"}
            continue
        assert s.duration_s == 180
        assert {c.class_.value for c in s.contacts} == {"QUAD_SMALL"}
        assert {c.behaviour.value for c in s.contacts} == {"ATTACK_RUN"}
        assert [e.kind.value for e in s.effectors] == ["INTERCEPT"]


@pytest.mark.parametrize(
    ("mutate", "expected"),
    [
        (lambda s: s["contacts"].append(dict(s["contacts"][0])), 'contacts: duplicate id "c01"'),
        (lambda s: s["contacts"][0].update(isThreat=False), "isThreat must be True"),
        (lambda s: s["contacts"][0].update(spawnTMs=181_000), "spawns after scenario ends"),
        (lambda s: s["contacts"][0].update(despawnTMs=1000), "despawnTMs must be after"),
        (lambda s: s["sensors"][1].update(fovDegMin=40), "fovDegMin > fovDegMax"),
        (
            lambda s: s["contacts"][0].update(controlLink="FIBRE_OPTIC"),
            "rfActive must be false for control link FIBRE_OPTIC",
        ),
        (
            lambda s: s["contacts"][0].update(controlLink="AUTONOMOUS_GNSS"),
            "rfActive must be false for control link AUTONOMOUS_GNSS",
        ),
        (
            lambda s: s["contacts"][0].update(
                emissions={"rfActive": False, "friendlyIdCode": "B1"}
            ),
            "friendlyIdCode requires rfActive",
        ),
    ],
)
def test_cross_field_rules(mutate: Callable[[dict], None], expected: str) -> None:
    raw = json.loads(json.dumps(S01))
    mutate(raw)
    problems = scenario_rule_violations(Scenario.model_validate(raw))
    assert any(expected in p for p in problems), problems


def test_valid_scenario_has_no_violations() -> None:
    assert scenario_rule_violations(Scenario.model_validate(S01)) == []


def test_loader_rejects_rule_violations(tmp_path: Path) -> None:
    bad = json.loads(json.dumps(S01))
    bad["contacts"][0]["isThreat"] = False
    (tmp_path / "S01.json").write_text(json.dumps(bad), encoding="utf-8")
    with pytest.raises(ValueError, match="isThreat"):
        load_scripted(tmp_path)


def test_seed_is_idempotent(db: Session) -> None:
    assert seed_scenarios(db) == 5
    db.commit()
    assert seed_scenarios(db) == 0
    assert db.scalar(select(func.count()).select_from(ScenarioRow)) == 5
    s01 = db.scalar(select(ScenarioRow).where(ScenarioRow.code == "S01"))
    assert s01 is not None
    assert s01.tags == ["tutorial", "demo"]
    s11 = db.scalar(select(ScenarioRow).where(ScenarioRow.code == "S11"))
    assert s11 is not None and s11.tags == ["test"]
    assert s01.content["contacts"][0]["id"] == "c01"
    assert "despawnTMs" not in s01.content["contacts"][0]  # unset optionals are not stored


def _gameplay_bytes(content: dict) -> str:
    rest = {k: v for k, v in content.items() if k not in ("name", "briefing")}
    return json.dumps(rest, sort_keys=True)


def test_seed_updates_display_fields_of_scenarios_with_sessions(
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    start_session: Callable[..., str],
    tmp_path: Path,
) -> None:
    row = scenarios["S01"]
    start_session(make_user(), row)
    before = _gameplay_bytes(row.content)
    edited = json.loads(json.dumps(S01))
    edited["name"] = "First Contact (rev)"
    edited["briefing"] = S01["briefing"] + "\nNote."
    (tmp_path / "S01.json").write_text(json.dumps(edited), encoding="utf-8")
    assert seed_scenarios(db, tmp_path) == 1
    db.commit()
    db.refresh(row)
    assert row.name == "First Contact (rev)"
    assert row.content["name"] == "First Contact (rev)"
    assert row.content["briefing"].endswith("\nNote.")
    assert row.tags == ["tutorial", "demo"]
    assert _gameplay_bytes(row.content) == before  # gameplay content byte-identical
    assert seed_scenarios(db, tmp_path) == 0


@pytest.mark.parametrize(
    "mutate",
    [
        lambda s: s.update(durationS=s["durationS"] + 10),
        lambda s: s["contacts"][0]["path"][0].update(speedMps=99),
        lambda s: s.update(name="Renamed", seed=s["seed"] + 1),
    ],
)
def test_seed_does_not_change_gameplay_of_scenarios_with_sessions(
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    start_session: Callable[..., str],
    tmp_path: Path,
    mutate: Callable[[dict], None],
) -> None:
    row = scenarios["S01"]
    start_session(make_user(), row)
    before = json.dumps(row.content, sort_keys=True)
    edited = json.loads(json.dumps(S01))
    mutate(edited)
    (tmp_path / "S01.json").write_text(json.dumps(edited), encoding="utf-8")
    assert seed_scenarios(db, tmp_path) == 0
    db.refresh(row)
    assert row.name == "First Contact"
    assert json.dumps(row.content, sort_keys=True) == before


def test_list_scenarios(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Callable[[User], dict[str, str]],
) -> None:
    headers = auth_header(make_user())
    body = client.get("/api/v1/scenarios", headers=headers).json()
    assert [i["code"] for i in body["items"]] == ["S01", "S02", "S03", "S11", "S12"]
    first = body["items"][0]
    assert first == {
        "id": str(scenarios["S01"].id),
        "code": "S01",
        "name": "First Contact",
        "kind": "SCRIPTED",
        "difficulty": 1,
        "durationS": 180,
        "roe": "WEAPONS_FREE",
        "isNight": False,
        "terrainPreset": "PROCEDURAL_HILLS",
        "date": "2026-11-20",
        "time": "10:30",
        "tags": ["tutorial", "demo"],
    }
    filtered = client.get("/api/v1/scenarios?difficulty=2", headers=headers).json()
    assert [i["code"] for i in filtered["items"]] == ["S03", "S11", "S12"]


def test_get_scenario_omits_unset_optionals(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Callable[[User], dict[str, str]],
) -> None:
    row = scenarios["S01"]
    body = client.get(f"/api/v1/scenarios/{row.id}", headers=auth_header(make_user())).json()
    assert body["scenarioId"] == str(row.id)
    assert body["code"] == "S01"
    assert body["scenario"] == S01  # byte-for-byte the authored JSON, no nulls added


def test_get_scenario_errors(
    client: TestClient,
    make_user: Callable[..., User],
    auth_header: Callable[[User], dict[str, str]],
) -> None:
    assert_error(client.get("/api/v1/scenarios"), 401, "UNAUTHORIZED")
    headers = auth_header(make_user())
    assert_error(client.get(f"/api/v1/scenarios/{uuid.uuid4()}", headers=headers), 404, "NOT_FOUND")
