import uuid
from typing import Annotated

from fastapi import APIRouter, Query

from app.core.auth import CurrentUser, DbDep
from app.schemas.generated import (
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
    return ScenarioListResponse(
        items=scenarios.list_scenarios(db, kind, difficulty, include_test=include_test)
    )


# exclude_unset: optional scenario fields are omitted, not sent as null (zod
# `.optional()` rejects null).
@router.get(
    "/{scenario_id}", response_model=ScenarioDetailResponse, response_model_exclude_unset=True
)
def get_scenario(scenario_id: uuid.UUID, _user: CurrentUser, db: DbDep) -> ScenarioDetailResponse:
    return scenarios.scenario_detail(scenarios.get_scenario_row(db, scenario_id))
