"""Phase 6C: service record (SPEC §9.7), notices, remarks, home, status, readiness, live
sessions and the scoring summary."""

import json
import uuid
from collections import Counter
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import TrainingSession, Unit, User
from app.schemas.generated import UserRole
from app.services import record
from app.services.scoring.tree import TREE_DIR
from tests.conftest import assert_error, fixture_log
from tests.test_phase4b import play
from tests.test_sessions import post_batch

Headers = Callable[[User], dict[str, str]]


def assessment_log(name: str) -> list[dict[str, Any]]:
    """A recorded Practice fixture log replayed as an Assessment run (same events)."""
    log = fixture_log(name)
    start = dict(log[0])
    start["payload"] = {**start["payload"], "mode": "ASSESSMENT"}
    return [start, *log[1:]]


# ---- Rules on fake sessions (each criterion kind and endorsement) -----------------------


def contact(**kw: Any) -> SimpleNamespace:
    base = {
        "contact_id": "c01",
        "is_threat": True,
        "detection_latency_s": 4.0,
        "leaves": [],
        "outcome": "NEUTRALISED",
        "classification_correct": "EXACT",
    }
    return SimpleNamespace(**(base | kw))


def fake(
    *,
    difficulty: int = 1,
    total: int = 80,
    night: bool = False,
    ok: dict[str, int] | None = None,
    of: dict[str, int] | None = None,
    contacts: list[SimpleNamespace] | None = None,
    specs: list[SimpleNamespace] | None = None,
    components: dict[str, float | None] | None = None,
    trust: SimpleNamespace | None = None,
    roe_scored: bool = True,
) -> Any:
    pcs = contacts if contacts is not None else [contact()]
    facts = SimpleNamespace(
        row=SimpleNamespace(id=uuid.uuid4(), is_demo=False),
        scenario_row=SimpleNamespace(name="Test"),
        ended_at=datetime(2026, 10, 1, tzinfo=UTC),
        score=SimpleNamespace(per_contact=pcs),
        scenario=SimpleNamespace(
            contacts=specs
            or [
                SimpleNamespace(
                    id=c.contact_id, is_threat=c.is_threat, group_id=None, control_link="RF_MANUAL"
                )
                for c in pcs
            ]
        ),
        components=components or {"report": None},
        trust=trust or SimpleNamespace(shown_wrong=0, rejected_wrong=0),
    )
    return SimpleNamespace(
        facts=facts,
        id=facts.row.id,
        total=total,
        difficulty=difficulty,
        night=night,
        stage_ok=Counter(ok or {"DETECT": 1}),
        stage_total=Counter(of or {"DETECT": 1}),
        roe_scored=roe_scored,
    )


def crit(level: int, cid: str) -> dict[str, Any]:
    return next(c for c in record.rules()["levels"][level]["criteria"] if c["id"] == cid)


def test_sessions_criterion_counts_difficulty_total_and_night() -> None:
    s = [fake(difficulty=3, total=70), fake(difficulty=3, total=69), fake(difficulty=2, total=90)]
    c = record._criterion(crit(2, "sessions"), s, 1000)  # 3+ at D3+ scoring 70+
    assert (c.value, c.met) == (1, False)
    assert record._criterion(crit(2, "sessions"), s + [fake(difficulty=4, total=75)] * 2, 0).met
    night = crit(1, "night")  # 1+ night session scoring 60+
    assert not record._criterion(night, [fake(total=90)], 0).met
    assert not record._criterion(night, [fake(night=True, total=59)], 0).met
    assert record._criterion(night, [fake(night=True, total=60)], 0).met


def test_stage_ok_uses_the_window_of_the_latest_sessions() -> None:
    detect = crit(0, "detect")  # Detect OK >= 70 % over the last 3
    old_bad = [fake(ok={"DETECT": 0}, of={"DETECT": 5})] * 4
    recent_good = [fake(ok={"DETECT": 3}, of={"DETECT": 4})] * 3
    c = record._criterion(detect, old_bad + recent_good, 0)
    assert (c.value, c.target, c.met) == (75, 70, True)
    assert not record._criterion(detect, recent_good + old_bad, 0).met
    assert record._criterion(detect, [], 0).value is None


def test_window_respects_the_difficulty_floor() -> None:
    identify = crit(1, "identify")  # last 5 at D2+
    good_d2 = [fake(difficulty=2, ok={"IDENTIFY": 1}, of={"IDENTIFY": 1})] * 5
    bad_d1 = [fake(difficulty=1, ok={"IDENTIFY": 0}, of={"IDENTIFY": 1})] * 5
    assert record._criterion(identify, good_d2 + bad_d1, 0).met


def test_mean_latency_no_leaves_component_and_rating() -> None:
    lat = crit(1, "latency")
    slow = fake(difficulty=2, contacts=[contact(detection_latency_s=20.0)])
    fast = fake(difficulty=2, contacts=[contact(detection_latency_s=5.0)])
    assert record._criterion(lat, [slow, fast], 0).value == 12.5
    assert not record._criterion(lat, [slow], 0).met
    frat = crit(0, "fratricide")
    bad = fake(
        contacts=[contact(), contact(contact_id="c02", is_threat=False, leaves=["FRATRICIDE"])]
    )
    assert not record._criterion(frat, [bad, fake(), fake()], 0).met  # within the last 3
    assert record._criterion(frat, [bad, fake(), fake(), fake()], 0).met  # dropped out
    report = crit(2, "report")  # report >= 60 % over the last 5 at D3+, scoring trees only
    v1 = fake(difficulty=3, components={"report": None})
    v4 = fake(difficulty=3, components={"report": 60.0})
    c = record._criterion(report, [v4, v1, v1], 0)
    assert (c.value, c.met) == (60, True)
    assert not record._criterion(report, [v1], 0).met
    assert record._criterion(crit(3, "rating"), [], 1300).met
    assert not record._criterion(crit(3, "rating"), [], 1299).met


def endorsement(code: str, sessions: list[Any]) -> Any:
    rule = next(r for r in record.rules()["endorsements"] if r["code"] == code)
    return record._endorsement(rule, sessions)


def test_single_session_endorsements() -> None:
    leaked = fake(night=True, total=90, contacts=[contact(outcome="LEAKED")])
    assert not endorsement("NIGHT_OPS", [leaked, fake(total=95)]).earned
    night = fake(night=True, total=70)
    e = endorsement("NIGHT_OPS", [leaked, night])
    assert e.earned and e.session_id == night.id

    pcs = [contact(contact_id=f"c0{i}") for i in range(3)]
    swarm_specs = [
        SimpleNamespace(id=c.contact_id, is_threat=True, group_id="g1", control_link="RF_MANUAL")
        for c in pcs
    ]
    assert endorsement("SWARM", [fake(contacts=pcs, specs=swarm_specs)]).earned
    pcs_leak = [*pcs[:2], contact(contact_id="c02", outcome="LEAKED")]
    assert not endorsement("SWARM", [fake(contacts=pcs_leak, specs=swarm_specs)]).earned
    assert not endorsement("SWARM", [fake(contacts=pcs[:2], specs=swarm_specs[:2])]).earned

    fibre = [SimpleNamespace(id="c01", is_threat=True, group_id=None, control_link="FIBRE_OPTIC")]
    assert endorsement("SILENT_LINK", [fake(specs=fibre)]).earned
    lesson = fake(contacts=[contact(leaves=["DECISION_EW_LESSON"])], specs=fibre)
    assert not endorsement("SILENT_LINK", [lesson]).earned

    non = [contact(contact_id=f"n{i}", is_threat=False) for i in range(3)]
    assert endorsement("DISCRIMINATION", [fake(contacts=[contact(), *non])]).earned
    assert not endorsement("DISCRIMINATION", [fake(contacts=[contact(), *non[:2]])]).earned
    category = contact(classification_correct="CATEGORY")
    assert not endorsement("DISCRIMINATION", [fake(contacts=[category, *non])]).earned
    jammed = contact(contact_id="n9", is_threat=False, leaves=["CIVILIAN_JAMMED"])
    assert not endorsement("DISCRIMINATION", [fake(contacts=[contact(), *non, jammed])]).earned


def test_counted_and_streak_endorsements() -> None:
    good = fake(components={"report": 80.0})
    weak = fake(components={"report": 79.0})
    e = endorsement("REPORTING", [good, weak, good])
    assert not e.earned and (e.progress.count, e.progress.of) == (2, 3)
    assert endorsement("REPORTING", [good, weak, good, good]).earned

    clean = fake()
    attempt = fake(contacts=[contact(leaves=["ROE_VIOLATION_ATTEMPT"])])
    old_tree = fake(roe_scored=False, contacts=[contact(leaves=["ROE_VIOLATION_ATTEMPT"])])
    e = endorsement("ROE_DISCIPLINE", [clean] * 4 + [attempt] + [clean] * 4)
    assert not e.earned and e.progress.count == 4
    # Sessions on trees that do not score ROE neither count nor break the streak.
    assert endorsement("ROE_DISCIPLINE", [clean] * 2 + [old_tree] + [clean] * 3).earned

    right = fake(trust=SimpleNamespace(shown_wrong=2, rejected_wrong=2))
    fooled = fake(trust=SimpleNamespace(shown_wrong=1, rejected_wrong=0))
    none_wrong = fake(trust=SimpleNamespace(shown_wrong=0, rejected_wrong=0))
    assert not endorsement("CALIBRATED_TRUST", [right, fooled, none_wrong, right]).earned
    assert endorsement("CALIBRATED_TRUST", [right, fooled, right, right]).earned


# ---- API ------------------------------------------------------------------------------------


@pytest.fixture
def people(make_user: Callable[..., User], unit: Unit) -> dict[str, User]:
    return {
        "trainee": make_user(email="t1@test", unit_id=unit.id),
        "other": make_user(email="t2@test", unit_id=unit.id),
        "staff": make_user(UserRole.INSTRUCTOR, "instructor@test", unit_id=unit.id),
        "admin": make_user(UserRole.ADMIN, "admin@test"),
    }


def level(body: dict[str, Any], name: str) -> dict[str, Any]:
    return next(lv for lv in body["levels"] if lv["level"] == name)


def test_record_signoff_rules_review_due_and_notices(
    client: TestClient,
    auth_header: Headers,
    scenarios: dict[str, ScenarioRow],
    people: dict[str, User],
) -> None:
    t, staff, admin = people["trainee"], people["staff"], people["admin"]
    url = f"/api/v1/record/{t.id}"
    assert_error(client.get(url, headers=auth_header(people["other"])), 403, "FORBIDDEN")
    empty = client.get(url, headers=auth_header(t)).json()
    assert [lv["state"] for lv in empty["levels"]] == [
        "IN_PROGRESS",
        "LOCKED",
        "LOCKED",
        "LOCKED",
    ]
    assert empty["assessments"] == 0 and empty["canSignOff"] == []

    defended = assessment_log("s01_defended")
    for _ in range(3):
        play(client, auth_header(t), scenarios["S01"], defended)
    practice = fixture_log("s01_defended")
    play(client, auth_header(t), scenarios["S01"], practice, mode="PRACTICE")  # never counts
    body = client.get(url, headers=auth_header(staff)).json()
    basic = level(body, "BASIC_OPERATOR")
    assert body["assessments"] == 3
    assert basic["criteriaMet"] and basic["state"] == "IN_PROGRESS", basic
    assert body["canSignOff"] == ["BASIC_OPERATOR"]
    assert client.get(url, headers=auth_header(t)).json()["canSignOff"] == []

    sign = f"{url}/signoffs"
    for who in (t, people["other"]):
        res = client.post(sign, json={"level": "BASIC_OPERATOR"}, headers=auth_header(who))
        assert_error(res, 403, "FORBIDDEN")
    own = client.post(
        f"/api/v1/record/{staff.id}/signoffs",
        json={"level": "BASIC_OPERATOR"},
        headers=auth_header(staff),
    )
    assert_error(own, 403, "FORBIDDEN")
    locked = client.post(sign, json={"level": "SENSOR_OPERATOR"}, headers=auth_header(staff))
    assert assert_error(locked, 422, "VALIDATION_ERROR")["details"]["reason"] == "LOCKED"
    instr = client.post(sign, json={"level": "INSTRUCTOR"}, headers=auth_header(staff))
    assert_error(instr, 403, "FORBIDDEN")  # admin only

    res = client.post(sign, json={"level": "BASIC_OPERATOR"}, headers=auth_header(staff))
    assert res.status_code == 201, res.text
    basic = level(res.json(), "BASIC_OPERATOR")
    assert basic["state"] == "QUALIFIED" and basic["signoff"]["byName"] == "instructor"
    assert not basic["reviewDue"]
    assert level(res.json(), "SENSOR_OPERATOR")["state"] == "IN_PROGRESS"
    again = client.post(sign, json={"level": "BASIC_OPERATOR"}, headers=auth_header(admin))
    assert assert_error(again, 422, "VALIDATION_ERROR")["details"]["reason"] == "ALREADY_QUALIFIED"
    unmet = client.post(sign, json={"level": "SENSOR_OPERATOR"}, headers=auth_header(admin))
    assert assert_error(unmet, 422, "VALIDATION_ERROR")["details"]["reason"] == "CRITERIA_NOT_MET"

    # Notices: the sign-off and the library update are unread until seen.
    notes = client.get("/api/v1/notices", headers=auth_header(t)).json()
    kinds = [n["kind"] for n in notes["items"]]
    assert "SIGNOFF" in kinds and "LIBRARY" in kinds and notes["unreadCount"] == len(kinds)
    assert client.post("/api/v1/notices/seen", headers=auth_header(t)).status_code == 204
    assert client.get("/api/v1/notices/count", headers=auth_header(t)).json()["unreadCount"] == 0

    # Three missed runs: the level stays qualified but is due for review.
    ignored = assessment_log("s01_ignored")
    for _ in range(3):
        play(client, auth_header(t), scenarios["S01"], ignored)
    basic = level(client.get(url, headers=auth_header(t)).json(), "BASIC_OPERATOR")
    assert basic["state"] == "QUALIFIED" and basic["reviewDue"] and not basic["criteriaMet"]


def test_remarks_are_staff_only_shown_in_the_aar_and_as_a_notice(
    client: TestClient,
    auth_header: Headers,
    scenarios: dict[str, ScenarioRow],
    people: dict[str, User],
) -> None:
    t, staff = people["trainee"], people["staff"]
    sid = play(client, auth_header(t), scenarios["S01"], assessment_log("s01_defended"))
    url = f"/api/v1/aar/sessions/{sid}/remarks"
    assert_error(client.post(url, json={"body": "x"}, headers=auth_header(t)), 403, "FORBIDDEN")
    assert_error(
        client.post(url, json={"body": "   "}, headers=auth_header(staff)), 422, "VALIDATION_ERROR"
    )
    assert_error(
        client.post(url, json={"body": "x" * 501}, headers=auth_header(staff)),
        422,
        "VALIDATION_ERROR",
    )
    res = client.post(url, json={"body": "  Report earlier.  "}, headers=auth_header(staff))
    assert res.status_code == 201, res.text
    assert res.json()["body"] == "Report earlier." and res.json()["authorName"] == "instructor"
    aar = client.get(f"/api/v1/aar/sessions/{sid}", headers=auth_header(t)).json()
    assert [r["body"] for r in aar["remarks"]] == ["Report earlier."]
    notes = client.get("/api/v1/notices", headers=auth_header(t)).json()["items"]
    remark = next(n for n in notes if n["kind"] == "REMARK")
    assert remark["unread"] and remark["href"] == f"/aar/session/{sid}?tab=remarks"
    assert remark["title"].startswith("Remark from instructor on S01")


def test_home_readiness_and_live_sessions(
    client: TestClient,
    auth_header: Headers,
    db: Session,
    scenarios: dict[str, ScenarioRow],
    people: dict[str, User],
    unit: Unit,
) -> None:
    t, staff = people["trainee"], people["staff"]
    home = client.get("/api/v1/home", headers=auth_header(t)).json()
    assert home["assessments"] == 0 and home["recent"] == [] and home["assignment"] is None
    assert home["nextLevel"]["level"] == "BASIC_OPERATOR"
    assert home["stages"][0]["stage"] == "DETECT"

    due = (datetime.now(UTC) - timedelta(days=1)).isoformat()
    res = client.post(
        "/api/v1/assignments",
        json={"scenarioId": str(scenarios["S04"].id), "userIds": [str(t.id)], "dueAt": due},
        headers=auth_header(staff),
    )
    assert res.status_code == 201, res.text
    for _ in range(3):
        play(client, auth_header(t), scenarios["S01"], assessment_log("s01_defended"))
    home = client.get("/api/v1/home", headers=auth_header(t)).json()
    assert home["assignment"]["scenarioCode"] == "S04" and home["openAssignments"] == 1
    assert home["assessments"] == 3 and len(home["recent"]) == 3
    detect = next(s for s in home["stages"] if s["stage"] == "DETECT")
    assert detect["total"] >= 3 and len(home["notices"]) <= 3

    board = client.get(f"/api/v1/units/{unit.id}/readiness", headers=auth_header(staff))
    assert board.status_code == 200, board.text
    rows = {r["name"]: r for r in board.json()["rows"]}
    assert set(rows) == {"t1", "t2"}  # trainees only
    assert rows["t1"]["awaitingSignoff"] == "BASIC_OPERATOR" and rows["t1"]["level"] is None
    assert rows["t1"]["overdueAssignments"] == 1 and rows["t1"]["lastTotal"] is not None
    assert rows["t2"]["assessments"] == 0 and rows["t2"]["lastAssessmentAt"] is None
    assert_error(
        client.get(f"/api/v1/units/{unit.id}/readiness", headers=auth_header(t)), 403, "FORBIDDEN"
    )

    live = client.post(
        "/api/v1/sessions",
        json={"scenarioId": str(scenarios["S01"].id), "mode": "PRACTICE", "simVersion": 5},
        headers=auth_header(t),
    ).json()["sessionId"]
    log = fixture_log("s01_defended")
    assert post_batch(client, live, auth_header(t), 0, log[:-1]).status_code == 200
    stale = client.post(
        "/api/v1/sessions",
        json={"scenarioId": str(scenarios["S01"].id), "mode": "PRACTICE", "simVersion": 5},
        headers=auth_header(people["other"]),
    ).json()["sessionId"]
    assert post_batch(client, stale, auth_header(people["other"]), 0, log[:2]).status_code == 200
    row = db.get(TrainingSession, uuid.UUID(stale))
    assert row is not None
    row.last_batch_at = datetime.now(UTC) - timedelta(minutes=2)
    db.commit()

    res = client.get(f"/api/v1/sessions/active?unit={unit.id}", headers=auth_header(staff))
    assert res.status_code == 200, res.text
    items = res.json()["items"]
    assert [i["sessionId"] for i in items] == [live]
    assert items[0]["simTMs"] == log[-2]["tMs"] and items[0]["userName"] == "t1"
    assert_error(client.get("/api/v1/sessions/active", headers=auth_header(t)), 403, "FORBIDDEN")


STATUS_KEYS = {
    "components": {"api", "database", "llmEnabled"},
    "versions": {"api", "generator", "terrain"},
}


def test_status_is_public_and_carries_only_allowed_keys(client: TestClient, settings: Any) -> None:
    res = client.get("/api/v1/status")  # no token
    assert res.status_code == 200, res.text
    body = res.json()
    assert set(body) == set(STATUS_KEYS)
    for key, allowed in STATUS_KEYS.items():
        assert set(body[key]) == allowed
    assert body["components"] == {"api": "OK", "database": "OK", "llmEnabled": False}
    assert isinstance(body["versions"]["generator"], int)
    terrain = body["versions"]["terrain"]
    assert terrain and all(isinstance(v, int) and k.isupper() for k, v in terrain.items())
    text = res.text.lower()
    for secret in ("localhost", "postgres", "vyuh_test", settings.llm_model.lower(), "openrouter"):
        assert secret not in text


def test_scoring_summary_is_read_from_the_current_tree(
    client: TestClient, auth_header: Headers, people: dict[str, User]
) -> None:
    res = client.get("/api/v1/scoring/summary", headers=auth_header(people["trainee"]))
    assert res.status_code == 200, res.text
    body = res.json()
    tree = json.loads((TREE_DIR / f"{body['current']}.json").read_text("utf-8"))
    assert body["current"] == "default_v4" and body["componentMax"] == tree["componentMax"]
    assert body["detectionBandsS"] == [5, 15, 30]
    leaves = {leaf["code"]: leaf for leaf in body["leaves"]}
    assert leaves["FRATRICIDE"]["adjust"] == -40 and leaves["FRATRICIDE"]["component"] is None
    assert leaves["LATENCY_UNDER_5S"] == {
        "code": "LATENCY_UNDER_5S",
        "component": "detection",
        "points": 25,
        "adjust": None,
    }


def test_demo_record_shows_every_level_state(
    db: Session, scenarios: dict[str, ScenarioRow]
) -> None:
    from app.seed.demo import seed_units, seed_users
    from app.seed.demo_history import _user, seed_demo_history, seed_demo_record

    seed_users(db, seed_units(db))
    db.commit()
    seed_demo_history(db)
    assert seed_demo_record(db) >= 1
    assert seed_demo_record(db) == seed_demo_record(db)  # rebuilt, not duplicated
    states: set[tuple[str, str, bool]] = set()
    for i in range(1, 7):
        user = _user(db, f"trainee{i}@demo")
        assert user is not None
        for lv in record.build_record(db, user).levels:
            states.add((lv.level.value, lv.state.value, lv.criteria_met))
    seen = {s for _, s, _ in states}
    assert seen == {"LOCKED", "IN_PROGRESS", "QUALIFIED"}
    assert ("SENSOR_OPERATOR", "IN_PROGRESS", True) in states  # criteria met, awaiting sign-off


def test_confused_with_is_generated_for_every_class() -> None:
    from app.services.generator.contacts import profiles

    for cls, p in profiles().items():
        assert p["confusedWith"] and cls not in p["confusedWith"]
        assert all(c in profiles() for c in p["confusedWith"])
