"""Per-contact metrics from scenario ground truth + event log (SPEC §9.1).

Events are camelCase dicts as stored. Tracks map to contacts through
SENSOR_TRACK_CREATED events.
"""

from collections import defaultdict
from typing import Any

from app.schemas.generated import Scenario, ThreatClass

THREAT_CLASSES = frozenset(c.value for c in ThreatClass)
DETECTION_TYPES = frozenset({"SENSOR_TRACK_CREATED", "EO_IDENTIFIABLE"})
#: Trainee actions that show they noticed a track (TRACK_SELECTED does not count).
ACKNOWLEDGE_TYPES = frozenset(
    {"MARKED_DETECTED", "CLASSIFIED", "AFFILIATION_SET", "RESPONSE_ORDERED"}
)
FIRED_RESULTS = frozenset({"NEUTRALISED", "MISSED"})


def classification_result(reported: str, truth: str) -> str:
    if reported == truth:
        return "EXACT"
    if (reported in THREAT_CLASSES) == (truth in THREAT_CLASSES):
        return "CATEGORY"
    return "WRONG"


def contact_metrics(scenario: Scenario, events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """One metrics dict per scenario contact, in contact-id order."""
    track_contact: dict[str, str] = {}
    for ev in events:
        if ev["type"] == "SENSOR_TRACK_CREATED":
            track_contact[ev["trackId"]] = ev["contactId"]
    eo_modelled = any(ev["type"] == "EO_IDENTIFIABLE" for ev in events)

    by_contact: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ev in events:
        contact = ev.get("contactId")
        if contact is None and ev.get("trackId") in track_contact:
            contact = track_contact[ev["trackId"]]
        if contact is not None:
            by_contact[contact].append(ev)

    out = []
    for spec in sorted(scenario.contacts, key=lambda c: c.id):
        evs = by_contact.get(spec.id, [])
        truth = spec.class_.value
        is_threat = spec.is_threat

        def first(types: frozenset[str], evs: list[dict[str, Any]] = evs) -> int | None:
            return next((e["tMs"] for e in evs if e["type"] in types), None)

        first_detectable = first(DETECTION_TYPES)
        trainee_detected = first(ACKNOWLEDGE_TYPES)
        latency = (
            max(trainee_detected - first_detectable, 0) / 1000
            if first_detectable is not None and trainee_detected is not None
            else None
        )

        classified = [e for e in evs if e["type"] == "CLASSIFIED"]
        classified_as = classified[-1]["payload"]["class"] if classified else None
        identifiable_t = next(
            (
                e["tMs"]
                for e in evs
                if e["type"] == "EO_IDENTIFIABLE" and e["payload"]["level"] == "IDENTIFY"
            ),
            None,
        )
        identifiable_when_classified = (
            None
            if not eo_modelled or not classified
            else identifiable_t is not None and identifiable_t <= classified[-1]["tMs"]
        )

        ordered = [e for e in evs if e["type"] == "RESPONSE_ORDERED"]
        intercept_results = [
            e["payload"]["result"]
            for e in evs
            if e["type"] == "RESPONSE_OUTCOME" and e["payload"]["response"] == "INTERCEPT"
        ]
        fired = sum(r in FIRED_RESULTS for r in intercept_results)
        affiliation_calls = [e for e in evs if e["type"] == "AFFILIATION_SET"]

        types = {e["type"] for e in evs}
        if is_threat:
            if "CONTACT_NEUTRALISED" in types:
                outcome = "NEUTRALISED"
            elif "CONTACT_REACHED_ASSET" in types:
                outcome = "LEAKED"
            else:
                outcome = "UNRESOLVED"
        elif fired > 0:
            outcome = "FRATRICIDE" if spec.affiliation.value == "FRIENDLY" else "WRONGLY_ENGAGED"
        else:
            outcome = "IGNORED_OK"

        out.append(
            {
                "contactId": spec.id,
                "isThreat": is_threat,
                "trueClass": truth,
                "trackIds": sorted(t for t, c in track_contact.items() if c == spec.id),
                "firstDetectableTMs": first_detectable,
                "firstDetectableS": None if first_detectable is None else first_detectable / 1000,
                "traineeDetectedTMs": trainee_detected,
                "detectionLatencyS": latency,
                "classifiedAs": classified_as,
                "classificationCorrect": (
                    classification_result(classified_as, truth) if classified_as else None
                ),
                "identifiableWhenClassified": identifiable_when_classified,
                "responses": [e["payload"]["response"] for e in ordered],
                "interceptsOrdered": sum(e["payload"]["response"] == "INTERCEPT" for e in ordered),
                "interceptsFired": fired,
                "lastResult": intercept_results[-1] if intercept_results else None,
                "affiliationCalled": (
                    affiliation_calls[-1]["payload"]["affiliation"] if affiliation_calls else None
                ),
                "outcome": outcome,
            }
        )
    return out
