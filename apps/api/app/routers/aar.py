import uuid

from fastapi import APIRouter

from app.core.auth import CurrentUser, DbDep, StaffUser
from app.schemas.generated import AarSessionResponse, TraineeTrendsResponse, UnitDashboardResponse
from app.services import aar
from app.services.analytics import trends

router = APIRouter(prefix="/aar", tags=["aar"])


# exclude_unset: optional fields are omitted, not sent as null (zod `.optional()` rejects null).
@router.get(
    "/sessions/{session_id}", response_model=AarSessionResponse, response_model_exclude_unset=True
)
def aar_session(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> AarSessionResponse:
    """Replay data for a completed session: scenario, event log and kill chain."""
    return aar.aar_session(db, user, session_id)


@router.get("/users/{user_id}/trends", response_model=TraineeTrendsResponse)
def user_trends(user_id: uuid.UUID, user: CurrentUser, db: DbDep) -> TraineeTrendsResponse:
    """Assessment trends of one trainee: self, or instructor / admin."""
    return trends.trainee_trends(db, user, user_id)


@router.get("/units/{unit_id}", response_model=UnitDashboardResponse)
def unit_dashboard(unit_id: uuid.UUID, user: StaffUser, db: DbDep) -> UnitDashboardResponse:
    """Unit averages, leaderboard, weakest kill-chain stage, mistakes, assignments."""
    return trends.unit_dashboard(db, unit_id)
