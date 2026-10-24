"""GET /aar/sessions/{id} and the kill-chain breakdown (Phase 4a Step 7, decision 105)."""

import json
from collections.abc import Callable
from typing import Any

from fastapi.testclient import TestClient

from app.models import Scenario as ScenarioRow
from app.models import User
from app.schemas.generated import Scenario, UserRole
from app.seed.scenarios import SCENARIO_DIR
from app.services.analytics.kill_chain import kill_chain
from tests.conftest import assert_error, fixture_log
from tests.test_sessions import post_batch

Headers = Callable[[User], dict[str, str]]
S01 = Scenario.model_validate(json.loads((SCENARIO_DIR / "S01.json").read_text(encoding="utf-8")))
STAGES = ["DETECT", "TRACK", "IDENTIFY", "DECIDE", "RESPOND", "ASSESS"]


def statuses(events: list[dict[str, Any]], contact: str = "c01") -> dict[str, str]:
    row = next(r for r in kill_chain(S01, events) if r.contact_id == contact)
    assert [s.stage.value for s in row.stages] == STAGES
    return {s.stage.value: s.status.value for s in row.stages}


def _complete(
    client: TestClient, sid: str, headers: dict[str, str], log: list[dict[str, Any]]
) -> None:
    for i in range(0, len(log), 500):
        assert post_batch(client, sid, headers, i // 500, log[i : i + 500]).status_code == 200
    body = {"endTMs": log[-1]["tMs"], "clientMeta": {}}
    res = client.post(f"/api/v1/sessions/{sid}/complete", json=body, headers=headers)
    assert res.status_code == 200, res.text


# ---- API -------------------------------------------------------------------------------


def test_aar_for_owner_and_staff_after_completion_only(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    owner = make_user()
    headers = auth_header(owner)
    sid = start_session(owner, scenarios["S01"])
    url = f"/api/v1/aar/sessions/{sid}"
    err = assert_error(client.get(url, headers=headers), 409, "SESSION_NOT_ACTIVE")
    assert err["details"] == {"status": "CREATED"}  # no ground truth before completion

    log = fixture_log("s01_defended")
    _complete(client, sid, headers, log)
    body = client.get(url, headers=headers).json()
    assert set(body) == {"session", "scenario", "events", "killChain", "aiTrust"}
    assert body["session"]["status"] == "COMPLETED"
    assert body["session"]["terrainRevision"] == 1
    assert body["scenario"] == scenarios["S01"].content
    assert body["events"] == log  # the stored log, exactly
    assert [r["contactId"] for r in body["killChain"]] == ["c01"]
    assert "null" not in json.dumps(body["killChain"])

    staff = auth_header(make_user(UserRole.INSTRUCTOR, "i@test"))
    assert client.get(url, headers=staff).status_code == 200
    stranger = auth_header(make_user(email="other@test"))
    assert_error(client.get(url, headers=stranger), 403, "FORBIDDEN")


def test_aar_returns_report_truth_events(
    client: TestClient,
    scenarios: dict[str, ScenarioRow],
    make_user: Callable[..., User],
    auth_header: Headers,
    start_session: Callable[..., str],
) -> None:
    user = make_user()
    headers = auth_header(user)
    sid = start_session(user, scenarios["S04"], "ASSESSMENT")
    log = fixture_log("s04_reports")
    _complete(client, sid, headers, log)
    body = client.get(f"/api/v1/aar/sessions/{sid}", headers=headers).json()
    assert body["events"] == log
    assert any(e["type"] == "REPORT_TRUTH" for e in body["events"])
    s04 = Scenario.model_validate(scenarios["S04"].content)
    assert len(body["killChain"]) == len(s04.contacts)
    end = log[-1]["tMs"]
    for row in body["killChain"]:
        assert all(0 <= s["jumpTMs"] <= end for s in row["stages"]), row


# ---- kill chain, real logs ---------------------------------------------------------------


def test_defended_run_is_ok_at_every_stage() -> None:
    assert statuses(fixture_log("s01_defended")) == {
        "DETECT": "OK",
        "TRACK": "OK",
        "IDENTIFY": "OK",
        "DECIDE": "OK",
        "RESPOND": "OK",  # it waited 77 s for range: waiting is not late
        "ASSESS": "OK",
    }
    row = kill_chain(S01, fixture_log("s01_defended"))[0]
    respond = row.stages[4]
    assert (respond.action, respond.truth) == ("Intercept · NEUTRALISED", "Jam or intercept")
    assert row.outcome is not None and row.outcome.value == "NEUTRALISED"


def test_ignored_run_misses_every_action_stage() -> None:
    assert statuses(fixture_log("s01_ignored")) == {
        "DETECT": "MISSED",
        "TRACK": "MISSED",
        "IDENTIFY": "MISSED",
        "DECIDE": "MISSED",
        "RESPOND": "MISSED",
        "ASSESS": "NOT_APPLICABLE",
    }


# ---- kill chain, built logs --------------------------------------------------------------


def ev(t: int, kind: str, **extra: Any) -> dict[str, Any]:
    return {"tMs": t, "type": kind, "payload": extra.pop("payload", {}), **extra}


BASE = [
    ev(0, "SESSION_STARTED", payload={"mode": "PRACTICE", "scenarioId": "S01", "seed": 1001}),
    ev(15000, "CONTACT_SPAWNED", contactId="c01"),
    ev(
        20000,
        "SENSOR_TRACK_CREATED",
        contactId="c01",
        trackId="T001",
        payload={"sensorId": "rad1", "sensorKind": "RADAR", "rangeM": 2300, "bearingDeg": 4},
    ),
]


def order(t: int, response: str = "INTERCEPT") -> dict[str, Any]:
    return ev(t, "RESPONSE_ORDERED", trackId="T001", payload={"response": response})


def outcome(t: int, result: str, response: str = "INTERCEPT") -> dict[str, Any]:
    return ev(
        t,
        "RESPONSE_OUTCOME",
        trackId="T001",
        contactId="c01",
        payload={"response": response, "result": result},
    )


def seq(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**e, "seq": i} for i, e in enumerate(events)]


def test_late_detection_and_wrong_calls() -> None:
    log = seq(
        [
            *BASE,
            ev(60000, "MARKED_DETECTED", trackId="T001"),
            ev(61000, "CLASSIFIED", trackId="T001", payload={"class": "BIRD_SMALL"}),
            ev(62000, "AFFILIATION_SET", trackId="T001", payload={"affiliation": "NEUTRAL"}),
        ]
    )
    st = statuses(log)
    assert (st["DETECT"], st["TRACK"], st["IDENTIFY"], st["DECIDE"]) == (
        "LATE",
        "MISSED",
        "WRONG",
        "WRONG",
    )
    detect = kill_chain(S01, log)[0].stages[0]
    assert (detect.available_t_ms, detect.action_t_ms, detect.latency_s) == (20000, 60000, 40.0)
    assert detect.jump_t_ms == 60000


def test_miss_then_re_engage_and_miss_without_follow_up() -> None:
    again = seq([*BASE, order(90000), outcome(90000, "MISSED"), order(97000)])
    assert statuses(again)["ASSESS"] == "OK"
    assess = kill_chain(S01, again)[0].stages[5]
    assert (assess.available_t_ms, assess.action_t_ms, assess.truth) == (
        90000,
        97000,
        "MISSED: re-engage",
    )
    alone = seq([*BASE, order(90000), outcome(90000, "MISSED")])
    assert statuses(alone)["ASSESS"] == "MISSED"


def test_rounds_after_neutralisation_are_wrong_at_assess() -> None:
    log = seq(
        [
            *BASE,
            order(90000),
            outcome(90000, "NEUTRALISED"),
            ev(90000, "CONTACT_NEUTRALISED", contactId="c01", payload={"by": "INTERCEPT"}),
            order(95000),
        ]
    )
    assert statuses(log)["ASSESS"] == "WRONG"


def test_jam_on_rf_link_is_right_and_spoof_is_wrong() -> None:
    assert statuses(seq([*BASE, order(90000, "EW_JAM")]))["RESPOND"] == "OK"
    st = statuses(seq([*BASE, order(90000, "EW_SPOOF"), outcome(90000, "NO_EFFECT", "EW_SPOOF")]))
    assert st["RESPOND"] == "WRONG"


def test_response_after_the_leak_is_late() -> None:
    log = seq(
        [
            *BASE,
            ev(80000, "CONTACT_REACHED_ASSET", contactId="c01", payload={"assetId": "a1"}),
            order(81000),
        ]
    )
    assert statuses(log)["RESPOND"] == "LATE"
