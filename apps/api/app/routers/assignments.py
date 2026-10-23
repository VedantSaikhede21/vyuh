from fastapi import APIRouter, status

from app.core.auth import CurrentUser, DbDep, StaffUser
from app.schemas.generated import AssignmentListResponse, CreateAssignmentRequest
from app.services import assignments

router = APIRouter(prefix="/assignments", tags=["assignments"])


@router.post("", response_model=AssignmentListResponse, status_code=status.HTTP_201_CREATED)
def create_assignment(
    body: CreateAssignmentRequest, user: StaffUser, db: DbDep
) -> AssignmentListResponse:
    """Assign a scenario to a unit and/or named trainees (one row per target)."""
    return AssignmentListResponse(items=assignments.create_assignments(db, user, body))


@router.get("", response_model=AssignmentListResponse)
def list_assignments(user: StaffUser, db: DbDep) -> AssignmentListResponse:
    """The latest assignments made by anyone (instructor view)."""
    return AssignmentListResponse(items=assignments.all_assignments(db))


@router.get("/mine", response_model=AssignmentListResponse)
def my_assignments(user: CurrentUser, db: DbDep) -> AssignmentListResponse:
    """Assignments that reach the caller (theirs and their unit's), with completion."""
    return AssignmentListResponse(items=assignments.my_assignments(db, user))
