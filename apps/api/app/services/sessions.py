"""Session lifecycle (SPEC §4.5): create, ingest event batches, complete + score, read."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import ScoreRow, SessionEvent, TrainingSession, User
from app.schemas.events import event_to_dict
from app.schemas.generated import (
    CompleteSessionRequest,
    CreateSessionRequest,
    CreateSessionResponse,
    ErrorCode,
    EventBatchRequest,
    EventBatchResponse,
    Scenario,
    Score,
    ScoreComponents,
    SessionDetailResponse,
    SessionEnded,
    SessionStatus,
    UserRole,
)
from app.services.plausibility import LogState, Violation, advance_state, check_batch
from app.services.recommendation import recommend_difficulty
from app.services.scenarios import get_scenario_row, load_scenario
from app.services.scoring.engine import score_session
from app.services.scoring.tree import load_tree
from app.services.terrain import preset_revision

ACCEPTS_EVENTS = frozenset({SessionStatus.CREATED, SessionStatus.ACTIVE})
VIEWER_ROLES = frozenset({UserRole.INSTRUCTOR, UserRole.ADMIN})
#: An ACTIVE session with no batch (heartbeats count) for this long is ABANDONED (SPEC §4.5).
IDLE_LIMIT = timedelta(minutes=15)


def _idle_since(row: TrainingSession) -> datetime:
    # Sessions from before last_batch_at existed fall back to their start time.
    return row.last_batch_at or row.started_at


def expire_if_stale(row: TrainingSession, now: datetime | None = None) -> bool:
    """Mark one ACTIVE session ABANDONED if it has been idle too long (caller commits)."""
    now = now or datetime.now(UTC)
    if row.status is not SessionStatus.ACTIVE or now - _idle_since(row) <= IDLE_LIMIT:
        return False
    row.status = SessionStatus.ABANDONED
    row.ended_at = now
    return True


def expire_stale_sessions(db: Session, now: datetime | None = None) -> int:
    """Startup sweep: every idle ACTIVE session becomes ABANDONED. Returns the count."""
    now = now or datetime.now(UTC)
    result = db.execute(
        update(TrainingSession)
        .where(
            TrainingSession.status == SessionStatus.ACTIVE,
            func.coalesce(TrainingSession.last_batch_at, TrainingSession.started_at)
            < now - IDLE_LIMIT,
        )
        .values(status=SessionStatus.ABANDONED, ended_at=now)
    )
    db.commit()
    return result.rowcount


def create_session(db: Session, user: User, body: CreateSessionRequest) -> CreateSessionResponse:
    scenario_row = get_scenario_row(db, body.scenario_id, user)
    scenario = load_scenario(scenario_row)
    row = TrainingSession(
        user_id=user.id,
        scenario_id=scenario_row.id,
        mode=body.mode,
        sim_version=body.sim_version,
        terrain_revision=preset_revision(scenario.terrain.preset),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return CreateSessionResponse(
        session_id=row.id,
        scenario=scenario,
        started_at=row.started_at,
        sim_version=body.sim_version,
    )


def _get(db: Session, session_id: uuid.UUID, *, for_update: bool = False) -> TrainingSession:
    row = db.get(TrainingSession, session_id, with_for_update=for_update)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Session not found")
    return row


def get_owned_session(
    db: Session, user: User, session_id: uuid.UUID, *, for_update: bool = False
) -> TrainingSession:
    row = _get(db, session_id, for_update=for_update)
    if row.user_id != user.id:
        raise ApiError(ErrorCode.FORBIDDEN, "Not your session")
    if expire_if_stale(row):
        db.commit()
    return row


def get_viewable_session(db: Session, user: User, session_id: uuid.UUID) -> TrainingSession:
    row = _get(db, session_id)
    if row.user_id != user.id and user.role not in VIEWER_ROLES:
        raise ApiError(ErrorCode.FORBIDDEN, "Not your session")
    if expire_if_stale(row):
        db.commit()
    return row


def load_log_state(db: Session, session_id: uuid.UUID) -> LogState:
    where = SessionEvent.session_id == session_id
    last_seq, last_t, count = db.execute(
        select(
            func.coalesce(func.max(SessionEvent.seq), -1),
            func.coalesce(func.max(SessionEvent.t_ms), 0),
            func.count(),
        ).where(where)
    ).one()
    ended = db.scalar(select(func.count()).where(where, SessionEvent.type == "SESSION_ENDED"))
    tracks = db.scalars(
        select(SessionEvent.track_id).where(
            where, SessionEvent.type == "SENSOR_TRACK_CREATED", SessionEvent.track_id.is_not(None)
        )
    )
    return LogState(
        last_seq=last_seq,
        last_t_ms=last_t,
        event_count=count,
        ended=bool(ended),
        known_tracks={t for t in tracks if t is not None},
    )


def ingest_batch(
    db: Session, user: User, session_id: uuid.UUID, body: EventBatchRequest
) -> EventBatchResponse:
    """Append a batch. Idempotent by batchSeq: a re-sent batch is ignored.

    An empty batch is a heartbeat (a paused practice run sends no events): it keeps
    the session from being abandoned and writes no event rows.
    """
    row = get_owned_session(db, user, session_id, for_update=True)
    if row.status not in ACCEPTS_EVENTS:
        raise ApiError(
            ErrorCode.SESSION_NOT_ACTIVE, "Session is not active", {"status": row.status.value}
        )
    state = load_log_state(db, row.id)
    if row.last_batch_seq is not None and body.batch_seq <= row.last_batch_seq:
        db.rollback()  # release the row lock
        return EventBatchResponse(accepted=0, last_seq=state.last_seq)

    events = [event_to_dict(e) for e in body.events]
    scenario = load_scenario(db.get_one(ScenarioRow, row.scenario_id))
    violations = check_batch(scenario, state, events, mode=row.mode.value)
    if violations:
        db.rollback()
        raise ApiError(
            ErrorCode.IMPLAUSIBLE_EVENTS,
            "Event batch failed plausibility checks",
            {"violations": [v.as_detail() for v in violations]},
        )

    db.add_all(
        SessionEvent(
            session_id=row.id,
            seq=ev["seq"],
            t_ms=ev["tMs"],
            type=ev["type"],
            contact_id=ev.get("contactId"),
            track_id=ev.get("trackId"),
            payload=ev["payload"],
        )
        for ev in events
    )
    advance_state(state, events)
    row.last_batch_seq = body.batch_seq
    row.last_batch_at = datetime.now(UTC)
    if events:
        row.status = SessionStatus.ACTIVE
    db.commit()
    return EventBatchResponse(accepted=len(events), last_seq=state.last_seq)


def _stored_events(db: Session, session_id: uuid.UUID) -> list[dict[str, Any]]:
    rows = db.scalars(
        select(SessionEvent).where(SessionEvent.session_id == session_id).order_by(SessionEvent.seq)
    )
    events = []
    for r in rows:
        ev: dict[str, Any] = {"seq": r.seq, "tMs": r.t_ms, "type": r.type, "payload": r.payload}
        if r.contact_id is not None:
            ev["contactId"] = r.contact_id
        if r.track_id is not None:
            ev["trackId"] = r.track_id
        events.append(ev)
    return events


def complete_session(
    db: Session, user: User, session_id: uuid.UUID, body: CompleteSessionRequest
) -> Score:
    """Validate the whole log, score it with the scenario's tree and store the score."""
    row = get_owned_session(db, user, session_id, for_update=True)
    if row.status is not SessionStatus.ACTIVE:
        raise ApiError(
            ErrorCode.SESSION_NOT_ACTIVE, "Session is not active", {"status": row.status.value}
        )
    scenario = load_scenario(db.get_one(ScenarioRow, row.scenario_id))
    events = _stored_events(db, row.id)
    violations = check_batch(scenario, LogState(), events, mode=row.mode.value)
    if not any(e["type"] == "SESSION_ENDED" for e in events):
        violations.append(Violation("NOT_ENDED", None, "The log has no SESSION_ENDED event"))
    last_t = events[-1]["tMs"] if events else 0
    if not last_t <= body.end_t_ms <= scenario.duration_s * 1000:
        violations.append(
            Violation("END_TIME_MISMATCH", None, f"endTMs {body.end_t_ms} does not fit the log")
        )
    if violations:
        db.rollback()
        raise ApiError(
            ErrorCode.IMPLAUSIBLE_EVENTS,
            "Event log failed plausibility checks",
            {"violations": [v.as_detail() for v in violations]},
        )

    score = score_session(scenario, events)
    c = score.components
    db.add(
        ScoreRow(
            session_id=row.id,
            total=score.total,
            detection=c.detection,
            classification=c.classification,
            decision=c.decision,
            report=c.report,
            efficiency=c.efficiency,
            penalties=[
                p.model_dump(mode="json", by_alias=True, exclude_unset=True)
                for p in score.penalties
            ],
            per_contact=[
                p.model_dump(mode="json", by_alias=True, exclude_unset=True)
                for p in score.per_contact
            ],
            metrics=score.metrics,
            tree_version=score.tree_version,
        )
    )
    row.status = SessionStatus.COMPLETED
    row.ended_at = datetime.now(UTC)
    row.client_meta = body.client_meta.model_dump(mode="json", by_alias=True, exclude_unset=True)
    db.commit()
    return with_derived_fields(score, scenario)


def with_derived_fields(score: Score, scenario: Scenario) -> Score:
    """Fields shown with a completed session but not produced by the scoring tree (decision 64).

    The stored score stays exactly as the engine produced it (so tree re-scores compare
    byte-for-byte); `trueClass` per contact and the recommended difficulty are added on
    every read. Only completed sessions have scores, so truth is never sent mid-session.
    """
    true_class = {c.id: c.class_ for c in scenario.contacts}
    per_contact = [
        p.model_copy(update={"true_class": true_class.get(p.contact_id)}) for p in score.per_contact
    ]
    nxt, basis = recommend_difficulty(score.total, scenario.difficulty)
    return score.model_copy(
        update={
            "per_contact": per_contact,
            "recommended_difficulty": nxt,
            "recommendation_basis": basis,
        }
    )


def latest_score(db: Session, session_id: uuid.UUID) -> Score | None:
    row = db.scalar(
        select(ScoreRow)
        .where(ScoreRow.session_id == session_id)
        .order_by(ScoreRow.created_at.desc())
        .limit(1)
    )
    if row is None:
        return None
    score = Score.model_validate(
        {
            "total": row.total,
            "components": ScoreComponents(
                detection=row.detection,
                classification=row.classification,
                decision=row.decision,
                report=row.report,
                efficiency=row.efficiency,
            ),
            # Tree versions are immutable, so the max per component comes from the file.
            "componentMax": load_tree(row.tree_version).component_max,
            "penalties": row.penalties,
            "perContact": row.per_contact,
            "metrics": row.metrics,
            "treeVersion": row.tree_version,
        }
    )
    session = db.get_one(TrainingSession, session_id)
    return with_derived_fields(score, load_scenario(db.get_one(ScenarioRow, session.scenario_id)))


def session_ended(db: Session, session_id: uuid.UUID) -> SessionEnded | None:
    """How the run ended, from its stored SESSION_ENDED event (null before it ends)."""
    ev = db.scalar(
        select(SessionEvent).where(
            SessionEvent.session_id == session_id, SessionEvent.type == "SESSION_ENDED"
        )
    )
    if ev is None:
        return None
    return SessionEnded.model_validate({"reason": ev.payload["reason"], "tMs": ev.t_ms})


def session_detail(db: Session, row: TrainingSession) -> SessionDetailResponse:
    scenario_row = db.get_one(ScenarioRow, row.scenario_id)
    return SessionDetailResponse(
        id=row.id,
        scenario_id=row.scenario_id,
        scenario_name=scenario_row.name,
        mode=row.mode,
        status=row.status,
        started_at=row.started_at,
        ended_at=row.ended_at,
        sim_version=row.sim_version,
        terrain_revision=row.terrain_revision,
        score=latest_score(db, row.id),
        ended=session_ended(db, row.id),
    )
