"""AI-assist over- and under-trust (SPEC §9.4, decision 133): an insight, never scored.

Per contact whose suggestion was shown (AI_SUGGESTION_SHOWN on any of its tracks), the
suggestion is correct when its class equals the contact's true class, and the trainee's
response is the last AI_SUGGESTION_ACCEPTED / _REJECTED on any of its tracks (none =
ignored). overTrust = acceptedWrong / shownWrong; underTrust = rejectedCorrect / shownCorrect.
"""

from collections.abc import Iterable
from typing import Any

from app.schemas.generated import AiTrustMetrics, Scenario


def _ratio(num: int, den: int) -> float | None:
    return round(num / den, 3) if den else None


def ai_trust(scenario: Scenario, events: list[dict[str, Any]]) -> AiTrustMetrics:
    true_class = {c.id: c.class_.value for c in scenario.contacts}
    track_contact: dict[str, str] = {}
    shown: dict[str, bool] = {}  # contact -> suggestion correct
    decision: dict[str, str] = {}  # contact -> last ACCEPTED / REJECTED
    for ev in events:
        kind, track = ev["type"], ev.get("trackId")
        if kind == "SENSOR_TRACK_CREATED" and track and ev.get("contactId"):
            track_contact[track] = ev["contactId"]
            continue
        contact = track_contact.get(track or "")
        if contact is None:
            continue
        if kind == "AI_SUGGESTION_SHOWN" and contact not in shown:
            shown[contact] = ev["payload"]["suggestedClass"] == true_class.get(contact)
        elif kind in ("AI_SUGGESTION_ACCEPTED", "AI_SUGGESTION_REJECTED") and contact in shown:
            decision[contact] = kind.removeprefix("AI_SUGGESTION_")
    return combine([_counts(shown, decision)])


def _counts(shown: dict[str, bool], decision: dict[str, str]) -> dict[str, int]:
    c = {
        "shown": len(shown),
        "shownCorrect": sum(shown.values()),
        "shownWrong": sum(not v for v in shown.values()),
        "acceptedCorrect": 0,
        "acceptedWrong": 0,
        "rejectedCorrect": 0,
        "rejectedWrong": 0,
    }
    for contact, correct in shown.items():
        d = decision.get(contact)
        if d is not None:
            c[f"{d.lower()}{'Correct' if correct else 'Wrong'}"] += 1
    return c


def combine(parts: Iterable[dict[str, int] | AiTrustMetrics]) -> AiTrustMetrics:
    """Sum counts over sessions and recompute the two ratios."""
    keys = (
        "shown",
        "shownCorrect",
        "shownWrong",
        "acceptedCorrect",
        "acceptedWrong",
        "rejectedCorrect",
        "rejectedWrong",
    )
    total = dict.fromkeys(keys, 0)
    for p in parts:
        d = p.model_dump(by_alias=True) if isinstance(p, AiTrustMetrics) else p
        for k in keys:
            total[k] += d[k]
    return AiTrustMetrics.model_validate(
        {
            **total,
            "overTrust": _ratio(total["acceptedWrong"], total["shownWrong"]),
            "underTrust": _ratio(total["rejectedCorrect"], total["shownCorrect"]),
        }
    )
