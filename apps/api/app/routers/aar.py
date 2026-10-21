import uuid

from fastapi import APIRouter

from app.core.auth import CurrentUser, DbDep
from app.schemas.generated import AarSessionResponse
from app.services import aar

router = APIRouter(prefix="/aar", tags=["aar"])


# exclude_unset: optional fields are omitted, not sent as null (zod `.optional()` rejects null).
@router.get(
    "/sessions/{session_id}", response_model=AarSessionResponse, response_model_exclude_unset=True
)
def aar_session(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> AarSessionResponse:
    """Replay data for a completed session: scenario, event log and kill chain."""
    return aar.aar_session(db, user, session_id)
