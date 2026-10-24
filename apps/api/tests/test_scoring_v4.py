"""default_v4 (Phase 4a, decisions 115-116): contact reports, ROE interlock attempts,
penalty times, and v1-v3 re-scoring byte-identical."""

import json
from pathlib import Path
from typing import Any

import pytest

from app.schemas.generated import Scenario
from app.seed.scenarios import SCENARIO_DIR
from app.services.scoring.engine import score_session
from app.services.scoring.metrics import THREAT_CLASSES, contact_metrics
from app.services.scoring.report import altitude_band, score_report
from app.services.scoring.tree import evaluate, load_tree, render_feedback
from tests.test_scoring import LEAF_CASES_V3, ev, non_threat, threat

TREE_V4 = load_tree("default_v4")
TREE_V3 = load_tree("default_v3")
FIXTURES = Path(__file__).resolve().parent / "fixtures"


def scenario(code: str, **patch: Any) -> Scenario:
    raw = json.loads((SCENARIO_DIR / f"{code}.json").read_text(encoding="utf-8"))
    return Scenario.model_validate(raw | patch)


# ---- the tree -------------------------------------------------------------------------


def test_v4_is_v3_plus_report_and_roe_with_penalty_times() -> None:
    assert TREE_V4.component_max.report == 10
    assert TREE_V4.component_max.efficiency == 0
    assert TREE_V4.roots == ["reportRoot", "roeRoot"]
    v3 = {leaf.leaf: leaf for leaf in TREE_V3.all_leaves()}
    v4 = {leaf.leaf: leaf for leaf in TREE_V4.all_leaves()}
    assert set(v4) - set(v3) == {
        "REPORT_SCORED",
        "REPORT_NONE",
        "ROE_VIOLATION_ATTEMPT",
        "NO_KINETIC_VIOLATION_ATTEMPT",
    }
    for leaf_id, leaf in v3.items():
        # Same leaf, plus a time for every session-level adjustment.
        assert v4[leaf_id].model_copy(update={"t_metric": None}) == leaf, leaf_id
        assert (v4[leaf_id].t_metric is not None) == (leaf.adjust is not None), leaf_id
    for leaf in v4.values():
        if leaf.adjust is not None:
            assert leaf.t_metric, leaf.leaf


REPORT = {
    "reportsSent": 1,
    "reportPoints": 8.5,
    "reportTMs": 80_000,
    "reportDelayS": 58.0,
    "reportTimeliness": 3.0,
    "reportCount": 2.0,
    "reportClass": 2.0,
    "reportLocation": 1.0,
    "reportHeading": 0.0,
    "reportHeightActivity": 0.5,
    "reportTrueCount": 1,
}
NO_ROE = {"roeViolationTMs": None, "noKineticViolationTMs": None}

# v3's leaves, each still reached by the main tree in v4.
LEAF_CASES_V4: list[tuple[str, dict[str, Any], str | None, float]] = [
    (leaf, metrics | NO_ROE | {"reportPoints": None}, component, points)
    for leaf, metrics, component, points in LEAF_CASES_V3
] + [
    ("REPORT_SCORED", threat(**REPORT, **NO_ROE), "report", 8.5),
    ("REPORT_NONE", threat(reportPoints=None, **NO_ROE), "report", 0),
    (
        "ROE_VIOLATION_ATTEMPT",
        non_threat(
            roeViolationTMs=95_000,
            roeViolationTrackId="T004",
            roeRule="weapons tight — intercept only tracks classified as a threat type "
            "and declared HOSTILE",
            noKineticViolationTMs=None,
        ),
        None,
        -10,
    ),
    (
        "NO_KINETIC_VIOLATION_ATTEMPT",
        threat(
            reportPoints=None,
            roeViolationTMs=None,
            noKineticViolationTMs=120_000,
            noKineticViolationTrackId="T001",
            noKineticZone="the village (zone Z1)",
        ),
        None,
        -10,
    ),
]


@pytest.mark.parametrize(("leaf_id", "metrics", "component", "points"), LEAF_CASES_V4)
def test_leaf_v4(
    leaf_id: str, metrics: dict[str, Any], component: str | None, points: float
) -> None:
    from app.services.scoring.tree import leaf_points

    reached = {leaf.leaf: leaf for leaf in evaluate(TREE_V4, metrics)}
    assert leaf_id in reached, list(reached)
    leaf = reached[leaf_id]
    assert leaf.component == component
    got = leaf.adjust if leaf.adjust is not None else leaf_points(leaf, metrics)
    assert got == points
    text = render_feedback(leaf.feedback, metrics)
    assert "{" not in text and "?" not in text, text
    assert text.strip()


def test_every_v4_leaf_has_a_case() -> None:
    assert {leaf.leaf for leaf in TREE_V4.all_leaves()} == {case[0] for case in LEAF_CASES_V4}


def test_non_threats_get_no_report_leaf() -> None:
    leaves = [leaf.leaf for leaf in evaluate(TREE_V4, non_threat(**NO_ROE))]
    assert not any(leaf.startswith("REPORT") for leaf in leaves)


def test_report_points_are_capped_at_the_component_max() -> None:
    from app.services.scoring.tree import leaf_points

    leaf = next(x for x in TREE_V4.all_leaves() if x.leaf == "REPORT_SCORED")
    assert leaf_points(leaf, {"reportPoints": 12}) == 10
    assert leaf_points(leaf, {"reportPoints": -1}) == 0


# ---- report sub-scores (SPEC §9.5) ----------------------------------------------------

TRUTH = {
    "contactId": "c01",
    "x": 0.0,
    "z": 2000.0,
    "aglM": 60.0,
    "headingDeg": 180.0,
    "speedMps": 12.0,
    "activity": "APPROACHING",
}


def report(**over: Any) -> dict[str, Any]:
    base = {
        "tMs": 70_000,
        "trackIds": ["T001"],
        "count": 1,
        "class": "QUAD_SMALL",
        "affiliation": "HOSTILE",
        # 2 km due north of a sensor at the origin.
        "location": {"bearingDeg": 0.0, "rangeM": 2000.0, "fromSensorId": "r1"},
        "headingDeg": 180.0,
        "altitudeBand": "MEDIUM",
        "activity": "APPROACHING",
    }
    return base | over


def sub(rep: dict[str, Any], truth: dict[str, Any] = TRUTH, **kw: Any) -> dict[str, float]:
    args: dict[str, Any] = {
        "start_t_ms": 10_000,
        "true_count": 1,
        "true_class": "QUAD_SMALL",
        "sensor_xz": (0.0, 0.0),
        "threat_classes": THREAT_CLASSES,
    } | kw
    return score_report(rep, truth, **args)


def test_a_perfect_report_scores_ten() -> None:
    assert sub(report())["total"] == 10


@pytest.mark.parametrize(
    ("delay_s", "points"), [(0, 3), (60, 3), (120, 1.5), (150, 0.75), (180, 0), (400, 0)]
)
def test_timeliness_full_to_60_s_then_linear_to_0_at_180_s(delay_s: float, points: float) -> None:
    assert sub(report(tMs=10_000 + int(delay_s * 1000)))["timeliness"] == points


@pytest.mark.parametrize(
    ("reported", "true_count", "points"),
    [(1, 1, 2), (2, 1, 1), (3, 1, 0), (12, 12, 2), (10, 12, 1), (9, 12, 0), (13, 12, 1), (5, 4, 1)],
)
def test_count_exact_or_within_one_or_20_percent_for_swarms(
    reported: int, true_count: int, points: float
) -> None:
    assert sub(report(count=reported), true_count=true_count)["count"] == points


@pytest.mark.parametrize(
    ("cls", "points"), [("QUAD_SMALL", 2), ("FPV", 1), ("BIRD_LARGE", 0), ("UNKNOWN", 0)]
)
def test_class_exact_or_category(cls: str, points: float) -> None:
    assert sub(report(**{"class": cls}))["class"] == points


def test_location_within_300_m_of_the_truth() -> None:
    assert sub(report())["location"] == 1
    near = {"bearingDeg": 0.0, "rangeM": 2290.0, "fromSensorId": "r1"}
    far = {"bearingDeg": 0.0, "rangeM": 2310.0, "fromSensorId": "r1"}
    assert sub(report(location=near))["location"] == 1
    assert sub(report(location=far))["location"] == 0
    # A sensor the scenario does not have gives no location credit.
    assert sub(report(), sensor_xz=None)["location"] == 0


def test_heading_within_30_degrees_or_any_while_hovering() -> None:
    assert sub(report(headingDeg=209.0))["heading"] == 1
    assert sub(report(headingDeg=211.0))["heading"] == 0
    assert sub(report(headingDeg=355.0), {**TRUTH, "headingDeg": 10.0})["heading"] == 1
    hovering = {**TRUTH, "activity": "HOVERING", "speedMps": 0.2}
    assert sub(report(headingDeg=90.0, activity="HOVERING"), hovering)["heading"] == 1


def test_altitude_band_and_activity_half_a_point_each() -> None:
    assert sub(report())["heightActivity"] == 1
    assert sub(report(altitudeBand="LOW"))["heightActivity"] == 0.5
    assert sub(report(activity="LOITERING"))["heightActivity"] == 0.5
    assert sub(report(altitudeBand="HIGH", activity="UNKNOWN"))["heightActivity"] == 0


@pytest.mark.parametrize(
    ("agl", "band"), [(0, "LOW"), (49.9, "LOW"), (50, "MEDIUM"), (150, "MEDIUM"), (150.1, "HIGH")]
)
def test_altitude_bands_match_the_shared_rule(agl: float, band: str) -> None:
    assert altitude_band(agl) == band


# ---- metrics from a log ---------------------------------------------------------------


def _report_log(
    *reports: tuple[int, list[str], dict[str, Any], list[dict[str, Any]]],
) -> list[dict[str, Any]]:
    """S01 c01 tracked as T001, marked at 25 s; each report with its REPORT_TRUTH."""
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        ev(2, 25_000, "MARKED_DETECTED", trackId="T001"),
    ]
    seq = 3
    for t_ms, tracks, over, truth in reports:
        events.append(
            ev(seq, t_ms, "REPORT_SUBMITTED", payload=report(tMs=t_ms, trackIds=tracks) | over)
        )
        events.append(
            ev(seq + 1, t_ms, "REPORT_TRUTH", payload={"reportSeq": seq, "contacts": truth})
        )
        seq += 2
    return events


def _s01_v4() -> Scenario:
    return scenario("S01", scoringTreeId="default_v4")


def _truth_at_s01(sc: Scenario, cid: str = "c01") -> dict[str, Any]:
    radar = next(s for s in sc.sensors if s.kind == "RADAR")
    return {**TRUTH, "contactId": cid, "x": radar.x, "z": radar.z + 2000.0}


def test_each_threat_is_scored_on_its_best_report_timed_from_the_mark() -> None:
    sc = _s01_v4()
    radar = next(s for s in sc.sensors if s.kind == "RADAR")
    loc = {"location": {"bearingDeg": 0.0, "rangeM": 2000.0, "fromSensorId": radar.id}}
    truth = [_truth_at_s01(sc)]
    events = _report_log(
        (40_000, ["T001"], loc | {"class": "UNKNOWN"}, truth),  # 15 s after the mark
        (200_000, ["T001"], loc, truth),  # 175 s after: late
    )
    m = {x["contactId"]: x for x in contact_metrics(sc, events)}["c01"]
    assert m["reportsSent"] == 2
    # First: 3 + 2 + 0 + 1 + 1 + 1 = 8; second: 0.13 + 2 + 2 + 1 + 1 + 1 = 7.13.
    assert m["reportPoints"] == 8
    assert m["reportTMs"] == 40_000
    assert m["reportDelayS"] == 15.0
    score = score_session(sc, events)
    assert score.components.report == 8
    assert score.tree_version == "default_v4"


def test_timeliness_runs_from_first_detectable_when_never_marked() -> None:
    sc = _s01_v4()
    events = [
        e
        for e in _report_log((140_000, ["T001"], {}, [_truth_at_s01(sc)]))
        if e["type"] != "MARKED_DETECTED"
    ]
    m = {x["contactId"]: x for x in contact_metrics(sc, events)}["c01"]
    assert m["reportDelayS"] == 120.0  # from the track at 20 s
    assert m["reportTimeliness"] == 1.5


def test_a_threat_never_reported_scores_zero_for_report() -> None:
    sc = _s01_v4()
    score = score_session(sc, _report_log())
    assert score.components.report == 0
    c01 = score.per_contact[0]
    assert "REPORT_NONE" in [leaf.root for leaf in c01.leaves]
    assert "No contact report on this threat. Send one for every threat track (R)." in c01.feedback


def test_reports_on_non_threats_only_are_neither_penalised_nor_credited() -> None:
    sc = scenario("S14", scoringTreeId="default_v4")
    threat_id = next(c.id for c in sc.contacts if c.is_threat)
    other = next(c.id for c in sc.contacts if not c.is_threat)
    base = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId=threat_id, trackId="T001"),
        ev(2, 21_000, "SENSOR_TRACK_CREATED", contactId=other, trackId="T002"),
    ]
    with_report = [
        *base,
        ev(3, 30_000, "REPORT_SUBMITTED", payload=report(tMs=30_000, trackIds=["T002"])),
        ev(
            4,
            30_000,
            "REPORT_TRUTH",
            payload={"reportSeq": 3, "contacts": [{**TRUTH, "contactId": other}]},
        ),
    ]
    a = score_session(sc, base)
    b = score_session(sc, with_report)
    assert a.total == b.total
    assert a.components == b.components
    assert a.penalties == b.penalties
    assert {x["contactId"]: x for x in contact_metrics(sc, with_report)}[threat_id][
        "reportsSent"
    ] == 0


def test_swarm_true_count_is_the_group_size() -> None:
    sc = scenario("S10", scoringTreeId="default_v4")
    groups: dict[str, list[str]] = {}
    for c in sc.contacts:
        if c.group_id and c.is_threat:
            groups.setdefault(c.group_id, []).append(c.id)
    members = max(groups.values(), key=len)
    assert len(members) > 1
    radar = next(s for s in sc.sensors if s.kind == "RADAR")
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId=members[0], trackId="T001"),
        ev(2, 25_000, "MARKED_DETECTED", trackId="T001"),
        ev(
            3,
            30_000,
            "REPORT_SUBMITTED",
            payload=report(
                tMs=30_000,
                count=len(members),
                location={"bearingDeg": 0.0, "rangeM": 1.0, "fromSensorId": radar.id},
            ),
        ),
        ev(
            4,
            30_000,
            "REPORT_TRUTH",
            payload={"reportSeq": 3, "contacts": [{**TRUTH, "contactId": members[0]}]},
        ),
    ]
    m = {x["contactId"]: x for x in contact_metrics(sc, events)}[members[0]]
    assert m["reportTrueCount"] == len(members)
    assert m["reportCount"] == 2


def test_the_s04_reports_log_scores_its_reports() -> None:
    """The committed S04 log (scripted trainee that reports every threat track)."""
    events = json.loads((FIXTURES / "s04_reports.json").read_text(encoding="utf-8"))
    sc = scenario("S04")
    assert sc.scoring_tree_id == "default_v4"
    score = score_session(sc, events)
    threats = [
        p
        for p in score.per_contact
        if p.is_threat and "REPORT_SCORED" in [x.root for x in p.leaves]
    ]
    assert threats, [p.leaves for p in score.per_contact]
    assert score.components.report > 0


# ---- ROE interlocks in Assessment (decision 116) --------------------------------------


def _blocked(seq: int, t: int, cid: str, track: str, result: str) -> dict[str, Any]:
    return ev(
        seq,
        t,
        "RESPONSE_OUTCOME",
        contactId=cid,
        trackId=track,
        payload={"response": "INTERCEPT", "result": result},
    )


def test_roe_and_no_kinetic_attempts_cost_10_each_once_per_contact_with_their_time() -> None:
    sc = scenario("S06")
    assert sc.scoring_tree_id == "default_v4"
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T002"),
        ev(2, 21_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        _blocked(3, 60_000, "c02", "T002", "BLOCKED_BY_ROE"),
        _blocked(4, 70_000, "c02", "T002", "BLOCKED_BY_ROE"),
        _blocked(5, 80_000, "c01", "T001", "BLOCKED_NO_KINETIC"),
        _blocked(6, 90_000, "c01", "T001", "BLOCKED_NO_KINETIC"),
        _blocked(7, 95_000, "c01", "T001", "BLOCKED_BY_ROE"),
    ]
    score = score_session(sc, events)
    got = sorted((p.contact_id, p.code, p.points, p.t_ms) for p in score.penalties)
    assert got == [
        ("c01", "NO_KINETIC_VIOLATION_ATTEMPT", -10, 80_000),
        ("c01", "ROE_VIOLATION_ATTEMPT", -10, 95_000),
        ("c02", "ROE_VIOLATION_ATTEMPT", -10, 60_000),
    ]
    roe = next(p for p in score.penalties if p.contact_id == "c02")
    assert roe.feedback == (
        "Intercept ordered on T002 against the ROE (weapons tight — intercept only tracks "
        "classified as a threat type and declared HOSTILE). The order was blocked."
    )
    zone = next(p for p in score.penalties if p.code == "NO_KINETIC_VIOLATION_ATTEMPT")
    assert zone.feedback.startswith("Intercept ordered on T001 over ")
    assert "no kinetic response is allowed there" in zone.feedback


def test_v3_scores_the_same_blocked_attempts_without_penalty() -> None:
    sc = scenario("S06", scoringTreeId="default_v3")
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T002"),
        _blocked(2, 60_000, "c02", "T002", "BLOCKED_BY_ROE"),
    ]
    assert [p.code for p in score_session(sc, events).penalties if p.points < 0] == []


def test_v4_penalties_carry_the_moment_of_the_mistake() -> None:
    events = json.loads((FIXTURES / "s14_jam.json").read_text(encoding="utf-8"))
    v4 = score_session(scenario("S14", scoringTreeId="default_v4"), events)
    v2 = score_session(scenario("S14"), events)
    assert [p.code for p in v2.penalties] == [p.code for p in v4.penalties]
    assert all(p.t_ms is None for p in v2.penalties)
    for p in v4.penalties:
        assert p.t_ms is not None, p.code
        assert 0 <= p.t_ms <= events[-1]["tMs"]


# ---- v1-v3 unchanged ------------------------------------------------------------------


def test_v1_to_v3_rescore_byte_identical_on_every_fixture_log() -> None:
    """Goldens scored by the engine before default_v4 (tests/fixtures/v123_golden.json)."""
    golden = json.loads((FIXTURES / "v123_golden.json").read_text(encoding="utf-8"))
    assert len(golden) == 18
    for key, expected in golden.items():
        log, tree = key.split(":")
        events = json.loads((FIXTURES / f"{log}.json").read_text(encoding="utf-8"))
        # The goldens predate SIM_VERSION 6: those logs had no AI-assist events.
        events = [e for e in events if not e["type"].startswith("AI_SUGGESTION_")]
        code = {"s01": "S01", "s14": "S14", "s04": "S04", "s06": "S06"}[log[:3]]
        score = score_session(scenario(code, scoringTreeId=tree), events)
        dumped = score.model_dump(mode="json")
        # Added after the goldens (Phase 5 Elo, set by the API only): absent from the engine.
        assert dumped.pop("rating") is None
        assert dumped == expected, key
