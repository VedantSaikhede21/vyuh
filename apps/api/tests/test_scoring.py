"""Scoring: every decision-tree leaf, metrics extraction, aggregation, tree validation."""

import json
from pathlib import Path
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
FIXTURES = Path(__file__).resolve().parent / "fixtures"


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


# ---- default_v1 re-scores identically after the Part B engine changes ------------------


# Optional fields added to Score after the goldens were generated (decision 64). Only these
# are ignored, and only when unset, so any other field turning None still fails the test.
_ADDED_OPTIONALS = frozenset({"true_class", "recommended_difficulty", "recommendation_basis"})


def _drop_added_optionals(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: _drop_added_optionals(v)
            for k, v in value.items()
            if not (k in _ADDED_OPTIONALS and v is None)
        }
    if isinstance(value, list):
        return [_drop_added_optionals(v) for v in value]
    return value


def test_v1_golden_cases_rescore_identically() -> None:
    """Golden cases were scored by the pre-Part-B engine (tests/fixtures/v1_golden.json)."""
    golden = json.loads((FIXTURES / "v1_golden.json").read_text(encoding="utf-8"))
    assert len(golden) >= 6
    for name, case in golden.items():
        scenario = Scenario.model_validate(case["scenario"])
        assert scenario.scoring_tree_id == "default_v1"
        score = score_session(scenario, case["events"]).model_dump(mode="json")
        assert _drop_added_optionals(score) == case["score"], name


# ---- default_v2 (Phase 2B: EW, UNAVOIDABLE, jammed non-threats) ---------------------------

TREE_V2 = load_tree("default_v2")

LEAF_CASES_V2: list[tuple[str, dict[str, Any], str | None, float]] = [
    *[case for case in LEAF_CASES if not case[0].startswith(("DECISION", "FRATRICIDE"))],
    (
        "DECISION_NEUTRALISED",
        threat(neutralisedMethod="jammed", ineffectiveEw=0),
        "decision",
        30,
    ),
    (
        "DECISION_EW_LESSON",
        threat(
            neutralisedMethod="1 round(s)",
            ineffectiveEw=1,
            ineffectiveEwVerb="Jamming",
            controlLinkLabel="fibre-optic",
        ),
        None,
        0,
    ),
    (
        "DECISION_UNAVOIDABLE",
        threat(outcome="LEAKED", unavoidableDecision=True, warningS=8.0, responsesFired=0),
        None,
        0,
    ),
    (
        "DECISION_ENGAGED_NOT_NEUTRALISED",
        threat(
            outcome="LEAKED", unavoidableDecision=False, responsesFired=2, engagements="2 round(s)"
        ),
        "decision",
        15,
    ),
    (
        "DECISION_INEFFECTIVE_EW",
        threat(
            outcome="LEAKED",
            unavoidableDecision=False,
            responsesFired=0,
            ineffectiveEw=1,
            ineffectiveEwVerb="Jamming",
            controlLinkLabel="fibre-optic",
        ),
        "decision",
        5,
    ),
    (
        "DECISION_INEFFECTIVE",
        threat(
            outcome="LEAKED",
            unavoidableDecision=False,
            responsesFired=0,
            ineffectiveEw=0,
            responsesOrdered=1,
            lastResult="OUT_OF_RANGE",
        ),
        "decision",
        5,
    ),
    (
        "DECISION_NONE",
        threat(
            outcome="UNRESOLVED",
            unavoidableDecision=False,
            responsesFired=0,
            ineffectiveEw=0,
            responsesOrdered=0,
        ),
        "decision",
        0,
    ),
    ("FRATRICIDE", non_threat(outcome="FRATRICIDE"), None, -40),
    ("FRIENDLY_JAMMED", non_threat(outcome="FRIENDLY_JAMMED"), None, -15),
    (
        "CIVILIAN_JAMMED",
        non_threat(trueClass="CIVILIAN_HOBBY", outcome="CIVILIAN_JAMMED"),
        None,
        -5,
    ),
    ("BIRD_EW_ORDERED", non_threat(trueClass="BIRD_LARGE", ewOnBird=True), None, 0),
]


@pytest.mark.parametrize(("leaf_id", "metrics", "component", "points"), LEAF_CASES_V2)
def test_leaf_v2(
    leaf_id: str, metrics: dict[str, Any], component: str | None, points: float
) -> None:
    reached = {leaf.leaf: leaf for leaf in evaluate(TREE_V2, metrics)}
    assert leaf_id in reached, list(reached)
    leaf = reached[leaf_id]
    assert leaf.component == component
    assert (leaf.adjust if leaf.adjust is not None else leaf.points) == points
    text = render_feedback(leaf.feedback, metrics)
    assert "{" not in text and "?" not in text
    assert text.strip()


def test_every_v2_leaf_has_a_case() -> None:
    assert {leaf.leaf for leaf in TREE_V2.all_leaves()} == {case[0] for case in LEAF_CASES_V2}


def test_v2_keeps_v1_fairness_leaves_and_max() -> None:
    assert TREE_V2.component_max == TREE.component_max
    v1 = {leaf.leaf: leaf for leaf in TREE.all_leaves()}
    v2 = {leaf.leaf: leaf for leaf in TREE_V2.all_leaves()}
    assert v2["NOT_DETECTABLE"] == v1["NOT_DETECTABLE"]
    assert v2["CLASS_WRONG_BEFORE_IDENTIFIABLE"] == v1["CLASS_WRONG_BEFORE_IDENTIFIABLE"]
    assert v2["DECISION_UNAVOIDABLE"].exclude_components == ["decision"]
    assert not v2["DECISION_UNAVOIDABLE"].excluded


def _ew_scenario(intercept_cooldown_s: float = 6) -> Scenario:
    """S01 with a jammer, a friendly, a civilian, a bird and a fibre-optic FPV."""
    raw = json.loads(json.dumps(S01_RAW))
    raw["scoringTreeId"] = "default_v2"
    raw["effectors"] = [
        {"id": "jam1", "kind": "EW_JAM", "x": 0, "z": 0, "rangeM": 1500, "cooldownS": 10},
        {
            "id": "int1",
            "kind": "INTERCEPT",
            "x": 0,
            "z": 0,
            "rangeM": 1500,
            "cooldownS": intercept_cooldown_s,
            "ammo": 4,
        },
    ]
    base = raw["contacts"][0]
    raw["contacts"] += [
        {
            **base,
            "id": "c02",
            "class": "FRIENDLY_QUAD",
            "isThreat": False,
            "affiliation": "FRIENDLY",
            "behaviour": "FRIENDLY_PATROL",
        },
        {
            **base,
            "id": "c03",
            "class": "CIVILIAN_HOBBY",
            "isThreat": False,
            "affiliation": "NEUTRAL",
            "behaviour": "TRANSIT",
        },
        {
            **base,
            "id": "c04",
            "class": "BIRD_LARGE",
            "isThreat": False,
            "affiliation": "NEUTRAL",
            "controlLink": "NONE",
            "behaviour": "BIRD_FLOCK",
            "emissions": {"rfActive": False},
        },
        {
            **base,
            "id": "c05",
            "class": "FPV",
            "controlLink": "FIBRE_OPTIC",
            "emissions": {"rfActive": False},
        },
    ]
    return Scenario.model_validate(raw)


def outcome_ev(seq: int, t: int, track: str, contact: str, response: str, result: str, **p: Any):
    return ev(
        seq,
        t,
        "RESPONSE_OUTCOME",
        trackId=track,
        contactId=contact,
        payload={"response": response, "result": result, **p},
    )


def by_id(scenario: Scenario, events: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {m["contactId"]: m for m in contact_metrics(scenario, events)}


def test_jam_collateral_friendly_and_civilian() -> None:
    sc = _ew_scenario()
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        ev(2, 40_000, "RESPONSE_ORDERED", trackId="T001", payload={"response": "EW_JAM"}),
        outcome_ev(
            3,
            40_000,
            "T001",
            "c01",
            "EW_JAM",
            "NEUTRALISED",
            collateral={"contactIds": ["c02", "c03"]},
        ),
        ev(4, 40_000, "CONTACT_NEUTRALISED", contactId="c01", payload={"by": "EW_JAM"}),
        ev(5, 40_000, "CONTACT_NEUTRALISED", contactId="c02", payload={"by": "EW_JAM"}),
        ev(6, 40_000, "CONTACT_NEUTRALISED", contactId="c03", payload={"by": "EW_JAM"}),
    ]
    m = by_id(sc, events)
    assert (m["c01"]["outcome"], m["c01"]["neutralisedMethod"]) == ("NEUTRALISED", "jammed")
    assert m["c02"]["outcome"] == "FRIENDLY_JAMMED"
    assert m["c03"]["outcome"] == "CIVILIAN_JAMMED"
    score = score_session(sc, events)
    assert [(p.code, p.points, p.contact_id) for p in score.penalties] == [
        ("FRIENDLY_JAMMED", -15, "c02"),
        ("CIVILIAN_JAMMED", -5, "c03"),
    ]
    c01 = next(p for p in score.per_contact if p.contact_id == "c01")
    assert "DECISION_NEUTRALISED" in [leaf.root for leaf in c01.leaves]
    assert any("(jammed)" in f for f in c01.feedback)
    assert c01.response_appropriate is True


def test_targeted_non_threats_are_wrongly_engaged_and_friendlies_fratricide() -> None:
    sc = _ew_scenario()
    jam_civilian = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c03", trackId="T001"),
        outcome_ev(2, 30_000, "T001", "c03", "EW_JAM", "NEUTRALISED"),
        ev(3, 30_000, "CONTACT_NEUTRALISED", contactId="c03", payload={"by": "EW_JAM"}),
    ]
    assert by_id(sc, jam_civilian)["c03"]["outcome"] == "WRONGLY_ENGAGED"  # not CIVILIAN_JAMMED
    jam_friendly = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T001"),
        outcome_ev(2, 30_000, "T001", "c02", "EW_JAM", "NEUTRALISED"),
        ev(3, 30_000, "CONTACT_NEUTRALISED", contactId="c02", payload={"by": "EW_JAM"}),
    ]
    assert by_id(sc, jam_friendly)["c02"]["outcome"] == "FRIENDLY_JAMMED"
    spoof_friendly = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T001"),
        outcome_ev(2, 30_000, "T001", "c02", "EW_SPOOF", "NO_EFFECT"),
    ]
    assert by_id(sc, spoof_friendly)["c02"]["outcome"] == "WRONGLY_ENGAGED"
    shoot_friendly = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c02", trackId="T001"),
        outcome_ev(2, 30_000, "T001", "c02", "INTERCEPT", "MISSED"),
        outcome_ev(3, 40_000, "T001", "c02", "EW_JAM", "NEUTRALISED"),
        ev(4, 40_000, "CONTACT_NEUTRALISED", contactId="c02", payload={"by": "EW_JAM"}),
    ]
    assert by_id(sc, shoot_friendly)["c02"]["outcome"] == "FRATRICIDE"


def test_birds_are_never_penalised_for_ew() -> None:
    sc = _ew_scenario()
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c04", trackId="T001"),
        ev(2, 30_000, "RESPONSE_ORDERED", trackId="T001", payload={"response": "EW_JAM"}),
        outcome_ev(3, 30_000, "T001", "c04", "EW_JAM", "NO_EFFECT"),
        ev(4, 31_000, "RESPONSE_ORDERED", trackId="T001", payload={"response": "EW_SPOOF"}),
        outcome_ev(5, 31_000, "T001", "c04", "EW_SPOOF", "NO_EFFECT"),
    ]
    m = by_id(sc, events)["c04"]
    assert (m["outcome"], m["ewOnBird"]) == ("IGNORED_OK", True)
    score = score_session(sc, events)
    # No points lost, but the mistake is listed for the AAR with its feedback (decision 57).
    [entry] = [p for p in score.penalties if p.contact_id == "c04"]
    assert (entry.code, entry.points) == ("BIRD_EW_ORDERED", 0)
    assert "this was a bird" in entry.feedback
    c04 = next(p for p in score.per_contact if p.contact_id == "c04")
    assert c04.leaves[-1].root == "BIRD_EW_ORDERED"
    assert c04.response_appropriate is False
    # Even a correctly classified bird gets no "held fire" bonus once EW was ordered on it.
    classified = [
        *events,
        ev(6, 25_000, "CLASSIFIED", trackId="T001", payload={"class": "BIRD_LARGE"}),
    ]
    leaves = [leaf.leaf for leaf in evaluate(TREE_V2, by_id(sc, classified)["c04"])]
    assert leaves == ["BIRD_EW_ORDERED"]


def test_birds_shot_by_an_interceptor_stay_wrongly_engaged() -> None:
    sc = _ew_scenario()
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c04", trackId="T001"),
        outcome_ev(2, 30_000, "T001", "c04", "INTERCEPT", "MISSED"),
    ]
    score = score_session(sc, events)
    assert [(p.code, p.points) for p in score.penalties if p.contact_id == "c04"] == [
        ("WRONGLY_ENGAGED", -25)
    ]


def test_ineffective_ew_against_fibre_optic() -> None:
    sc = _ew_scenario()
    jam_only = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c05", trackId="T001"),
        ev(2, 21_000, "MARKED_DETECTED", trackId="T001"),
        ev(3, 30_000, "RESPONSE_ORDERED", trackId="T001", payload={"response": "EW_JAM"}),
        outcome_ev(4, 30_000, "T001", "c05", "EW_JAM", "NO_EFFECT"),
        ev(5, 120_000, "CONTACT_REACHED_ASSET", contactId="c05", payload={"assetId": "a1"}),
    ]
    m = by_id(sc, jam_only)["c05"]
    assert (m["ineffectiveEw"], m["ineffectiveEwVerb"], m["controlLinkLabel"]) == (
        1,
        "Jamming",
        "fibre-optic",
    )
    leaves = [leaf.leaf for leaf in evaluate(TREE_V2, m)]
    assert leaves[-1] == "DECISION_INEFFECTIVE_EW"
    text = render_feedback(evaluate(TREE_V2, m)[-1].feedback, m)
    assert text.startswith("Jamming has no effect on a fibre-optic drone.")

    then_shot = [
        *jam_only[:-1],
        outcome_ev(5, 40_000, "T001", "c05", "INTERCEPT", "NEUTRALISED"),
        ev(6, 40_000, "CONTACT_NEUTRALISED", contactId="c05", payload={"by": "INTERCEPT"}),
    ]
    m = by_id(sc, then_shot)["c05"]
    reached = evaluate(TREE_V2, m)
    assert [leaf.leaf for leaf in reached][-2:] == ["DECISION_EW_LESSON", "DECISION_NEUTRALISED"]
    assert render_feedback(reached[-1].feedback, m).endswith("(1 round(s)).")


@pytest.mark.parametrize(
    ("cooldown_s", "warning_s", "unavoidable"),
    [
        (6, 9.95, True),  # below the 10 s floor (cooldown 6 s)
        (6, 10.0, False),
        (15, 14.95, True),  # cooldown above the floor sets the threshold
        (15, 15.0, False),
    ],
)
def test_unavoidable_threshold(cooldown_s: float, warning_s: float, unavoidable: bool) -> None:
    sc = _ew_scenario(intercept_cooldown_s=cooldown_s)
    reached = 20_000 + round(warning_s * 1000)
    events = [
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c05", trackId="T001"),
        ev(2, reached, "CONTACT_REACHED_ASSET", contactId="c05", payload={"assetId": "a1"}),
    ]
    m = by_id(sc, events)["c05"]
    # Fibre-optic: only the interceptor is able to engage it.
    assert m["respondingEffectorCooldownMinS"] == cooldown_s
    assert m["unavoidableDecision"] is unavoidable


def test_unavoidable_uses_the_shortest_able_effector() -> None:
    sc = _ew_scenario(intercept_cooldown_s=30)
    # c01 is RF_MANUAL: the jammer (10 s) can engage it; c05 (fibre) only the interceptor (30 s).
    assert by_id(sc, [])["c01"]["respondingEffectorCooldownMinS"] == 10
    assert by_id(sc, [])["c05"]["respondingEffectorCooldownMinS"] == 30


def test_unavoidable_excludes_only_the_decision_component() -> None:
    sc = _ew_scenario()
    events = [
        # c01: handled perfectly → 25 / 25 / 30.
        ev(1, 20_000, "SENSOR_TRACK_CREATED", contactId="c01", trackId="T001"),
        ev(2, 21_000, "CLASSIFIED", trackId="T001", payload={"class": "QUAD_SMALL"}),
        ev(3, 50_000, "CONTACT_NEUTRALISED", contactId="c01", payload={"by": "INTERCEPT"}),
        # c05: popped up 5 s before impact; detected in 20 s, never classified.
        ev(4, 100_000, "SENSOR_TRACK_CREATED", contactId="c05", trackId="T002"),
        ev(5, 104_000, "MARKED_DETECTED", trackId="T002"),
        ev(6, 105_000, "CONTACT_REACHED_ASSET", contactId="c05", payload={"assetId": "a1"}),
    ]
    score = score_session(sc, events)
    c05 = next(p for p in score.per_contact if p.contact_id == "c05")
    assert [leaf.root for leaf in c05.leaves] == [
        "LATENCY_UNDER_5S",
        "NOT_CLASSIFIED",
        "DECISION_UNAVOIDABLE",
    ]
    # Detection and classification still averaged over both threats; decision over c01 only.
    assert score.components.detection == 25
    assert score.components.classification == 12.5
    assert score.components.decision == 30
    assert score.metrics["scoredThreats"] == 2
    assert score.penalties == []  # no separate leak penalty
