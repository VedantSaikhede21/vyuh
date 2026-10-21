"""Kill-chain breakdown per contact for the AAR (SPEC §12 Phase 4, decision 105).

DETECT → TRACK → IDENTIFY → DECIDE → RESPOND → ASSESS, each with when it became
possible, when the trainee acted, what they did against what was really there,
a status and one line of feedback. Built from the stored event log and the same
per-contact metrics the scoring tree uses, so the breakdown agrees with the score.
Part 4b's unit dashboard aggregates these rows (weakest stage).
"""

from collections import defaultdict
from typing import Any

from app.schemas.generated import (
    ContactKillChain,
    KillChainStage,
    KillChainStatus,
    KillChainStep,
    Scenario,
)
from app.services.scoring.metrics import (
    EFFECTOR_RESPONSES,
    EW_SUSCEPTIBLE,
    contact_metrics,
)

#: Acting later than this after a stage became possible is LATE (the v1 tree's 15 s band).
#: DETECT, TRACK, IDENTIFY and DECIDE only: a response waits for range and an effector
#: for its cooldown, so RESPOND is LATE only after a leak and ASSESS never is.
LATE_AFTER_S = 15.0
FAILED_RESULTS = frozenset({"MISSED", "NO_EFFECT"})
RESPONSE_LABEL = {
    "INTERCEPT": "Intercept",
    "EW_JAM": "Jam",
    "EW_SPOOF": "Spoof",
    "MONITOR": "Monitor",
    "REPORT": "Report",
}

S = KillChainStatus


def _right_response(link: str) -> str:
    """The responses that can defeat this link (SPEC §8)."""
    ew = [RESPONSE_LABEL[r] for r, susceptible in EW_SUSCEPTIBLE.items() if susceptible == link]
    return " or ".join([*ew, "intercept"]) if ew else "Intercept"


def _latency(available: int | None, action: int | None) -> float | None:
    if available is None or action is None:
        return None
    return max(action - available, 0) / 1000


def _timed(status: KillChainStatus, latency: float | None) -> KillChainStatus:
    return S.LATE if status is S.OK and latency is not None and latency > LATE_AFTER_S else status


def _step(
    stage: KillChainStage,
    status: KillChainStatus,
    feedback: str,
    jump: int,
    *,
    available: int | None = None,
    action_t: int | None = None,
    action: str | None = None,
    truth: str | None = None,
) -> KillChainStep:
    latency = _latency(available, action_t)
    fields: dict[str, Any] = {
        "available_t_ms": available,
        "action_t_ms": action_t,
        "latency_s": latency,
        "action": action,
        "truth": truth,
    }
    return KillChainStep(
        stage=stage,
        status=status,
        feedback=feedback,
        jump_t_ms=jump,
        **{k: v for k, v in fields.items() if v is not None},
    )


def kill_chain(scenario: Scenario, events: list[dict[str, Any]]) -> list[ContactKillChain]:
    """One row per scenario contact, in contact-id order."""
    track_contact = {
        e["trackId"]: e["contactId"] for e in events if e["type"] == "SENSOR_TRACK_CREATED"
    }
    by_contact: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for ev in events:
        cid = ev.get("contactId") or track_contact.get(ev.get("trackId") or "")
        if cid:
            by_contact[cid].append(ev)
    specs = {c.id: c for c in scenario.contacts}
    out: list[ContactKillChain] = []
    for m in contact_metrics(scenario, events):
        spec = specs[m["contactId"]]
        out.append(_contact_row(m, spec, by_contact.get(spec.id, [])))
    return out


def _contact_row(m: dict[str, Any], spec: Any, evs: list[dict[str, Any]]) -> ContactKillChain:
    threat: bool = m["isThreat"]
    spawn: int = spec.spawn_t_ms

    def first_t(pred: Any) -> int | None:
        return next((e["tMs"] for e in evs if pred(e)), None)

    # DETECT
    avail = m["firstDetectableTMs"]
    acted = m["traineeDetectedTMs"]
    if avail is None:
        detect = _step(
            KillChainStage.DETECT,
            S.NOT_APPLICABLE,
            "Never detectable by your sensors; not scored.",
            spawn,
        )
    elif acted is None:
        detect = _step(
            KillChainStage.DETECT,
            S.MISSED if threat else S.NOT_APPLICABLE,
            "Its track was never acted on." if threat else "No action needed for a non-threat.",
            avail,
            available=avail,
        )
    else:
        status = _timed(S.OK, _latency(avail, acted))
        detect = _step(
            KillChainStage.DETECT,
            status,
            f"Acted {_latency(avail, acted):.0f} s after it became detectable.",
            acted,
            available=avail,
            action_t=acted,
            action="Acted on its track",
        )

    # TRACK
    track_t = first_t(lambda e: e["type"] == "SENSOR_TRACK_CREATED")
    cue = next(
        (
            e
            for e in evs
            if e["type"] == "TRACK_SELECTED"
            or (e["type"] == "CAMERA_SLEWED" and e.get("trackId") is not None)
        ),
        None,
    )
    if track_t is None:
        track = _step(KillChainStage.TRACK, S.NOT_APPLICABLE, "No sensor track was formed.", spawn)
    elif cue is None:
        track = _step(
            KillChainStage.TRACK,
            S.MISSED if threat else S.NOT_APPLICABLE,
            "Never selected or cued the camera on its track."
            if threat
            else "Not selected; no action needed.",
            track_t,
            available=track_t,
        )
    else:
        verb = "Selected" if cue["type"] == "TRACK_SELECTED" else "Camera cued on"
        track = _step(
            KillChainStage.TRACK,
            _timed(S.OK, _latency(track_t, cue["tMs"])),
            f"{verb} {cue['trackId']} {_latency(track_t, cue['tMs']):.0f} s after it appeared.",
            cue["tMs"],
            available=track_t,
            action_t=cue["tMs"],
            action=f"{verb} {cue['trackId']}",
        )

    # IDENTIFY
    ident_t = first_t(
        lambda e: e["type"] == "EO_IDENTIFIABLE" and e["payload"]["level"] == "IDENTIFY"
    )
    classified = [e for e in evs if e["type"] == "CLASSIFIED"]
    truth_class = m["trueClass"]
    if not classified:
        identify = _step(
            KillChainStage.IDENTIFY,
            S.MISSED if threat else S.NOT_APPLICABLE,
            "Never classified." if threat else "Not classified.",
            ident_t or track_t or spawn,
            available=ident_t,
            truth=truth_class,
        )
    else:
        last = classified[-1]
        result = m["classificationCorrect"]
        if result == "EXACT":
            status, fb = S.OK, "Correct class."
        elif result == "CATEGORY":
            status, fb = S.WRONG, f"Right category, wrong type: it was a {truth_class}."
        else:
            status, fb = S.WRONG, f"Wrong category: it was a {truth_class}."
        if m["identifiableWhenClassified"] is False:
            fb += " Classified before the EO/IR view could identify it."
        identify = _step(
            KillChainStage.IDENTIFY,
            _timed(status, _latency(ident_t, last["tMs"])),
            fb,
            last["tMs"],
            available=ident_t,
            action_t=last["tMs"],
            action=f"Classified {last['payload']['class']}",
            truth=truth_class,
        )

    # DECIDE
    affiliation = spec.affiliation.value
    calls = [e for e in evs if e["type"] == "AFFILIATION_SET"]
    decide_from = classified[-1]["tMs"] if classified else acted
    if not calls:
        decide = _step(
            KillChainStage.DECIDE,
            S.MISSED if threat else S.NOT_APPLICABLE,
            "Never declared an affiliation." if threat else "Affiliation not declared.",
            decide_from or track_t or spawn,
            available=decide_from,
            truth=affiliation,
        )
    else:
        call = calls[-1]
        said = call["payload"]["affiliation"]
        ok = said == affiliation
        decide = _step(
            KillChainStage.DECIDE,
            _timed(S.OK if ok else S.WRONG, _latency(decide_from, call["tMs"])),
            "Correct affiliation." if ok else f"Declared {said}; it was {affiliation}.",
            call["tMs"],
            available=decide_from,
            action_t=call["tMs"],
            action=f"Declared {said}",
            truth=affiliation,
        )

    # RESPOND
    link = m["controlLink"]
    orders = [
        e
        for e in evs
        if e["type"] == "RESPONSE_ORDERED" and e["payload"]["response"] in EFFECTOR_RESPONSES
    ]
    outcomes = [
        e
        for e in evs
        if e["type"] == "RESPONSE_OUTCOME"
        and e.get("contactId") == spec.id
        and e["payload"]["response"] in EFFECTOR_RESPONSES
    ]
    respond_from = calls[-1]["tMs"] if calls else decide_from
    right = _right_response(link) if threat else "Hold fire"
    if not orders:
        if not threat:
            respond = _step(
                KillChainStage.RESPOND, S.OK, "Held fire.", respond_from or spawn, truth=right
            )
        elif m["unavoidableDecision"]:
            respond = _step(
                KillChainStage.RESPOND,
                S.NOT_APPLICABLE,
                "Too little warning to respond; not scored.",
                respond_from or spawn,
                truth=right,
            )
        else:
            respond = _step(
                KillChainStage.RESPOND,
                S.MISSED,
                "No response was ordered.",
                respond_from or avail or spawn,
                available=respond_from,
                truth=right,
            )
    else:
        order = orders[0]
        kind = order["payload"]["response"]
        result = next((o["payload"]["result"] for o in outcomes if o["tMs"] >= order["tMs"]), None)
        action = RESPONSE_LABEL[kind] + (f" · {result}" if result else "")
        if not threat:
            status, fb = S.WRONG, f"Engaged a non-threat ({m['trueClass']})."
        elif kind in EW_SUSCEPTIBLE and EW_SUSCEPTIBLE[kind] != link:
            status, fb = (
                S.WRONG,
                f"{RESPONSE_LABEL[kind]} cannot affect a {m['controlLinkLabel']} drone.",
            )
        elif result in {"BLOCKED_BY_ROE", "BLOCKED_NO_KINETIC"}:
            status, fb = S.WRONG, "Blocked by ROE or a no-kinetic zone."
        else:
            status, fb = S.OK, "Right response for its link."
        leak = m["reachedAssetTMs"] if m["droppedTMs"] is None else m["droppedTMs"]
        if status is S.OK and leak is not None and order["tMs"] > leak:
            status, fb = S.LATE, "Ordered only after it reached the asset or dropped its payload."
        respond = _step(
            KillChainStage.RESPOND,
            status,
            fb,
            order["tMs"],
            available=respond_from,
            action_t=order["tMs"],
            action=action,
            truth=right,
        )

    # ASSESS: when the outcome was known, and whether the follow-up was right.
    neutral_t = first_t(lambda e: e["type"] == "CONTACT_NEUTRALISED")
    failed = next((o for o in outcomes if o["payload"]["result"] in FAILED_RESULTS), None)
    leak_t = m["reachedAssetTMs"] or m["droppedTMs"]
    if not threat or not orders:
        assess = _step(
            KillChainStage.ASSESS,
            S.NOT_APPLICABLE,
            "No engagement to assess." if threat else "Not engaged.",
            neutral_t or leak_t or respond.jump_t_ms,
        )
    elif neutral_t is not None and (failed is None or failed["tMs"] >= neutral_t):
        wasted = [o for o in orders if o["tMs"] > neutral_t]
        assess = _step(
            KillChainStage.ASSESS,
            S.WRONG if wasted else S.OK,
            f"{len(wasted)} more order(s) after it was neutralised."
            if wasted
            else "Neutralised; no rounds wasted afterwards.",
            neutral_t,
            available=neutral_t,
            action_t=wasted[0]["tMs"] if wasted else None,
            action="Ceased engagement" if not wasted else "Kept engaging",
        )
    elif failed is not None:
        again = next((o for o in orders if o["tMs"] > failed["tMs"]), None)
        result = failed["payload"]["result"]
        assess = _step(
            KillChainStage.ASSESS,
            S.OK if again else S.MISSED,
            f"Re-engaged after {result}." if again else f"No follow-up after {result}.",
            failed["tMs"],
            available=failed["tMs"],
            action_t=again["tMs"] if again else None,
            action=f"Re-engaged ({RESPONSE_LABEL[again['payload']['response']]})"
            if again
            else None,
            truth=f"{result}: re-engage",
        )
    else:
        assess = _step(
            KillChainStage.ASSESS,
            S.MISSED if leak_t is not None else S.NOT_APPLICABLE,
            "The response never took effect." if leak_t is not None else "Outcome not reached.",
            leak_t or respond.jump_t_ms,
            available=leak_t,
        )

    return ContactKillChain.model_validate(
        {
            "contactId": spec.id,
            "isThreat": threat,
            "trueClass": spec.class_.value,
            "trueAffiliation": spec.affiliation.value,
            "trackIds": m["trackIds"],
            "outcome": m["outcome"],
            "stages": [detect, track, identify, decide, respond, assess],
        }
    )
