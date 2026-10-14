import uuid

from fastapi import APIRouter, status

from app.core.auth import CurrentUser, DbDep
from app.schemas.generated import (
    CreateSessionRequest,
    CreateSessionResponse,
    EventBatchRequest,
    EventBatchResponse,
    SessionDetailResponse,
)
from app.services import sessions

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


@router.post("/{session_id}/events", response_model=EventBatchResponse)
def append_events(
    session_id: uuid.UUID, body: EventBatchRequest, user: CurrentUser, db: DbDep
) -> EventBatchResponse:
    return sessions.ingest_batch(db, user, session_id, body)


@router.get(
    "/{session_id}", response_model=SessionDetailResponse, response_model_exclude_unset=True
)
def get_session(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> SessionDetailResponse:
    return sessions.session_detail(db, sessions.get_viewable_session(db, user, session_id))
