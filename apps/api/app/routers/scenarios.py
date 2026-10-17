import uuid
from typing import Annotated

from fastapi import APIRouter, Query, Request, status

from app.core.auth import CurrentUser, DbDep
from app.schemas.generated import (
    GenerateRequest,
    GenerateScenarioResponse,
    ScenarioDetailResponse,
    ScenarioKind,
    ScenarioListResponse,
    UserRole,
)
from app.services import scenarios

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


@router.get("", response_model=ScenarioListResponse)
def list_scenarios(
    user: CurrentUser,
    db: DbDep,
    kind: ScenarioKind | None = None,
    difficulty: Annotated[int | None, Query(ge=1, le=5)] = None,
) -> ScenarioListResponse:
    include_test = user.role is not UserRole.TRAINEE
    if kind is ScenarioKind.GENERATED and user.role not in scenarios.STAFF_ROLES:
        kind = None  # trainees never list generated runs (theirs come in Part 3b)
    return ScenarioListResponse(
        items=scenarios.list_scenarios(
            db, kind, difficulty, include_test=include_test, user_id=user.id
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
    request.app.state.generate_limiter.check(str(user.id))
    return scenarios.generate_scenario(db, user, body)


# exclude_unset: optional scenario fields are omitted, not sent as null (zod
# `.optional()` rejects null).
@router.get(
    "/{scenario_id}", response_model=ScenarioDetailResponse, response_model_exclude_unset=True
)
def get_scenario(scenario_id: uuid.UUID, user: CurrentUser, db: DbDep) -> ScenarioDetailResponse:
    return scenarios.scenario_detail(scenarios.get_scenario_row(db, scenario_id, user))
