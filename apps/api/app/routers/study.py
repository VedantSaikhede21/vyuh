from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.core.auth import DbDep, require_role
from app.models import User
from app.schemas.generated import StudyResultsResponse, UserRole
from app.services import study

router = APIRouter(prefix="/study", tags=["study"])

Admin = Annotated[User, Depends(require_role(UserRole.ADMIN))]


@router.get("/results", response_model=StudyResultsResponse)
def results(db: DbDep, _: Admin) -> StudyResultsResponse:
    return study.study_results(db)


@router.get("/results.csv")
def results_csv(db: DbDep, _: Admin) -> Response:
    """Anonymised export: participant codes only."""
    return Response(
        study.results_csv(study.study_results(db)),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="vyuh-user-study.csv"'},
    )
