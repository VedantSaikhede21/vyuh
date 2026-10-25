from fastapi import APIRouter, status

from app.core.auth import CurrentUser, DbDep
from app.schemas.generated import NoticeCountResponse, NoticeListResponse
from app.services import notices

router = APIRouter(prefix="/notices", tags=["notices"])


@router.get("", response_model=NoticeListResponse)
def list_notices(user: CurrentUser, db: DbDep) -> NoticeListResponse:
    """Assignments, remarks, sign-offs and library updates, newest first."""
    return notices.list_notices(db, user)


@router.get("/count", response_model=NoticeCountResponse)
def count(user: CurrentUser, db: DbDep) -> NoticeCountResponse:
    return NoticeCountResponse(unread_count=notices.unread_count(db, user))


@router.post("/seen", status_code=status.HTTP_204_NO_CONTENT)
def mark_seen(user: CurrentUser, db: DbDep) -> None:
    """Everything up to now counts as read."""
    notices.mark_seen(db, user)
