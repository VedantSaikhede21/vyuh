"""Session lifecycle (SPEC §4.5): create, ingest event batches, read."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import SessionEvent, TrainingSession, User
from app.schemas.events import event_to_dict
from app.schemas.generated import (
    CreateSessionRequest,
    CreateSessionResponse,
    ErrorCode,
    EventBatchRequest,
    EventBatchResponse,
    SessionDetailResponse,
    SessionStatus,
    UserRole,
)
from app.services.plausibility import LogState, advance_state, check_batch
from app.services.scenarios import get_scenario_row, load_scenario

ACCEPTS_EVENTS = frozenset({SessionStatus.CREATED, SessionStatus.ACTIVE})
VIEWER_ROLES = frozenset({UserRole.INSTRUCTOR, UserRole.ADMIN})


def create_session(db: Session, user: User, body: CreateSessionRequest) -> CreateSessionResponse:
    scenario_row = get_scenario_row(db, body.scenario_id)
    row = TrainingSession(user_id=user.id, scenario_id=scenario_row.id, mode=body.mode)
    db.add(row)
    db.commit()
    db.refresh(row)
    return CreateSessionResponse(
        session_id=row.id, scenario=load_scenario(scenario_row), started_at=row.started_at
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
    return row


def get_viewable_session(db: Session, user: User, session_id: uuid.UUID) -> TrainingSession:
    row = _get(db, session_id)
    if row.user_id != user.id and user.role not in VIEWER_ROLES:
        raise ApiError(ErrorCode.FORBIDDEN, "Not your session")
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
    """Append a batch. Idempotent by batchSeq: a re-sent batch is ignored."""
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
    row.status = SessionStatus.ACTIVE
    db.commit()
    return EventBatchResponse(accepted=len(events), last_seq=state.last_seq)


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
        score=None,
    )
