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
EW_RESPONSES = frozenset({"EW_JAM", "EW_SPOOF"})
EFFECTOR_RESPONSES = EW_RESPONSES | {"INTERCEPT"}
#: Link each EW response works against (SPEC §8).
EW_SUSCEPTIBLE = {"EW_JAM": "RF_MANUAL", "EW_SPOOF": "AUTONOMOUS_GNSS"}
EW_VERB = {"EW_JAM": "Jamming", "EW_SPOOF": "Spoofing"}
LINK_LABEL = {
    "RF_MANUAL": "manually flown (RF-linked)",
    "AUTONOMOUS_GNSS": "GNSS-autonomous",
    "FIBRE_OPTIC": "fibre-optic",
    "NONE": "link-less",
}
BIRD_CLASSES = frozenset({"BIRD_SMALL", "BIRD_LARGE"})
#: Decision is UNAVOIDABLE when warning < max(shortest able cooldown, this) (SPEC §9.6).
UNAVOIDABLE_FLOOR_S = 10.0


def able_cooldown_min_s(scenario: Scenario, control_link: str) -> float | None:
    """Shortest cooldown among effectors able to engage a contact with this link."""
    able = [
        e.cooldown_s
        for e in scenario.effectors
        if e.kind.value == "INTERCEPT" or EW_SUSCEPTIBLE.get(e.kind.value) == control_link
    ]
    return min(able) if able else None


def neutralised_method(by: str | None, rounds: int) -> str | None:
    if by == "EW_JAM":
        return "jammed"
    if by == "EW_SPOOF":
        return "spoofed"
    if by == "INTERCEPT":
        return f"{rounds} round(s)"
    return None


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
    # Fairness flag (SPEC §9.6, decision 39): with an EO/IR sensor in the scenario,
    # classifying before any EO_IDENTIFIABLE(IDENTIFY) means "before identifiable",
    # even if the trainee never pointed the camera.
    eo_modelled = any(s.kind == "EO_IR" for s in scenario.sensors)

    by_contact: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ev in events:
        contact = ev.get("contactId")
        if contact is None and ev.get("trackId") in track_contact:
            contact = track_contact[ev["trackId"]]
        if contact is not None:
            by_contact[contact].append(ev)

    collateral_outcomes = [
        e
        for e in events
        if e["type"] == "RESPONSE_OUTCOME"
        and (e["payload"].get("collateral") or {}).get("contactIds")
    ]

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
        # Outcomes of responses ordered on this contact's own tracks (not collateral).
        own_outcomes = [
            e for e in evs if e["type"] == "RESPONSE_OUTCOME" and e.get("contactId") == spec.id
        ]
        intercept_results = [
            e["payload"]["result"] for e in own_outcomes if e["payload"]["response"] == "INTERCEPT"
        ]
        fired = sum(r in FIRED_RESULTS for r in intercept_results)
        ew_outcomes = [e for e in own_outcomes if e["payload"]["response"] in EW_RESPONSES]
        link = spec.control_link.value
        ineffective_ew = [
            e
            for e in ew_outcomes
            if EW_SUSCEPTIBLE[e["payload"]["response"]] != link
            and e["payload"]["result"] == "NO_EFFECT"
        ]
        ew_fired = sum(e["payload"]["result"] in FIRED_RESULTS for e in ew_outcomes)
        effector_results = [
            e["payload"]["result"]
            for e in own_outcomes
            if e["payload"]["response"] in EFFECTOR_RESPONSES
        ]
        neutralised = [e for e in evs if e["type"] == "CONTACT_NEUTRALISED"]
        neutralised_by = neutralised[0]["payload"]["by"] if neutralised else None
        jammed = any(e["payload"]["by"] == "EW_JAM" for e in neutralised)
        collateral = any(
            spec.id in (e["payload"].get("collateral") or {}).get("contactIds", [])
            for e in collateral_outcomes
        )
        reached = first(frozenset({"CONTACT_REACHED_ASSET"}))
        affiliation_calls = [e for e in evs if e["type"] == "AFFILIATION_SET"]
        cooldown_min = able_cooldown_min_s(scenario, link)

        types = {e["type"] for e in evs}
        if is_threat:
            if "CONTACT_NEUTRALISED" in types:
                outcome = "NEUTRALISED"
            elif "CONTACT_REACHED_ASSET" in types:
                outcome = "LEAKED"
            else:
                outcome = "UNRESOLVED"
        else:
            friendly = spec.affiliation.value == "FRIENDLY"
            # Birds have no RF link: EW orders on them are pointless, never penalised (rule 10).
            ew_targeted = bool(ew_outcomes) and truth not in BIRD_CLASSES
            if fired > 0 and friendly:
                outcome = "FRATRICIDE"
            elif friendly and jammed:
                outcome = "FRIENDLY_JAMMED"
            elif fired > 0 or ew_targeted:
                outcome = "WRONGLY_ENGAGED"
            elif jammed and collateral:
                outcome = "CIVILIAN_JAMMED"
            else:
                outcome = "IGNORED_OK"
        warning_s = (
            (reached - first_detectable) / 1000
            if reached is not None and first_detectable is not None
            else None
        )
        unavoidable = (
            is_threat
            and outcome != "NEUTRALISED"
            and warning_s is not None
            and warning_s < max(cooldown_min or 0.0, UNAVOIDABLE_FLOOR_S)
        )
        rounds = fired
        engagements = ", ".join(
            part
            for part in (
                f"{fired} round(s)" if fired else "",
                f"{ew_fired} EW" if ew_fired else "",
            )
            if part
        )

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
                "lastResult": effector_results[-1] if effector_results else None,
                "controlLink": link,
                "controlLinkLabel": LINK_LABEL.get(link, link),
                "ewOrdered": sum(e["payload"]["response"] in EW_RESPONSES for e in ordered),
                "ewFired": ew_fired,
                "ineffectiveEw": len(ineffective_ew),
                "ineffectiveEwVerb": (
                    EW_VERB[ineffective_ew[0]["payload"]["response"]] if ineffective_ew else None
                ),
                "responsesFired": fired + ew_fired,
                "responsesOrdered": sum(
                    e["payload"]["response"] in EFFECTOR_RESPONSES for e in ordered
                ),
                "engagements": engagements or None,
                "neutralisedBy": neutralised_by,
                "neutralisedMethod": neutralised_method(neutralised_by, rounds),
                "jammedAsCollateral": collateral and jammed,
                "reachedAssetTMs": reached,
                "warningS": warning_s,
                "respondingEffectorCooldownMinS": cooldown_min,
                "unavoidableDecision": unavoidable,
                "affiliationCalled": (
                    affiliation_calls[-1]["payload"]["affiliation"] if affiliation_calls else None
                ),
                "outcome": outcome,
            }
        )
    return out
