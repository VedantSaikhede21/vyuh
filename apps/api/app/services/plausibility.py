"""Event-log plausibility checks (SPEC §3.3).

The server trusts client sensor events in the MVP but rejects logs that could
not have come from an honest sim run. Each failed rule is reported by code in
the IMPLAUSIBLE_EVENTS error details.
"""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass, field
from typing import Any

from app.schemas.generated import Scenario

# Mirrors MAX_EVENTS_PER_SESSION in packages/shared/src/api.ts (checked by tests).
MAX_EVENTS_PER_SESSION = 20_000

DETECTION_TYPES = frozenset({"SENSOR_TRACK_CREATED", "EO_IDENTIFIABLE"})
# Trainee events about a track; the track must already exist.
TRACK_COMMAND_TYPES = frozenset(
    {
        "TRACK_SELECTED",
        "MARKED_DETECTED",
        "CLASSIFIED",
        "AFFILIATION_SET",
        "RESPONSE_ORDERED",
        "AI_SUGGESTION_ACCEPTED",
        "AI_SUGGESTION_REJECTED",
    }
)

# Events whose trackId is optional; when present, the track must already exist.
OPTIONAL_TRACK_TYPES = frozenset({"CAMERA_SLEWED", "CONTACT_DROPPED"})

#: Bounds on REPORT_TRUTH values (decision 104): far beyond any preset or drone.
MAX_ABS_COORD_M = 100_000.0
AGL_RANGE_M = (-100.0, 10_000.0)
MAX_SPEED_MPS = 200.0


@dataclass(frozen=True)
class PendingReport:
    """A REPORT_SUBMITTED whose REPORT_TRUTH must come next."""

    seq: int
    t_ms: int
    track_ids: tuple[str, ...]


@dataclass
class LogState:
    """What is already stored for a session, needed to check the next batch."""

    last_seq: int = -1
    last_t_ms: int = 0
    event_count: int = 0
    ended: bool = False
    #: Track id → contact id, from SENSOR_TRACK_CREATED.
    known_tracks: dict[str, str] = field(default_factory=dict)
    pending_report: PendingReport | None = None


@dataclass(frozen=True)
class Violation:
    rule: str
    seq: int | None
    message: str

    def as_detail(self) -> dict[str, Any]:
        return {"rule": self.rule, "seq": self.seq, "message": self.message}


def check_batch(
    scenario: Scenario, state: LogState, events: Sequence[dict[str, Any]], *, mode: str
) -> list[Violation]:
    """Check a batch (camelCase event dicts) against the stored log; updates nothing."""
    out: list[Violation] = []
    if state.event_count + len(events) > MAX_EVENTS_PER_SESSION:
        out.append(Violation("TOO_MANY_EVENTS", None, f"More than {MAX_EVENTS_PER_SESSION} events"))
    spawn = {c.id: c.spawn_t_ms for c in scenario.contacts}
    duration_ms = scenario.duration_s * 1000
    last_seq, last_t, ended = state.last_seq, state.last_t_ms, state.ended
    tracks = dict(state.known_tracks)
    pending = state.pending_report

    for ev in events:
        seq, t, kind = ev["seq"], ev["tMs"], ev["type"]
        contact, track = ev.get("contactId"), ev.get("trackId")

        def bad(rule: str, message: str, seq: int = seq) -> None:
            out.append(Violation(rule, seq, message))

        if seq != last_seq + 1:
            bad("SEQ_NOT_CONTIGUOUS", f"Expected seq {last_seq + 1}, got {seq}")
        if t < last_t:
            bad("TIME_NOT_MONOTONIC", f"tMs {t} is before {last_t}")
        if t > duration_ms:
            bad("TIME_OUT_OF_RANGE", f"tMs {t} is after the scenario end ({duration_ms})")
        if ended:
            bad("EVENT_AFTER_END", "Event after SESSION_ENDED")
        if seq == 0:
            payload = ev.get("payload", {})
            if kind != "SESSION_STARTED":
                bad("FIRST_NOT_SESSION_STARTED", "The first event must be SESSION_STARTED")
            elif (
                payload.get("scenarioId") != scenario.id
                or payload.get("seed") != scenario.seed
                or payload.get("mode") != mode
            ):
                bad("SESSION_START_MISMATCH", "SESSION_STARTED does not match this session")
        elif kind == "SESSION_STARTED":
            bad("DUPLICATE_SESSION_STARTED", "SESSION_STARTED may only be the first event")
        if contact is not None and contact not in spawn:
            bad("UNKNOWN_CONTACT", f"Contact {contact!r} is not in the scenario")
        elif contact is not None and kind in DETECTION_TYPES and t < spawn[contact]:
            bad("DETECTION_BEFORE_SPAWN", f"{kind} for {contact} before it spawned")
        elif contact is not None and kind == "CONTACT_DROPPED" and t < spawn[contact]:
            bad("DROP_BEFORE_SPAWN", f"CONTACT_DROPPED for {contact} before it spawned")
        if pending is not None and kind != "REPORT_TRUTH":
            bad("REPORT_TRUTH_MISSING", f"REPORT_SUBMITTED {pending.seq} has no REPORT_TRUTH")
            pending = None
        if kind == "REPORT_SUBMITTED":
            ids = tuple(ev.get("payload", {}).get("trackIds", []))
            if unknown := [t for t in ids if t not in tracks]:
                bad("UNKNOWN_TRACK", f"REPORT_SUBMITTED names unknown tracks {unknown}")
            pending = PendingReport(seq, t, ids)
        elif kind == "REPORT_TRUTH":
            for rule, message in _truth_problems(ev, pending, tracks, spawn):
                bad(rule, message)
            pending = None
        if kind == "SENSOR_TRACK_CREATED" and track is not None:
            if track in tracks:
                bad("DUPLICATE_TRACK", f"Track {track} created twice")
            tracks[track] = contact or ""
        elif (
            kind in TRACK_COMMAND_TYPES or (kind in OPTIONAL_TRACK_TYPES and track is not None)
        ) and track not in tracks:
            # Covers "no classification before detection".
            bad("UNKNOWN_TRACK", f"{kind} for track {track!r} before the track existed")

        last_seq, last_t = seq, max(last_t, t)
        ended = ended or kind == "SESSION_ENDED"
    return out


def _truth_problems(
    ev: dict[str, Any],
    pending: PendingReport | None,
    tracks: dict[str, str],
    spawn: dict[str, int],
) -> list[tuple[str, str]]:
    """REPORT_TRUTH must follow its REPORT_SUBMITTED and describe exactly the contacts
    behind the reported tracks, with values in bounds (decision 104)."""
    payload = ev.get("payload", {})
    if pending is None or payload.get("reportSeq") != pending.seq or ev["tMs"] != pending.t_ms:
        return [("REPORT_TRUTH_MISMATCH", "REPORT_TRUTH does not follow its REPORT_SUBMITTED")]
    out: list[tuple[str, str]] = []
    contacts = payload.get("contacts", [])
    expected = sorted({tracks[t] for t in pending.track_ids if t in tracks})
    if [c.get("contactId") for c in contacts] != expected:
        out.append(("REPORT_TRUTH_MISMATCH", "REPORT_TRUTH contacts do not match the tracks"))
    for c in contacts:
        cid = c.get("contactId")
        if cid not in spawn:
            out.append(("UNKNOWN_CONTACT", f"Contact {cid!r} is not in the scenario"))
        in_bounds = (
            abs(c.get("x", 0)) <= MAX_ABS_COORD_M
            and abs(c.get("z", 0)) <= MAX_ABS_COORD_M
            and AGL_RANGE_M[0] <= c.get("aglM", 0) <= AGL_RANGE_M[1]
            and 0 <= c.get("speedMps", 0) <= MAX_SPEED_MPS
        )
        if not in_bounds:
            out.append(
                ("REPORT_TRUTH_OUT_OF_BOUNDS", f"REPORT_TRUTH values for {cid} out of bounds")
            )
    return out


def advance_state(state: LogState, events: Iterable[dict[str, Any]]) -> None:
    """Fold an accepted batch into the state."""
    for ev in events:
        state.last_seq = ev["seq"]
        state.last_t_ms = max(state.last_t_ms, ev["tMs"])
        state.event_count += 1
        state.ended = state.ended or ev["type"] == "SESSION_ENDED"
        if ev["type"] == "SENSOR_TRACK_CREATED" and ev.get("trackId"):
            state.known_tracks[ev["trackId"]] = ev.get("contactId") or ""
        if ev["type"] == "REPORT_SUBMITTED":
            ids = tuple(ev.get("payload", {}).get("trackIds", []))
            state.pending_report = PendingReport(ev["seq"], ev["tMs"], ids)
        else:
            state.pending_report = None
