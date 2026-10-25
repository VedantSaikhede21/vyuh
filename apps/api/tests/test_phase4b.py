"""Phase 4b: assignments, trends, unit dashboard, weight versions, re-score, builder, demo data."""

import json
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import Assignment, ScoreRow, TrainingSession, Unit, User
from app.models import Scenario as ScenarioRow
from app.schemas.generated import UserRole
from app.seed.demo_history import DEMO_DIR
from app.services.scoring.tree import Tree, evaluate, leaf_points, load_tree
from app.services.scoring.versions import reweighted
from tests.conftest import assert_error, fixture_log
from tests.test_aar import _complete

Headers = Callable[[User], dict[str, str]]


def demo_log(name: str) -> dict[str, Any]:
    return json.loads((DEMO_DIR / f"{name}.json").read_text(encoding="utf-8"))


def play(
    client: TestClient,
    headers: dict[str, str],
    scenario: ScenarioRow,
    events: list[dict[str, Any]],
    mode: str = "ASSESSMENT",
) -> str:
    res = client.post(
        "/api/v1/sessions",
        json={"scenarioId": str(scenario.id), "mode": mode, "simVersion": 5},
        headers=headers,
    )
    assert res.status_code == 201, res.text
    sid = res.json()["sessionId"]
    _complete(client, sid, headers, events)
    return sid


@pytest.fixture
def staff(make_user: Callable[..., User], unit: Unit) -> User:
    return make_user(UserRole.INSTRUCTOR, "instructor@test", unit_id=unit.id)


@pytest.fixture
def trainees(make_user: Callable[..., User], unit: Unit) -> list[User]:
    return [make_user(email=f"t{i}@test", unit_id=unit.id) for i in range(1, 4)]


# ---- assignments ----------------------------------------------------------------------


def test_assignments_rbac_mine_and_completion(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    staff: User,
    trainees: list[User],
    unit: Unit,
    auth_header: Headers,
) -> None:
    due = (datetime.now(UTC) + timedelta(days=7)).isoformat()
    body = {"scenarioId": str(scenarios["S15"].id), "unitId": str(unit.id), "dueAt": due}
    assert_error(
        client.post("/api/v1/assignments", json=body, headers=auth_header(trainees[0])),
        403,
        "FORBIDDEN",
    )
    no_target = {"scenarioId": str(scenarios["S15"].id)}
    res = client.post("/api/v1/assignments", json=no_target, headers=auth_header(staff))
    assert_error(res, 422, "VALIDATION_ERROR")

    res = client.post("/api/v1/assignments", json=body, headers=auth_header(staff))
    assert res.status_code == 201, res.text
    personal = {"scenarioId": str(scenarios["S05"].id), "userIds": [str(trainees[1].id)]}
    assert (
        client.post("/api/v1/assignments", json=personal, headers=auth_header(staff)).status_code
        == 201
    )

    mine = client.get("/api/v1/assignments/mine", headers=auth_header(trainees[0])).json()["items"]
    assert [a["scenarioCode"] for a in mine] == ["S15"]
    assert mine[0]["unitName"] == unit.name and mine[0]["completed"] is False
    second = client.get("/api/v1/assignments/mine", headers=auth_header(trainees[1])).json()
    assert sorted(a["scenarioCode"] for a in second["items"]) == ["S05", "S15"]

    # Practice does not complete it; Assessment does.
    log = demo_log("trainee1_01")["events"]
    practice = [
        {**e, "payload": {**e["payload"], "mode": "PRACTICE"}}
        if e["type"] == "SESSION_STARTED"
        else e
        for e in log
    ]
    play(client, auth_header(trainees[0]), scenarios["S15"], practice, mode="PRACTICE")
    mine = client.get("/api/v1/assignments/mine", headers=auth_header(trainees[0])).json()["items"]
    assert mine[0]["completed"] is False
    sid = play(client, auth_header(trainees[0]), scenarios["S15"], log)
    mine = client.get("/api/v1/assignments/mine", headers=auth_header(trainees[0])).json()["items"]
    assert mine[0]["completed"] is True and mine[0]["completedSessionId"] == sid


# ---- trends & unit dashboard ------------------------------------------------------------


def test_trends_are_assessment_only_and_rbac(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    staff: User,
    trainees: list[User],
    auth_header: Headers,
) -> None:
    me = trainees[0]
    h = auth_header(me)
    for name in ("trainee2_01", "trainee2_03", "trainee2_06"):
        log = demo_log(name)
        play(client, h, scenarios[log["scenarioCode"]], log["events"])
    play(client, h, scenarios["S01"], fixture_log("s01_defended"), mode="PRACTICE")

    url = f"/api/v1/aar/users/{me.id}/trends"
    res = client.get(url, headers=h)
    assert res.status_code == 200, res.text
    body = res.json()
    assert [p["scenarioCode"] for p in body["points"]] == ["S15", "S04", "S08"]
    p = body["points"][0]
    assert 0 <= p["total"] <= 100 and p["isDemo"] is False
    assert set(p["components"]) == {"detection", "classification", "decision", "report"}
    assert 1 <= p["recommendedDifficulty"] <= 5
    assert [s["stage"] for s in body["stages"]] == [
        "DETECT",
        "TRACK",
        "IDENTIFY",
        "DECIDE",
        "RESPOND",
        "ASSESS",
    ]
    assert all(m["sessions"] >= 2 for m in body["mistakes"])  # recurring only
    assert client.get(url, headers=auth_header(staff)).status_code == 200
    assert_error(client.get(url, headers=auth_header(trainees[1])), 403, "FORBIDDEN")


def test_unit_dashboard_leaderboard_weakest_stage_and_completion(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    staff: User,
    trainees: list[User],
    unit: Unit,
    auth_header: Headers,
) -> None:
    # The PS done-criterion: assign a scenario, three trainees play it, compare them.
    body = {"scenarioId": str(scenarios["S15"].id), "unitId": str(unit.id)}
    assert (
        client.post("/api/v1/assignments", json=body, headers=auth_header(staff)).status_code == 201
    )
    for t, name in zip(trainees, ("trainee4_01", "trainee1_01", "trainee3_02"), strict=True):
        play(client, auth_header(t), scenarios["S15"], demo_log(name)["events"])

    url = f"/api/v1/aar/units/{unit.id}"
    assert_error(client.get(url, headers=auth_header(trainees[0])), 403, "FORBIDDEN")
    dash = client.get(url, headers=auth_header(staff)).json()
    assert dash["sessions"] == 3 and dash["demoSessions"] == 0
    board = dash["leaderboard"]
    assert len(board) == 3
    totals = [r["avgTotal"] for r in board]
    assert totals == sorted(totals, reverse=True)
    assert dash["weakestStage"] in {s["stage"] for s in dash["stages"]}
    rates = {s["stage"]: s["rate"] for s in dash["stages"] if s["rate"] is not None}
    assert rates[dash["weakestStage"]] == min(rates.values())
    [a] = dash["assignments"]
    assert a["assigned"] == 3 and a["completed"] == 3 and a["pending"] == []
    assert len(dash["recent"]) == 3


# ---- weight versions & re-score ------------------------------------------------------------


def test_reweighted_tree_scales_component_leaves() -> None:
    v4 = load_tree("default_v4")
    new = {**v4.component_max.model_dump(), "detection": 40, "report": 20}
    tree = Tree.model_validate(reweighted(v4, new, "default_v4_w9"))
    assert tree.component_max.detection == 40
    by_id = {leaf.leaf: leaf for leaf in tree.all_leaves()}
    assert by_id["LATENCY_UNDER_5S"].points == 40
    assert by_id["LATENCY_5_TO_15S"].points == pytest.approx(18 * 40 / 25)
    assert by_id["CLASS_EXACT"].points == 25  # unchanged component
    assert by_id["FRATRICIDE"].adjust == -40  # penalties are not weights
    report = by_id["REPORT_SCORED"]
    assert leaf_points(report, {"reportPoints": 6.5}) == pytest.approx(13.0)
    assert leaf_points(report, {"reportPoints": 99}) == 20
    # The feedback still quotes the report on its own 10-point scale, and says so.
    assert report.feedback.startswith(
        "Best contact report {reportPoints:.1f}/10 (scaled by 2 for this tree's weights), sent"
    )
    v4_report = next(x for x in v4.all_leaves() if x.leaf == "REPORT_SCORED")
    assert "/10" in v4_report.feedback and "weights" not in v4_report.feedback
    # Same structure: every contact reaches the same leaves.
    m = {"isThreat": False, "outcome": "IGNORED_OK"}
    assert [x.leaf for x in evaluate(tree, m)] == [x.leaf for x in evaluate(v4, m)]


def test_weight_versions_are_new_rows_and_rescore_is_explicit(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    staff: User,
    trainees: list[User],
    auth_header: Headers,
) -> None:
    sh = auth_header(staff)
    weights = {"detection": 25, "classification": 25, "decision": 30, "report": 10, "efficiency": 0}
    url = "/api/v1/scoring/trees/default_v4/weights"
    assert_error(
        client.patch(url, json={"componentMax": weights}, headers=auth_header(trainees[0])),
        403,
        "FORBIDDEN",
    )
    assert_error(
        client.patch(url, json={"componentMax": weights}, headers=sh), 422, "VALIDATION_ERROR"
    )
    err = assert_error(
        client.patch(url, json={"componentMax": {**weights, "efficiency": 5}}, headers=sh),
        422,
        "VALIDATION_ERROR",
    )
    assert "efficiency" in err["details"]["problems"][0]

    sid = play(
        client, auth_header(trainees[0]), scenarios["S15"], demo_log("trainee1_01")["events"]
    )
    before = client.get(f"/api/v1/sessions/{sid}", headers=sh).json()["score"]

    res = client.patch(url, json={"componentMax": {**weights, "detection": 50}}, headers=sh)
    assert res.status_code == 200, res.text
    v = res.json()
    assert v["id"] == "default_v4_w1" and v["baseId"] == "default_v4" and not v["builtIn"]
    assert v["componentMax"]["detection"] == 50
    # Saving never re-scores.
    assert db.scalar(select(func.count()).select_from(ScoreRow)) == 1
    ids = [t["id"] for t in client.get("/api/v1/scoring/trees", headers=sh).json()["items"]]
    assert "default_v4" in ids and "default_v4_w1" in ids
    res2 = client.patch(
        "/api/v1/scoring/trees/default_v4_w1/weights",
        json={"componentMax": {**weights, "detection": 50, "decision": 40}},
        headers=sh,
    )
    assert res2.json()["id"] == "default_v4_w2" and res2.json()["derivedFrom"] == "default_v4_w1"

    rescore = f"/api/v1/sessions/{sid}/rescore"
    assert_error(
        client.post(rescore, json={"treeId": "default_v4_w1"}, headers=auth_header(trainees[0])),
        403,
        "FORBIDDEN",
    )
    assert_error(
        client.post(rescore, json={"treeId": "default_v1"}, headers=sh), 422, "VALIDATION_ERROR"
    )
    res = client.post(rescore, json={"treeId": "default_v4_w1"}, headers=sh)
    assert res.status_code == 201, res.text
    assert res.json()["treeVersion"] == "default_v4_w1"
    assert res.json()["componentMax"]["detection"] == 50
    assert db.scalar(select(func.count()).select_from(ScoreRow)) == 2
    after = client.get(f"/api/v1/sessions/{sid}", headers=sh).json()["score"]
    assert after["treeVersion"] == "default_v4_w1"
    assert after["components"]["detection"] == pytest.approx(before["components"]["detection"] * 2)
    # Trends read the latest score row; the original row is kept.
    trend = client.get(f"/api/v1/aar/users/{trainees[0].id}/trends", headers=sh).json()
    assert [p["treeVersion"] for p in trend["points"]] == ["default_v4_w1"]
    # Trends send the display value (decision 149); the session sends both.
    assert trend["points"][0]["total"] == after["display"]["total"]
    kept = db.scalars(select(ScoreRow.tree_version).where(ScoreRow.session_id == sid)).all()
    assert sorted(kept) == ["default_v4", "default_v4_w1"]
    assert_error(
        client.post(rescore, json={"treeId": "default_v4_w1"}, headers=sh), 422, "VALIDATION_ERROR"
    )


# ---- scenario builder ----------------------------------------------------------------------

BASE_GEN = {"terrainPreset": "PUNJAB_PLAINS", "difficulty": 3, "seed": 4242}


def author(**over: Any) -> dict[str, Any]:
    return {"name": "Canal Bridge", "generate": BASE_GEN, "noKineticZones": [], **over}


def test_builder_preview_checks_and_save(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    staff: User,
    trainees: list[User],
    auth_header: Headers,
) -> None:
    sh = auth_header(staff)
    assert_error(
        client.post("/api/v1/scenarios/preview", json=author(), headers=auth_header(trainees[0])),
        403,
        "FORBIDDEN",
    )
    square = [[1000, 1000], [1600, 1000], [1600, 1600], [1000, 1600]]
    body = author(
        assetXz=[0, 0],
        noKineticZones=[{"name": "school", "polygon": square}],
        note="Expect the threat along the canal.",
    )
    res = client.post("/api/v1/scenarios/preview", json=body, headers=sh)
    assert res.status_code == 200, res.text
    pv = res.json()
    assert pv["problems"] == [], pv["problems"]
    sc = pv["scenario"]
    assert sc["name"] == "Canal Bridge" and sc["id"].startswith("AUT-")
    assert (sc["assets"][0]["x"], sc["assets"][0]["z"]) == (0, 0)
    school = [z for z in sc["zones"] if z.get("name") == "school"]
    assert len(school) == 1 and school[0]["kind"] == "NO_KINETIC"
    assert "## Instructor note" in sc["briefing"]
    assert sum(pv["threatMix"].values()) >= 1

    # Static checks.
    bad = author(
        assetXz=[6800, 0],
        noKineticZones=[
            {"name": "bowtie", "polygon": [[0, 0], [500, 500], [500, 0], [0, 500]]},
            {"name": "tiny", "polygon": [[0, 3000], [10, 3000], [10, 3010]]},
        ],
    )
    problems = client.post("/api/v1/scenarios/preview", json=bad, headers=sh).json()["problems"]
    text = " | ".join(problems)
    assert "inside the map edge" in text and "edges cross" in text and "too small" in text
    covering = author(
        assetXz=[0, 0],
        noKineticZones=[
            {"name": "base", "polygon": [[-300, -300], [300, -300], [300, 300], [-300, 300]]}
        ],
    )
    problems = client.post("/api/v1/scenarios/preview", json=covering, headers=sh).json()[
        "problems"
    ]
    assert any("covers the asset" in p for p in problems)
    assert_error(
        client.post("/api/v1/scenarios", json=covering, headers=sh), 422, "VALIDATION_ERROR"
    )

    saved = client.post("/api/v1/scenarios", json=body, headers=sh)
    assert saved.status_code == 201, saved.text
    sid = saved.json()["scenarioId"]
    assert saved.json()["kind"] == "AUTHORED"
    again = client.post("/api/v1/scenarios", json=body, headers=sh).json()
    assert again["scenarioId"] == sid  # same request, same row
    listed = client.get("/api/v1/scenarios", headers=auth_header(trainees[0])).json()["items"]
    row = next(s for s in listed if s["id"] == sid)
    assert row["kind"] == "AUTHORED" and "authored" in row["tags"]
    # Lists show the AUT- code (audit P2-9).
    assert row["code"] == sc["id"]
    # Assignable.
    res = client.post(
        "/api/v1/assignments",
        json={"scenarioId": sid, "userIds": [str(trainees[0].id)]},
        headers=sh,
    )
    assert res.status_code == 201
    mine = client.get("/api/v1/assignments/mine", headers=auth_header(trainees[0])).json()
    assert [a["scenarioCode"] for a in mine["items"]] == [sc["id"]]
    assert db.scalar(select(func.count()).select_from(Assignment)) == 1


def test_builder_without_overrides_matches_the_generator(
    client: TestClient, staff: User, auth_header: Headers
) -> None:
    from app.schemas.generated import GenerateRequest
    from app.services.generator import generate

    pv = client.post("/api/v1/scenarios/preview", json=author(), headers=auth_header(staff)).json()
    gen = generate(GenerateRequest.model_validate(BASE_GEN))
    for key in ("assets", "zones", "contacts", "sensors", "effectors", "environment"):
        assert pv["scenario"][key] == gen[key], key


# ---- demo history ---------------------------------------------------------------------------


def test_demo_history_is_real_scored_and_idempotent(
    db: Session, scenarios: dict[str, ScenarioRow]
) -> None:
    from app.core.config import AuthMode
    from app.seed.demo import seed_units, seed_users
    from app.seed.demo_history import seed_demo_history

    units = seed_units(db)
    assert AuthMode.LOCAL  # demo users exist in local auth only
    seed_users(db, units)
    db.commit()
    n = seed_demo_history(db)
    logs = list(DEMO_DIR.glob("*.json"))
    assert n == len(logs) >= 40
    demo = db.scalars(select(TrainingSession).where(TrainingSession.is_demo.is_(True))).all()
    assert len(demo) == n and all(s.status.value == "COMPLETED" for s in demo)
    assert db.scalar(select(func.count()).select_from(ScoreRow)) == n
    assert seed_demo_history(db) == 0  # unchanged → nothing rebuilt
    assert db.scalar(select(func.count()).select_from(Assignment)) == 3

    # Improvement: most trainees' last three runs beat their first three.
    by_user: dict[Any, list[tuple[datetime, float]]] = {}
    for s in demo:
        total = db.scalar(select(ScoreRow.total).where(ScoreRow.session_id == s.id))
        by_user.setdefault(s.user_id, []).append((s.started_at, total))
    improved = 0
    for runs in by_user.values():
        totals = [t for _, t in sorted(runs)]
        improved += sum(totals[-3:]) > sum(totals[:3])
    assert improved >= 4, by_user


def test_reset_demo_removes_only_non_demo_sessions_of_demo_accounts(
    client: TestClient,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
) -> None:
    from app.seed.reset_demo import reset_demo

    demo_user = make_user(email="trainee1@demo")
    e2e_user = make_user(email="e2e@demo")
    other = make_user(email="someone@unit")
    log = demo_log("trainee1_01")
    real = play(client, auth_header(demo_user), scenarios["S15"], log["events"])
    seeded = play(client, auth_header(demo_user), scenarios["S15"], log["events"])
    fixture = play(client, auth_header(e2e_user), scenarios["S15"], log["events"])
    kept_other = play(client, auth_header(other), scenarios["S15"], log["events"])
    db.get_one(TrainingSession, seeded).is_demo = True
    db.commit()

    assert reset_demo(db, apply=False) == (1, 1)  # dry run
    assert db.scalar(select(func.count()).select_from(TrainingSession)) == 4
    assert reset_demo(db, apply=True) == (1, 1)
    db.expire_all()
    left = {str(i) for i in db.scalars(select(TrainingSession.id))}
    assert left == {seeded, fixture, kept_other} and real not in left
    assert db.scalar(select(func.count()).select_from(ScoreRow)) == 3
    assert reset_demo(db, apply=True) == (0, 0)
