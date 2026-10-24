"""Session debrief (SPEC §13.1, decision 131): LLM with a template fallback, cached.

The LLM sees only the score breakdown, per-contact metrics, the kill-chain stages that
went wrong and the 10 most important events (never the raw log, never a name or e-mail).
Its JSON is validated with Pydantic and every mistake must carry a time that appears in
that input; otherwise (and when LLM_ENABLED=false, on a timeout or after the retry) the
template built from the scoring feedback is used. The UI labels which one it shows.
"""

import json
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Debrief, User
from app.models import Scenario as ScenarioRow
from app.schemas.generated import (
    ContactKillChain,
    DebriefContent,
    DebriefFallbackReason,
    DebriefResponse,
    DebriefSource,
    ErrorCode,
    KillChainStatus,
    Scenario,
    Score,
    SessionStatus,
)
from app.services.ai.llm import LlmClient, LlmError, prompt
from app.services.analytics.kill_chain import kill_chain
from app.services.scenarios import load_scenario
from app.services.sessions import get_viewable_session, latest_score, stored_events

TEMPLATE_MODEL = "template"
KEY_EVENT_LIMIT = 10
#: An LLM mistake time must be within this of a time given in the input.
TIME_TOLERANCE_MS = 1500
#: Cached fallbacks that are regenerated once the LLM can answer.
TRANSIENT = frozenset({"TIMEOUT", "ERROR", "RATE_LIMITED", "LLM_DISABLED"})

STAGE_WORD = {
    "DETECT": "Detect",
    "TRACK": "Track",
    "IDENTIFY": "Identify",
    "DECIDE": "Decide",
    "RESPOND": "Respond",
    "ASSESS": "Assess",
}
#: Why a stage matters and what to do instead (template wording).
STAGE_ADVICE: dict[str, tuple[str, str]] = {
    "DETECT": (
        "Every second before the mark is a second less to identify and engage.",
        "Scan the PPI every sweep and mark a new track (D) as soon as it appears.",
    ),
    "TRACK": (
        "A track nobody selects is never put on the camera, so it cannot be identified.",
        "Select the track (Tab) and cue the camera to it (Space).",
    ),
    "IDENTIFY": (
        "A wrong class leads to the wrong effector, a wasted round or a missed threat.",
        "Classify only after the camera shows IDENTIFY: zoom in, and use IR at night.",
    ),
    "DECIDE": (
        "Affiliation decides what the ROE allows; a wrong call risks fratricide or a leak.",
        "Set affiliation (H, F, N, U) from the identification, not from the track's behaviour.",
    ),
    "RESPOND": (
        "The response must suit the link and the ROE, and land before the threat reaches "
        "the asset.",
        "Match the effector to the link: jam an RF link, spoof GNSS, intercept fibre-optic.",
    ),
    "ASSESS": (
        "An unconfirmed result can leave a live threat inbound.",
        "Watch the outcome line in Comms and re-engage at once after a miss.",
    ),
}
DRILL = {
    "DETECT": "Run a D2 scenario in Practice and mark every new track within 5 s of it appearing.",
    "TRACK": "Run S15 in Practice: select and cue the camera to every track before classifying.",
    "IDENTIFY": "Run S15 in Practice: classify each track only after the camera shows IDENTIFY.",
    "DECIDE": "Run S14 in Practice: set the affiliation of every track before any response.",
    "RESPOND": (
        "Run S15 then S06 in Practice: identify every track on the camera before any effector "
        "order, and name the threat's link before you choose jam, spoof or intercept."
    ),
    "ASSESS": "Run a D3 scenario and confirm every engagement's outcome in Comms before moving on.",
}
#: Session-level penalties with no kill-chain stage of their own.
PENALTY_ADVICE: dict[str, tuple[str, str]] = {
    "ROE_VIOLATION_ATTEMPT": (
        "An intercept against the ROE is a breach even when the system blocks it.",
        "Check the ROE chip before ordering an intercept; classify and declare HOSTILE first.",
    ),
    "NO_KINETIC_VIOLATION_ATTEMPT": (
        "Kinetic fire over a no-kinetic zone risks people on the ground.",
        "Wait until the track leaves the zone, or use EW if its link allows.",
    ),
    "FRATRICIDE": (
        "Fire on a friendly drone is the worst outcome of the session.",
        "Check the friendly ID before any engagement, and confirm affiliation on EO/IR.",
    ),
    "FRIENDLY_JAMMED": (
        "A jam sector takes down every RF link in it, friendly ones included.",
        "Check the jam sector for own drones before ordering a jam.",
    ),
    "WRONGLY_ENGAGED": (
        "Engaging a non-threat wastes effectors and may harm civilians.",
        "Identify on the camera before you engage.",
    ),
}
COMPONENTS = ("detection", "classification", "decision", "report")

#: Base importance of an event type for the debrief (higher first).
EVENT_WEIGHT = {
    "CONTACT_REACHED_ASSET": 5,
    "CONTACT_DROPPED": 5,
    "RESPONSE_OUTCOME": 3,
    "RESPONSE_ORDERED": 2,
    "CLASSIFIED": 2,
    "AI_SUGGESTION_ACCEPTED": 2,
    "AI_SUGGESTION_REJECTED": 1,
    "AFFILIATION_SET": 1,
    "MARKED_DETECTED": 1,
    "REPORT_SUBMITTED": 1,
}


# ---- input ---------------------------------------------------------------------------


def _event_detail(ev: dict[str, Any]) -> str:
    p = ev.get("payload") or {}
    t = ev["type"]
    if t == "CLASSIFIED":
        return str(p.get("class", ""))
    if t == "AFFILIATION_SET":
        return str(p.get("affiliation", ""))
    if t == "RESPONSE_ORDERED":
        return str(p.get("response", ""))
    if t == "RESPONSE_OUTCOME":
        return f"{p.get('response', '')} {p.get('result', '')}".strip()
    if t == "REPORT_SUBMITTED":
        return f"{p.get('count', '')} x {p.get('class', '')} {p.get('activity', '')}".strip()
    if t in ("AI_SUGGESTION_ACCEPTED", "AI_SUGGESTION_REJECTED"):
        return f"{p.get('suggestedClass', '')} {round(100 * p.get('confidence', 0))}%"
    if t == "CONTACT_REACHED_ASSET":
        return "reached the asset"
    if t == "CONTACT_DROPPED":
        return "payload dropped"
    return ""


def key_events(events: list[dict[str, Any]], penalty_times: set[int]) -> list[dict[str, Any]]:
    """The 10 most important events, in time order (penalty moments weigh most)."""
    track_of_contact: dict[str, str] = {}
    for ev in events:
        if ev["type"] == "SENSOR_TRACK_CREATED" and ev.get("contactId") and ev.get("trackId"):
            track_of_contact.setdefault(ev["contactId"], ev["trackId"])
    scored = []
    for ev in events:
        w = EVENT_WEIGHT.get(ev["type"])
        if w is None:
            continue
        if ev["tMs"] in penalty_times:
            w += 4
        if ev["type"] == "RESPONSE_OUTCOME" and ev["payload"].get("result") != "NEUTRALISED":
            w += 1
        track = ev.get("trackId") or track_of_contact.get(ev.get("contactId") or "")
        scored.append((-w, ev["seq"], ev, track))
    top = sorted(scored, key=lambda x: (x[0], x[1]))[:KEY_EVENT_LIMIT]
    out = []
    for _, _, ev, track in sorted(top, key=lambda x: x[1]):
        item = {"tMs": ev["tMs"], "type": ev["type"], "trackId": track, "detail": _event_detail(ev)}
        out.append({k: v for k, v in item.items() if v not in (None, "")})
    return out


def _issues(chains: list[ContactKillChain]) -> list[dict[str, Any]]:
    out = []
    for c in chains:
        for s in c.stages:
            if s.status in (KillChainStatus.OK, KillChainStatus.NOT_APPLICABLE):
                continue
            item = {
                "contactId": c.contact_id,
                "trackId": _value(c.track_ids[0]) if c.track_ids else None,
                "isThreat": c.is_threat,
                "stage": s.stage.value,
                "status": s.status.value,
                "tMs": s.jump_t_ms,
                "feedback": s.feedback,
            }
            out.append({k: v for k, v in item.items() if v is not None})
    return out


def _value(v: Any) -> Any:
    v = getattr(v, "root", v)
    return getattr(v, "value", v)


def debrief_input(
    scenario: Scenario, mode: str, score: Score, events: list[dict[str, Any]]
) -> dict[str, Any]:
    """What the LLM may see (no raw log, no personal data)."""
    chains = kill_chain(scenario, events)
    penalty_times = {p.t_ms for p in score.penalties if p.t_ms is not None}
    keep = (
        "contactId",
        "trackIds",
        "isThreat",
        "trueClass",
        "classifiedAs",
        "classificationCorrect",
        "detectionLatencyS",
        "outcome",
        "responses",
        "feedback",
    )
    contacts = []
    for p in score.per_contact:
        d = p.model_dump(mode="json", by_alias=True, exclude_none=True)
        contacts.append({k: d[k] for k in keep if d.get(k) not in (None, [])})
    data = {
        "scenario": {
            "code": scenario.id,
            "name": scenario.name,
            "difficulty": _value(scenario.difficulty),
            "roe": _value(scenario.roe),
            "isNight": scenario.environment.is_night,
            "durationS": scenario.duration_s,
        },
        "mode": mode,
        "score": {
            "total": score.total,
            "components": score.components.model_dump(),
            "componentMax": score.component_max.model_dump(),
            "penalties": [
                p.model_dump(mode="json", by_alias=True, exclude_none=True) for p in score.penalties
            ],
        },
        "contacts": contacts,
        "killChainIssues": _issues(chains),
        "keyEvents": key_events(events, penalty_times),
    }
    # Plain JSON types only (generated root models do not serialise).
    return json.loads(json.dumps(data, default=_value))


def allowed_times(data: dict[str, Any]) -> set[int]:
    times = {p["tMs"] for p in data["score"]["penalties"] if "tMs" in p}
    times |= {i["tMs"] for i in data["killChainIssues"]}
    times |= {e["tMs"] for e in data["keyEvents"]}
    return times


# ---- template --------------------------------------------------------------------------


def _clip(text: str, n: int = 300) -> str:
    return text if len(text) <= n else text[: n - 1] + "…"


def template_debrief(data: dict[str, Any]) -> DebriefContent:
    """Built from the scoring feedback and the kill chain only."""
    s = data["score"]
    sc = data["scenario"]
    threats = [c for c in data["contacts"] if c["isThreat"]]
    neutralised = sum(c.get("outcome") == "NEUTRALISED" for c in threats)
    leaked = sum(c.get("outcome") == "LEAKED" for c in threats)
    issues = data["killChainIssues"]
    penalties = [p for p in s["penalties"] if p["points"] < 0 and not p.get("unavoidable")]
    lost = -sum(p["points"] for p in penalties)

    # Candidate mistakes, weighted by cost: a penalty by its points, a threat's stage 10,
    # a non-threat's stage 5. One per (contact, stage); a penalty at the same contact and
    # time as a stage replaces that stage's line.
    candidates: dict[tuple[str, Any], dict[str, Any]] = {}
    for i in issues:
        key = (i["contactId"], i["stage"])
        if key in candidates:
            continue
        if i["stage"] == "RESPOND" and not i["isThreat"]:
            why, instead = PENALTY_ADVICE["WRONGLY_ENGAGED"]
        else:
            why, instead = STAGE_ADVICE[i["stage"]]
        track = f"{i['trackId']} " if i.get("trackId") else ""
        candidates[key] = {
            "weight": 10 if i["isThreat"] else 5,
            "stage": i["stage"],
            "tMs": i["tMs"],
            "what": _clip(f"{track}{STAGE_WORD[i['stage']].upper()}: {i['feedback']}"),
            "whyItMatters": why,
            "doInstead": instead,
        }
    for p in penalties:
        if "tMs" not in p:
            continue
        why, instead = PENALTY_ADVICE.get(p["code"], STAGE_ADVICE["RESPOND"])
        # A penalty replaces the kill-chain line of the same contact at the same moment.
        stage = "RESPOND"
        for k, c in list(candidates.items()):
            if (
                k[0] == p.get("contactId")
                and k[1] in STAGE_WORD
                and abs(c["tMs"] - p["tMs"]) <= TIME_TOLERANCE_MS
            ):
                stage = c["stage"]
                del candidates[k]
        candidates[(p.get("contactId", ""), p["code"])] = {
            "weight": -p["points"],
            "stage": stage,
            "tMs": p["tMs"],
            "what": _clip(p["feedback"]),
            "whyItMatters": why,
            "doInstead": instead,
        }
    ranked = sorted(candidates.values(), key=lambda c: (-c["weight"], c["tMs"]))
    cost: dict[str, float] = {}
    for c in ranked:
        cost[c["stage"]] = cost.get(c["stage"], 0) + c["weight"]
    order = list(STAGE_WORD)
    weakest = max(cost, key=lambda k: (cost[k], -order.index(k)), default=None)

    summary = (
        f"Score {s['total']:.0f} / 100 on {sc['code']} {sc['name']} "
        f"(difficulty {sc['difficulty']}, {data['mode'].lower()}). "
        f"{neutralised} of {len(threats)} threats neutralised"
        + (f", {leaked} leaked" if leaked else "")
        + "."
        + (f" Penalties cost {lost:g} points ({len(penalties)})." if penalties else "")
        + (f" Weakest stage: {STAGE_WORD[weakest].lower()}." if weakest else "")
    )

    strengths = []
    for c in COMPONENTS:
        mx = s["componentMax"][c]
        if mx > 0 and s["components"][c] >= 0.8 * mx:
            strengths.append(f"{c.capitalize()}: {s['components'][c]:.1f} of {mx:g} points.")
    held = sum(1 for c in data["contacts"] if not c["isThreat"] and not c.get("responses"))
    if held:
        strengths.append(f"Held fire on {held} non-threat contact(s).")

    keys = ("tMs", "what", "whyItMatters", "doInstead")
    mistakes = sorted(({k: c[k] for k in keys} for c in ranked[:5]), key=lambda m: m["tMs"])
    drill = DRILL[weakest] if weakest else "Step up one difficulty level with the same routine."
    return DebriefContent.model_validate(
        {
            "summary": _clip(summary, 800),
            "strengths": strengths[:4],
            "mistakes": mistakes,
            "drill": drill,
        }
    )


# ---- LLM -------------------------------------------------------------------------------


def parse_llm_debrief(obj: dict[str, Any], times: set[int]) -> DebriefContent:
    """Pydantic validation plus: every mistake time must be one the input gave."""
    content = DebriefContent.model_validate(obj)  # ValidationError is a ValueError
    for m in content.mistakes:
        if not any(abs(m.t_ms - t) <= TIME_TOLERANCE_MS for t in times):
            raise ValueError(f"mistake at {m.t_ms} ms matches no time in the input")
    return content


def build_debrief(
    llm: LlmClient, user_key: str, data: dict[str, Any]
) -> tuple[DebriefContent, str, str | None]:
    """(content, model, fallback reason or None)."""
    times = allowed_times(data)
    try:
        content = llm.complete_json(
            user_key,
            prompt("debrief_system.txt"),
            prompt("debrief_user.txt").replace("{input_json}", json.dumps(data, indent=1)),
            lambda obj: parse_llm_debrief(obj, times),
        )
    except LlmError as err:
        return template_debrief(data), TEMPLATE_MODEL, err.reason
    return content, llm.model, None


# ---- service ---------------------------------------------------------------------------


def _response(row: Debrief) -> DebriefResponse:
    stored = row.content
    body: dict[str, Any] = {
        "sessionId": str(row.session_id),
        "source": stored["source"],
        "model": row.model,
        "content": stored["debrief"],
        "createdAt": row.created_at,
    }
    if stored.get("fallbackReason"):
        body["fallbackReason"] = stored["fallbackReason"]
    return DebriefResponse.model_validate(body)


def session_debrief(
    db: Session, llm: LlmClient, user: User, session_id: uuid.UUID
) -> DebriefResponse:
    """The cached debrief, or a new one (LLM or template) stored for next time.

    A template cached because the LLM was off or failed is replaced once the LLM is on.
    """
    row = get_viewable_session(db, user, session_id)
    if row.status is not SessionStatus.COMPLETED:
        raise ApiError(
            ErrorCode.SESSION_NOT_ACTIVE,
            "A debrief is available once the session is completed",
            {"status": row.status.value},
        )
    cached = db.get(Debrief, row.id)
    if cached is not None:
        if not (llm.enabled and cached.content.get("fallbackReason") in TRANSIENT):
            return _response(cached)
        db.delete(cached)
        db.flush()
    score = latest_score(db, row.id)
    if score is None:  # pragma: no cover - completed sessions always have a score
        raise ApiError(ErrorCode.NOT_FOUND, "Session has no score")
    scenario = load_scenario(db.get_one(ScenarioRow, row.scenario_id))
    data = debrief_input(scenario, row.mode.value, score, stored_events(db, row.id))
    content, model, reason = build_debrief(llm, str(user.id), data)
    stored = Debrief(
        session_id=row.id,
        model=model,
        content={
            "source": (DebriefSource.TEMPLATE if reason else DebriefSource.LLM).value,
            "fallbackReason": DebriefFallbackReason(reason).value if reason else None,
            "debrief": content.model_dump(mode="json", by_alias=True),
        },
        created_at=datetime.now(UTC),
    )
    db.add(stored)
    db.commit()
    db.refresh(stored)
    return _response(stored)
