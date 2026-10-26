import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from app.core.auth import CurrentUser, DbDep, StaffUser
from app.core.errors import ApiError
from app.schemas.generated import (
    AuthorPreviewResponse,
    AuthorScenarioRequest,
    AuthorScenarioResponse,
    ErrorCode,
    FromTextRequest,
    FromTextResponse,
    GenerateRequest,
    GenerateScenarioResponse,
    ScenarioDetailResponse,
    ScenarioKind,
    ScenarioListResponse,
    UserRole,
)
from app.services import author, scenarios
from app.services.ai import from_text

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=ScenarioListResponse)
def list_scenarios(
    user: CurrentUser,
    db: DbDep,
    kind: ScenarioKind | None = None,
    difficulty: Annotated[int | None, Query(ge=1, le=5)] = None,
    mine: bool = False,
) -> ScenarioListResponse:
    """The library; with `mine=true`, the caller's own generated scenarios, newest first."""
    if mine:
        return ScenarioListResponse(items=scenarios.list_own_generated(db, user.id))
    include_test = user.role in scenarios.STAFF_ROLES
    if kind is ScenarioKind.GENERATED and user.role not in scenarios.STAFF_ROLES:
        kind = None  # trainees list only their own generated runs, with `mine=true`
    return ScenarioListResponse(
        items=scenarios.list_scenarios(
            db,
            kind,
            difficulty,
            include_test=include_test,
            user_id=user.id,
            demo_only=user.role is UserRole.GUEST,
        )
    )


# Declared before /{scenario_id}; POST on that path does not exist anyway.
@router.post(
    "/generate",
    response_model=GenerateScenarioResponse,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
)
def generate_scenario(
    body: GenerateRequest, request: Request, user: CurrentUser, db: DbDep
) -> GenerateScenarioResponse:
    if user.role is UserRole.GUEST:
        raise ApiError(ErrorCode.FORBIDDEN, "The demo generates only from its preset text")
    request.app.state.generate_limiter.check(str(user.id))
    return scenarios.generate_scenario(db, user, body)


@router.post("/from-text", response_model=FromTextResponse, response_model_exclude_unset=True)
def scenario_from_text(
    body: FromTextRequest, request: Request, user: StaffUser
) -> FromTextResponse:
    """Plain text → generator parameters (LLM), for the instructor to confirm (SPEC §13.2).

    Nothing is generated here: the client then calls POST /scenarios/generate.
    """
    return from_text.parse_text(request.app.state.llm, str(user.id), body.text)


@router.post("/preview", response_model=AuthorPreviewResponse, response_model_exclude_unset=True)
def preview_authored(
    body: AuthorScenarioRequest, user: StaffUser, db: DbDep
) -> AuthorPreviewResponse:
    """Scenario builder: the scenario that would be saved, or the checks it fails."""
    return author.preview(db, body)


@router.post(
    "",
    response_model=AuthorScenarioResponse,
    response_model_exclude_unset=True,
    status_code=status.HTTP_201_CREATED,
)
def save_authored(
    body: AuthorScenarioRequest, user: StaffUser, db: DbDep
) -> AuthorScenarioResponse:
    """Scenario builder: save as AUTHORED (the same request again returns the same row)."""
    return author.save(db, user, body)


# exclude_unset: optional scenario fields are omitted, not sent as null (zod
# `.optional()` rejects null).
@router.get(
    "/{scenario_id}", response_model=ScenarioDetailResponse, response_model_exclude_unset=True
)
def get_scenario(scenario_id: uuid.UUID, user: CurrentUser, db: DbDep) -> ScenarioDetailResponse:
    return scenarios.scenario_detail(scenarios.get_scenario_row(db, scenario_id, user))
