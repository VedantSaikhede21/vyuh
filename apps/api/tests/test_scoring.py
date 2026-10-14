"""Scoring: every decision-tree leaf, metrics extraction, aggregation, tree validation."""

import json
from typing import Any

import pytest
from pydantic import ValidationError

from app.schemas.generated import Scenario
from app.seed.scenarios import SCENARIO_DIR
from app.services.scoring.engine import score_session
from app.services.scoring.metrics import classification_result, contact_metrics
from app.services.scoring.tree import Tree, evaluate, load_tree, render_feedback
from tests.conftest import fixture_log

TREE = load_tree("default_v1")
S01_RAW = json.loads((SCENARIO_DIR / "S01.json").read_text(encoding="utf-8"))
S01 = Scenario.model_validate(S01_RAW)


def threat(**overrides: Any) -> dict[str, Any]:
    """Metrics of a threat that was detected in 2 s, classified exactly, neutralised."""
    base = {
        "contactId": "c01",
        "isThreat": True,
        "trueClass": "QUAD_SMALL",
        "firstDetectableTMs": 20_000,
        "firstDetectableS": 20.0,
        "traineeDetectedTMs": 22_000,
        "detectionLatencyS": 2.0,
        "classifiedAs": "QUAD_SMALL",
        "classificationCorrect": "EXACT",
        "identifiableWhenClassified": None,
        "interceptsOrdered": 1,
        "interceptsFired": 1,
        "lastResult": "NEUTRALISED",
        "outcome": "NEUTRALISED",
    }
    return base | overrides


def non_threat(**overrides: Any) -> dict[str, Any]:
    base = {
        "contactId": "c02",
        "isThreat": False,
        "trueClass": "FRIENDLY_QUAD",
        "classificationCorrect": None,
        "interceptsFired": 0,
        "outcome": "IGNORED_OK",
    }
    return base | overrides


# (metrics, leaf that must be reached, its component or None, points or adjust)
LEAF_CASES: list[tuple[str, dict[str, Any], str | None, float]] = [
    ("NOT_DETECTABLE", threat(firstDetectableTMs=None), None, 0),
    ("MISSED", threat(traineeDetectedTMs=None, detectionLatencyS=None), "detection", 0),
    ("LATENCY_UNDER_5S", threat(detectionLatencyS=4.99), "detection", 25),
    ("LATENCY_5_TO_15S", threat(detectionLatencyS=5.0), "detection", 18),
    ("LATENCY_15_TO_30S", threat(detectionLatencyS=15.0), "detection", 10),
    ("LATENCY_OVER_30S", threat(detectionLatencyS=30.0), "detection", 4),
    ("NOT_CLASSIFIED", threat(classifiedAs=None, classificationCorrect=None), "classification", 0),
    ("CLASS_EXACT", threat(), "classification", 25),
    (
        "CLASS_CATEGORY",
        threat(classifiedAs="QUAD_HEAVY", classificationCorrect="CATEGORY"),
        "classification",
        12,
    ),
    (
        "CLASS_WRONG_BEFORE_IDENTIFIABLE",
        threat(
            classifiedAs="BIRD_SMALL",
            classificationCorrect="WRONG",
            identifiableWhenClassified=False,
        ),
        "classification",
        0,
    ),
    (
        "CLASS_WRONG",
        threat(classifiedAs="BIRD_SMALL", classificationCorrect="WRONG"),
        "classification",
        0,
    ),
    ("DECISION_NEUTRALISED", threat(), "decision", 30),
    (
        "DECISION_ENGAGED_NOT_NEUTRALISED",
        threat(outcome="LEAKED", lastResult="MISSED", interceptsFired=2, interceptsOrdered=2),
        "decision",
        15,
    ),
    (
        "DECISION_INEFFECTIVE",
        threat(outcome="LEAKED", lastResult="OUT_OF_RANGE", interceptsFired=0),
        "decision",
        5,
    ),
    (
        "DECISION_NONE",
        threat(outcome="UNRESOLVED", lastResult=None, interceptsFired=0, interceptsOrdered=0),
        "decision",
        0,
    ),
    ("FRATRICIDE", non_threat(outcome="FRATRICIDE", interceptsFired=1), None, -40),
    (
        "WRONGLY_ENGAGED",
        non_threat(trueClass="BIRD_LARGE", outcome="WRONGLY_ENGAGED", interceptsFired=1),
        None,
        -25,
    ),
    ("NON_THREAT_IDENTIFIED", non_threat(classificationCorrect="EXACT"), None, 5),
    ("NON_THREAT_LEFT_ALONE", non_threat(), None, 0),
]


@pytest.mark.parametrize(("leaf_id", "metrics", "component", "points"), LEAF_CASES)
def test_leaf(leaf_id: str, metrics: dict[str, Any], component: str | None, points: float) -> None:
    reached = {leaf.leaf: leaf for leaf in evaluate(TREE, metrics)}
    assert leaf_id in reached, list(reached)
    leaf = reached[leaf_id]
    assert leaf.component == component
    assert (leaf.adjust if leaf.adjust is not None else leaf.points) == points
    text = render_feedback(leaf.feedback, metrics)
    assert "{" not in text
    assert text.strip()


def test_every_leaf_has_a_case() -> None:
    assert {leaf.leaf for leaf in TREE.all_leaves()} == {case[0] for case in LEAF_CASES}


def test_paths_through_the_tree() -> None:
    def path(m: dict[str, Any]) -> list[str]:
        return [leaf.leaf for leaf in evaluate(TREE, m)]

    assert path(threat()) == ["LATENCY_UNDER_5S", "CLASS_EXACT", "DECISION_NEUTRALISED"]
    assert path(threat(traineeDetectedTMs=None)) == ["MISSED"]
    assert path(threat(firstDetectableTMs=None)) == ["NOT_DETECTABLE"]
    assert path(non_threat()) == ["NON_THREAT_LEFT_ALONE"]


def test_component_max_and_version() -> None:
    assert TREE.component_max.model_dump() == {
        "detection": 25,
        "classification": 25,
        "decision": 30,
        "report": 0,
        "efficiency": 0,
    }
    assert TREE.id == "default_v1"


def test_feedback_tolerates_missing_metrics() -> None:
    assert render_feedback("{a:.1f} and {missing}", {"a": 1.234}) == "1.2 and ?"
    assert render_feedback("{a:.1f}", {"a": "text"}) == "text"


# ---- tree validation ---------------------------------------------------------------


def _tree(**changes: Any) -> dict[str, Any]:
    raw = json.loads(json.dumps(TREE.model_dump(by_alias=True, exclude_none=True)))
    raw.update(changes)
    return raw


def test_tree_rejects_unknown_node() -> None:
    raw = _tree(root="nope")
    with pytest.raises(ValidationError, match="unknown nodes"):
        Tree.model_validate(raw)


def test_tree_rejects_points_above_max() -> None:
    raw = _tree()
    raw["nodes"]["latency"]["leaves"][0]["points"] = 26
    with pytest.raises(ValidationError, match="more than detection max"):
        Tree.model_validate(raw)


def test_tree_rejects_wrong_band_count() -> None:
    raw = _tree()
    raw["nodes"]["latency"]["leaves"].pop()
    with pytest.raises(ValidationError, match="len\\(edges\\) \\+ 1"):
        Tree.model_validate(raw)


def test_unknown_tree_id() -> None:
    with pytest.raises(ValueError, match="Unknown scoring tree"):
        load_tree("../secrets")


# ---- metrics extraction -----------------------------------------------------------


def test_classification_result() -> None:
    assert classification_result("QUAD_SMALL", "QUAD_SMALL") == "EXACT"
    assert classification_result("FPV", "QUAD_SMALL") == "CATEGORY"
    assert classification_result("BIRD_SMALL", "BIRD_LARGE") == "CATEGORY"
    assert classification_result("BIRD_SMALL", "QUAD_SMALL") == "WRONG"


def test_metrics_from_real_defended_log() -> None:
    [m] = contact_metrics(S01, fixture_log("s01_defended"))
    assert m["trackIds"] == ["T001"]
    assert m["firstDetectableTMs"] == 20_000
    assert m["traineeDetectedTMs"] == 20_050
    assert m["detectionLatencyS"] == pytest.approx(0.05)
    assert (m["classifiedAs"], m["classificationCorrect"]) == ("QUAD_SMALL", "EXACT")
    # S01 has an EO sensor; the trainee classified from radar before EO could identify.
    assert m["identifiableWhenClassified"] is False
    assert (m["interceptsOrdered"], m["interceptsFired"], m["outcome"]) == (1, 1, "NEUTRALISED")


def ev(seq: int, t: int, kind: str, **extra: Any) -> dict[str, Any]:
    return {"seq": seq, "tMs": t, "type": kind, "payload": extra.pop("payload", {}), **extra}


def test_metrics_map_tracks_and_use_first_acknowledgement() -> None:
    events = [
        ev(0, 0, "SESSION_STARTED"),
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        ev(2, 21_000, "TRACK_SELECTED", trackId="T001"),  # not an acknowledgement
        ev(3, 27_000, "CLASSIFIED", trackId="T001", payload={"class": "BIRD_SMALL"}),
        ev(4, 29_000, "MARKED_DETECTED", trackId="T001"),
        ev(5, 30_000, "CLASSIFIED", trackId="T001", payload={"class": "QUAD_HEAVY"}),
        ev(6, 40_000, "SENSOR_TRACK_LOST", contactId="c01", trackId="T001"),
        ev(7, 44_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T002"),
        ev(8, 50_000, "RESPONSE_ORDERED", trackId="T002", payload={"response": "INTERCEPT"}),
        ev(
            9,
            50_000,
            "RESPONSE_OUTCOME",
            trackId="T002",
            contactId="c01",
            payload={"response": "INTERCEPT", "result": "OUT_OF_RANGE"},
        ),
        ev(10, 160_000, "CONTACT_REACHED_ASSET", contactId="c01", payload={"assetId": "a1"}),
    ]
    [m] = contact_metrics(S01, events)
    assert m["trackIds"] == ["T001", "T002"]
    assert m["detectionLatencyS"] == 7.0  # first CLASSIFIED, not the later MARKED_DETECTED
    assert (m["classifiedAs"], m["classificationCorrect"]) == ("QUAD_HEAVY", "CATEGORY")
    assert (m["interceptsOrdered"], m["interceptsFired"]) == (1, 0)
    assert (m["lastResult"], m["outcome"]) == ("OUT_OF_RANGE", "LEAKED")


def test_identifiable_flag_when_eo_is_modelled() -> None:
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        ev(2, 25_000, "CLASSIFIED", trackId="T001", payload={"class": "QUAD_SMALL"}),
        ev(
            3,
            30_000,
            "EO_IDENTIFIABLE",
            contactId="c01",
            payload={"level": "IDENTIFY", "rangeM": 900},
        ),
    ]
    [m] = contact_metrics(S01, events)
    assert m["identifiableWhenClassified"] is False
    events[1], events[2] = events[2], events[1]
    events[2]["tMs"] = 31_000
    [m] = contact_metrics(S01, events)
    assert m["identifiableWhenClassified"] is True


def test_identifiable_flag_keys_off_the_eo_sensor() -> None:
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        ev(2, 25_000, "CLASSIFIED", trackId="T001", payload={"class": "QUAD_SMALL"}),
    ]
    # No EO_IDENTIFIABLE at all (camera never pointed) still counts as "not identifiable".
    [m] = contact_metrics(S01, events)
    assert m["identifiableWhenClassified"] is False
    raw = json.loads(json.dumps(S01_RAW))
    raw["sensors"] = [s for s in raw["sensors"] if s["kind"] != "EO_IR"]
    [m] = contact_metrics(Scenario.model_validate(raw), events)
    assert m["identifiableWhenClassified"] is None  # no EO sensor: fairness flag not applicable


def test_non_threat_outcomes() -> None:
    raw = json.loads(json.dumps(S01_RAW))
    friendly = {
        **raw["contacts"][0],
        "id": "c02",
        "class": "FRIENDLY_QUAD",
        "isThreat": False,
        "affiliation": "FRIENDLY",
    }
    raw["contacts"].append(friendly)
    scenario = Scenario.model_validate(raw)
    fire = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T001"),
        ev(
            2,
            30_000,
            "RESPONSE_OUTCOME",
            trackId="T001",
            contactId="c02",
            payload={"response": "INTERCEPT", "result": "MISSED"},
        ),
    ]
    assert contact_metrics(scenario, fire)[1]["outcome"] == "FRATRICIDE"
    assert contact_metrics(scenario, fire[:1])[1]["outcome"] == "IGNORED_OK"


# ---- aggregation ---------------------------------------------------------------------


def test_real_logs_score_end_to_end() -> None:
    defended = score_session(S01, fixture_log("s01_defended"))
    assert defended.total == 100
    assert defended.components.model_dump() == {
        "detection": 25,
        "classification": 25,
        "decision": 30,
        "report": 0,
        "efficiency": 0,
    }
    assert [leaf.root for leaf in defended.per_contact[0].leaves] == [
        "LATENCY_UNDER_5S",
        "CLASS_EXACT",
        "DECISION_NEUTRALISED",
    ]
    ignored = score_session(S01, fixture_log("s01_ignored"))
    assert ignored.total == 0
    assert [leaf.root for leaf in ignored.per_contact[0].leaves] == ["MISSED"]
    assert ignored.per_contact[0].outcome.value == "LEAKED"


def _two_threat_scenario() -> Scenario:
    raw = json.loads(json.dumps(S01_RAW))
    raw["contacts"].append({**raw["contacts"][0], "id": "c02"})
    return Scenario.model_validate(raw)


def test_components_average_over_threats_and_scale_to_100() -> None:
    scenario = _two_threat_scenario()
    events = [
        ev(0, 0, "SESSION_STARTED"),
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        ev(2, 21_000, "MARKED_DETECTED", trackId="T001"),  # 1 s → 25
        ev(3, 21_000, "CLASSIFIED", trackId="T001", payload={"class": "QUAD_SMALL"}),  # 25
        ev(4, 50_000, "CONTACT_NEUTRALISED", contactId="c01", payload={"by": "INTERCEPT"}),  # 30
        ev(5, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T002"),
        ev(6, 40_000, "MARKED_DETECTED", trackId="T002"),  # 20 s → 10; nothing else
    ]
    score = score_session(scenario, events)
    assert score.components.detection == 17.5
    assert score.components.classification == 12.5
    assert score.components.decision == 15
    assert score.total == round(100 * (17.5 + 12.5 + 15) / 80, 1)
    assert score.metrics["scoredThreats"] == 2


def test_undetectable_threat_is_not_scored() -> None:
    scenario = _two_threat_scenario()
    events = fixture_log("s01_defended")  # c01 handled perfectly; c02 never on radar
    score = score_session(scenario, events)
    assert score.total == 100
    assert score.metrics["scoredThreats"] == 1
    assert [leaf.root for leaf in score.per_contact[1].leaves] == ["NOT_DETECTABLE"]


def test_penalties_are_listed_and_clamped() -> None:
    raw = json.loads(json.dumps(S01_RAW))
    raw["contacts"].append(
        {
            **raw["contacts"][0],
            "id": "c02",
            "class": "FRIENDLY_QUAD",
            "isThreat": False,
            "affiliation": "FRIENDLY",
        }
    )
    scenario = Scenario.model_validate(raw)
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T001"),
        ev(
            2,
            30_000,
            "RESPONSE_OUTCOME",
            trackId="T001",
            contactId="c02",
            payload={"response": "INTERCEPT", "result": "NEUTRALISED"},
        ),
    ]
    score = score_session(scenario, events)
    assert [(p.code, p.points, p.contact_id) for p in score.penalties] == [
        ("FRATRICIDE", -40, "c02")
    ]
    # c01 was never detectable, so no threat is scored and the base is full marks.
    assert score.total == 60
    events.append(
        ev(
            3,
            30_000,
            "RESPONSE_OUTCOME",
            trackId="T001",
            contactId="c02",
            payload={"response": "INTERCEPT", "result": "MISSED"},
        )
    )
    events += [
        ev(4, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T002"),
    ]
    score = score_session(scenario, events)
    assert score.total == 0  # c01 detectable but ignored: 0 base - 40, clamped
    assert len(score.penalties) == 1  # one penalty per contact, not per shot
