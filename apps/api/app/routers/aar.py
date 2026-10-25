import uuid

from fastapi import APIRouter, Request

from app.core.auth import CurrentUser, DbDep, SettingsDep, StaffUser
from app.core.logging import TEST_DEBRIEF_HEADER
from app.schemas.generated import (
    AarSessionResponse,
    DebriefResponse,
    TraineeTrendsResponse,
    UnitDashboardResponse,
)
from app.services import aar
from app.services.ai import debrief
from app.services.analytics import trends

router = APIRouter(prefix="/aar", tags=["aar"])


# exclude_unset: optional fields are omitted, not sent as null (zod `.optional()` rejects null).
@router.get(
    "/sessions/{session_id}", response_model=AarSessionResponse, response_model_exclude_unset=True
)
def aar_session(session_id: uuid.UUID, user: CurrentUser, db: DbDep) -> AarSessionResponse:
    """Replay data for a completed session: scenario, event log and kill chain."""
    return aar.aar_session(db, user, session_id)


@router.post(
    "/sessions/{session_id}/debrief",
    response_model=DebriefResponse,
    response_model_exclude_unset=True,
)
def session_debrief(
    session_id: uuid.UUID,
    request: Request,
    user: CurrentUser,
    db: DbDep,
    settings: SettingsDep,
) -> DebriefResponse:
    """LLM debrief with a template fallback, generated once and cached (SPEC §13.1)."""
    force_template = (
        settings.dev_login_enabled and request.headers.get(TEST_DEBRIEF_HEADER) == "template"
    )
    return debrief.session_debrief(
        db, request.app.state.llm, user, session_id, force_template=force_template
    )


@router.post(
    "/sessions/{session_id}/debrief/regenerate",
    response_model=DebriefResponse,
    response_model_exclude_unset=True,
)
def regenerate_debrief(
    session_id: uuid.UUID,
    request: Request,
    user: StaffUser,
    db: DbDep,
    settings: SettingsDep,
) -> DebriefResponse:
    """Staff: discard the cached debrief and build it again (decision 151)."""
    force_template = (
        settings.dev_login_enabled and request.headers.get(TEST_DEBRIEF_HEADER) == "template"
    )
    return debrief.session_debrief(
        db,
        request.app.state.llm,
        user,
        session_id,
        force_template=force_template,
        regenerate=True,
    )


@router.get("/users/{user_id}/trends", response_model=TraineeTrendsResponse)
def user_trends(user_id: uuid.UUID, user: CurrentUser, db: DbDep) -> TraineeTrendsResponse:
    """Assessment trends of one trainee: self, or instructor / admin."""
    return trends.trainee_trends(db, user, user_id)


@router.get("/units/{unit_id}", response_model=UnitDashboardResponse)
def unit_dashboard(unit_id: uuid.UUID, user: StaffUser, db: DbDep) -> UnitDashboardResponse:
    """Unit averages, leaderboard, weakest kill-chain stage, mistakes, assignments."""
    return trends.unit_dashboard(db, unit_id)
