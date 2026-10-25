import uuid

from fastapi import APIRouter, status

from app.core.auth import CurrentUser, DbDep, StaffUser
from app.schemas.generated import (
    ActiveSessionsResponse,
    CompleteSessionRequest,
    CreateSessionRequest,
    CreateSessionResponse,
    EventBatchRequest,
    EventBatchResponse,
    RescoreRequest,
    Score,
    SessionDetailResponse,
)
from app.services import portal, sessions
from app.services.scoring import versions

router = APIRouter(prefix="/sessions", tags=["sessions"])


# exclude_unset on responses that embed a Scenario or Score: optional fields are
# omitted rather than sent as null (zod `.optional()` rejects null).
@router.post(
    "",
    response_model=CreateSessionResponse,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
)
def create_session(
    body: CreateSessionRequest, user: CurrentUser, db: DbDep
) -> CreateSessionResponse:
    return sessions.create_session(db, user, body)


@router.get("/active", response_model=ActiveSessionsResponse)
def active_sessions(
    user: StaffUser, db: DbDep, unit: uuid.UUID | None = None
) -> ActiveSessionsResponse:
    """Live monitor: ACTIVE sessions with a batch in the last minute (read-only, no score).
    Declared before /{session_id} so "active" is not parsed as an id."""
    return portal.active_sessions(db, unit)


@router.post("/{session_id}/events", response_model=EventBatchResponse)
def append_events(
    session_id: uuid.UUID, body: EventBatchRequest, user: CurrentUser, db: DbDep
) -> EventBatchResponse:
    return sessions.ingest_batch(db, user, session_id, body)


@router.post("/{session_id}/complete", response_model=Score, response_model_exclude_unset=True)
def complete_session(
    session_id: uuid.UUID, body: CompleteSessionRequest, user: CurrentUser, db: DbDep
) -> Score:
    """Validate the event log, score it on the server and store the score."""
    return sessions.complete_session(db, user, session_id, body)


@router.get(
    "/{session_id}", response_model=SessionDetailResponse, response_model_exclude_unset=True
)
def get_session(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> SessionDetailResponse:
    return sessions.session_detail(db, sessions.get_viewable_session(db, user, session_id))


@router.post(
    "/{session_id}/rescore",
    response_model=Score,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
)
def rescore_session(
    session_id: uuid.UUID, body: RescoreRequest, user: StaffUser, db: DbDep
) -> Score:
    """Re-score with another version of the scenario's tree; writes a new score row."""
    return versions.rescore(db, session_id, body.tree_id)
