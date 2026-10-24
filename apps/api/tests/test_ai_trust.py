"""AI-assist trust metrics (SPEC §9.4) and suggestion plausibility (SPEC §13.3)."""

from typing import Any

from app.services.analytics.ai_trust import ai_trust, combine
from app.services.plausibility import LogState, check_batch
from tests.test_scoring_v4 import scenario


def val(x: Any) -> Any:
    return getattr(x, "root", x)


def ev(seq: int, t: int, kind: str, **kw: Any) -> dict[str, Any]:
    return {"seq": seq, "tMs": t, "type": kind, "payload": kw.pop("payload", {}), **kw}


def _log(decisions: dict[str, str]) -> tuple[Any, list[dict[str, Any]]]:
    """S15: c01 (quad, correct suggestion) and c06 (bird, suggested QUAD_SMALL)."""
    s15 = scenario("S15")
    sug = {c.id: c.ai_suggestion for c in s15.contacts}
    events = [
        ev(
            0,
            0,
            "SESSION_STARTED",
            payload={"mode": "PRACTICE", "scenarioId": "S15", "seed": s15.seed},
        ),
        ev(
            1,
            1000,
            "SENSOR_TRACK_CREATED",
            contactId="c06",
            trackId="T001",
            payload={"sensorId": "rad1", "sensorKind": "RADAR", "rangeM": 2000, "bearingDeg": 260},
        ),
        ev(
            2,
            13000,
            "SENSOR_TRACK_CREATED",
            contactId="c01",
            trackId="T002",
            payload={"sensorId": "rad1", "sensorKind": "RADAR", "rangeM": 3000, "bearingDeg": 270},
        ),
    ]
    seq = 3
    for track, contact in (("T001", "c06"), ("T002", "c01")):
        a = sug[contact]
        payload = {"suggestedClass": a.suggested_class.value, "confidence": a.confidence}
        events.append(ev(seq, 20000 + seq, "AI_SUGGESTION_SHOWN", trackId=track, payload=payload))
        seq += 1
        if track in decisions:
            kind = f"AI_SUGGESTION_{decisions[track]}"
            events.append(ev(seq, 20000 + seq, kind, trackId=track, payload=payload))
            seq += 1
    return s15, events


def test_s15_has_one_wrong_suggestion_on_a_bird() -> None:
    s15 = scenario("S15")
    wrong = [c.id for c in s15.contacts if c.ai_suggestion.suggested_class != c.class_]
    assert wrong == ["c06"]


def test_over_trust_accepting_the_wrong_one() -> None:
    s15, events = _log({"T001": "ACCEPTED", "T002": "ACCEPTED"})
    t = ai_trust(s15, events)
    assert (t.shown, t.shown_wrong, t.accepted_wrong, t.accepted_correct) == (2, 1, 1, 1)
    assert val(t.over_trust) == 1.0
    assert val(t.under_trust) == 0.0


def test_under_trust_rejecting_the_right_one_and_ignored() -> None:
    s15, events = _log({"T002": "REJECTED"})
    t = ai_trust(s15, events)
    assert (t.rejected_correct, t.accepted_wrong, t.rejected_wrong) == (1, 0, 0)
    assert val(t.under_trust) == 1.0
    assert val(t.over_trust) == 0.0  # the wrong one was shown and ignored


def test_combine_and_empty() -> None:
    s15, events = _log({"T001": "REJECTED"})
    one = ai_trust(s15, events)
    assert combine([one, one]).shown == 4
    empty = ai_trust(s15, events[:3])
    assert (empty.shown, empty.over_trust, empty.under_trust) == (0, None, None)


def test_plausibility_rejects_a_forged_suggestion() -> None:
    s15, events = _log({"T001": "ACCEPTED"})
    assert check_batch(s15, LogState(), events, mode="PRACTICE") == []
    events[3]["payload"] = {"suggestedClass": "BIRD_SMALL", "confidence": 0.99}
    rules = [v.rule for v in check_batch(s15, LogState(), events, mode="PRACTICE")]
    assert rules == ["AI_SUGGESTION_MISMATCH"]
