"""One test per plausibility rule (SPEC §3.3), on hand-built event logs."""

import json
from typing import Any

import pytest

from app.schemas.generated import Scenario
from app.seed.scenarios import SCENARIO_DIR
from app.services.plausibility import (
    MAX_EVENTS_PER_SESSION,
    LogState,
    advance_state,
    check_batch,
)
from tests.conftest import fixture_log

S01 = Scenario.model_validate(json.loads((SCENARIO_DIR / "S01.json").read_text(encoding="utf-8")))
SHARED_API = SCENARIO_DIR.parents[4] / "packages" / "shared" / "src" / "api.ts"


def started(**payload: Any) -> dict[str, Any]:
    base = {"mode": "PRACTICE", "scenarioId": "S01", "seed": S01.seed}
    return {"seq": 0, "tMs": 0, "type": "SESSION_STARTED", "payload": {**base, **payload}}


def ev(seq: int, t: int, kind: str, **extra: Any) -> dict[str, Any]:
    return {"seq": seq, "tMs": t, "type": kind, "payload": extra.pop("payload", {}), **extra}


def track(seq: int, t: int, track_id: str = "T001", contact: str = "c01") -> dict[str, Any]:
    payload = {"sensorId": "rad1", "sensorKind": "RADAR", "rangeM": 2000, "bearingDeg": 5}
    return ev(seq, t, "SENSOR_TRACK_CREATED", contactId=contact, trackId=track_id, payload=payload)


def rules(events: list[dict[str, Any]], state: LogState | None = None) -> list[str]:
    return [v.rule for v in check_batch(S01, state or LogState(), events, mode="PRACTICE")]


def test_real_sim_logs_are_plausible() -> None:
    for name in ("s01_defended", "s01_ignored"):
        assert rules(fixture_log(name)) == [], name


def test_limit_mirrors_shared_ts() -> None:
    assert f"MAX_EVENTS_PER_SESSION = {MAX_EVENTS_PER_SESSION:_}" in SHARED_API.read_text("utf-8")


@pytest.mark.parametrize(
    ("events", "rule"),
    [
        ([started(), ev(2, 50, "CONTACT_SPAWNED", contactId="c01")], "SEQ_NOT_CONTIGUOUS"),
        (
            [started(), ev(1, 5000, "CONTACT_SPAWNED", contactId="c01"), track(2, 4000)],
            "TIME_NOT_MONOTONIC",
        ),
        (
            [started(), ev(1, 180_050, "SESSION_ENDED", payload={"reason": "TIME_UP"})],
            "TIME_OUT_OF_RANGE",
        ),
        ([ev(0, 0, "CONTACT_SPAWNED", contactId="c01")], "FIRST_NOT_SESSION_STARTED"),
        ([started(seed=1)], "SESSION_START_MISMATCH"),
        ([started(scenarioId="S02")], "SESSION_START_MISMATCH"),
        ([started(mode="ASSESSMENT")], "SESSION_START_MISMATCH"),
        ([started(), started() | {"seq": 1}], "DUPLICATE_SESSION_STARTED"),
        ([started(), ev(1, 50, "CONTACT_SPAWNED", contactId="c99")], "UNKNOWN_CONTACT"),
        ([started(), track(1, 14_000)], "DETECTION_BEFORE_SPAWN"),
        ([started(), track(1, 20_000), track(2, 22_000)], "DUPLICATE_TRACK"),
        (
            [
                started(),
                ev(1, 20_000, "CLASSIFIED", trackId="T001", payload={"class": "QUAD_SMALL"}),
            ],
            "UNKNOWN_TRACK",
        ),
        ([started(), ev(1, 20_000, "MARKED_DETECTED", trackId="T001")], "UNKNOWN_TRACK"),
        (
            [
                started(),
                ev(
                    1,
                    20_000,
                    "CAMERA_SLEWED",
                    trackId="T009",
                    payload={"azDeg": 0, "elDeg": 0, "zoom": 1},
                ),
            ],
            "UNKNOWN_TRACK",
        ),
        (
            [
                started(),
                track(1, 20_000),
                ev(
                    2,
                    30_000,
                    "CONTACT_DROPPED",
                    contactId="c01",
                    trackId="T009",
                    payload={"x": 0, "z": 0},
                ),
            ],
            "UNKNOWN_TRACK",
        ),
        (
            [started(), ev(1, 1000, "CONTACT_DROPPED", contactId="c01", payload={"x": 0, "z": 0})],
            "DROP_BEFORE_SPAWN",
        ),
        (
            [
                started(),
                ev(1, 1000, "SESSION_ENDED", payload={"reason": "ABORTED"}),
                ev(2, 1000, "TRACK_SELECTED", trackId="T001"),
            ],
            "EVENT_AFTER_END",
        ),
    ],
)
def test_rule(events: list[dict[str, Any]], rule: str) -> None:
    assert rule in rules(events)


def test_observed_and_unobserved_drops_are_fine() -> None:
    drop = {"x": 10, "z": 600}
    events = [
        started(),
        track(1, 20_000),
        ev(2, 30_000, "CONTACT_DROPPED", contactId="c01", trackId="T001", payload=drop),
    ]
    assert rules(events) == []
    assert rules([started(), ev(1, 30_000, "CONTACT_DROPPED", contactId="c01", payload=drop)]) == []


def test_classification_after_detection_is_fine() -> None:
    events = [
        started(),
        track(1, 20_000),
        ev(2, 20_050, "CLASSIFIED", trackId="T001", payload={"class": "QUAD_SMALL"}),
    ]
    assert rules(events) == []


def test_rules_span_batches() -> None:
    state = LogState()
    first = [started(), track(1, 20_000)]
    assert rules(first, state) == []
    advance_state(state, first)
    assert state.last_seq == 1
    assert state.known_tracks == {"T001": "c01"}
    assert rules([ev(2, 20_050, "MARKED_DETECTED", trackId="T001")], state) == []
    assert rules([ev(3, 20_050, "MARKED_DETECTED", trackId="T001")], state) == [
        "SEQ_NOT_CONTIGUOUS"
    ]
    assert "TIME_NOT_MONOTONIC" in rules([ev(2, 19_000, "TRACK_SELECTED", trackId="T001")], state)


def test_too_many_events() -> None:
    state = LogState(last_seq=0, event_count=MAX_EVENTS_PER_SESSION)
    assert "TOO_MANY_EVENTS" in rules([ev(1, 50, "TRACK_SELECTED", trackId="T001")], state)


# ---- REPORT_TRUTH (decision 104) ------------------------------------------------------

S04 = Scenario.model_validate(json.loads((SCENARIO_DIR / "S04.json").read_text(encoding="utf-8")))


def s04_rules(events: list[dict[str, Any]], state: LogState | None = None) -> list[str]:
    return [v.rule for v in check_batch(S04, state or LogState(), events, mode="ASSESSMENT")]


def _first_report(log: list[dict[str, Any]]) -> int:
    return next(i for i, e in enumerate(log) if e["type"] == "REPORT_SUBMITTED")


def _renumber(log: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [{**e, "seq": i} for i, e in enumerate(log)]


def test_real_log_with_reports_is_plausible() -> None:
    assert s04_rules(fixture_log("s04_reports")) == []


def test_report_split_from_its_truth_across_batches_is_plausible() -> None:
    log = fixture_log("s04_reports")
    cut = _first_report(log) + 1  # the batch ends with REPORT_SUBMITTED
    state = LogState()
    assert s04_rules(log[:cut], state) == []
    advance_state(state, log[:cut])
    assert state.pending_report is not None
    assert s04_rules(log[cut:], state) == []


def test_report_without_truth_is_rejected() -> None:
    log = fixture_log("s04_reports")
    i = _first_report(log)
    assert log[i + 1]["type"] == "REPORT_TRUTH"
    assert "REPORT_TRUTH_MISSING" in s04_rules(_renumber(log[: i + 1] + log[i + 2 :]))


def test_truth_without_its_report_or_with_other_contacts_is_rejected() -> None:
    log = fixture_log("s04_reports")
    i = _first_report(log)
    orphan = _renumber(log[:i] + log[i + 1 :])
    assert "REPORT_TRUTH_MISMATCH" in s04_rules(orphan)

    wrong = [dict(e) for e in log]
    truth = wrong[i + 1]["payload"]
    wrong[i + 1] = {
        **wrong[i + 1],
        "payload": {**truth, "contacts": [{**c, "contactId": "c99"} for c in truth["contacts"]]},
    }
    assert {"REPORT_TRUTH_MISMATCH", "UNKNOWN_CONTACT"} <= set(s04_rules(wrong))

    far = [dict(e) for e in log]
    far[i + 1] = {
        **far[i + 1],
        "payload": {**truth, "contacts": [{**c, "aglM": 50_000} for c in truth["contacts"]]},
    }
    assert "REPORT_TRUTH_OUT_OF_BOUNDS" in s04_rules(far)


def test_report_naming_an_unknown_track_is_rejected() -> None:
    log = [dict(e) for e in fixture_log("s04_reports")]
    i = _first_report(log)
    log[i] = {**log[i], "payload": {**log[i]["payload"], "trackIds": ["T999"]}}
    assert "UNKNOWN_TRACK" in s04_rules(log)
