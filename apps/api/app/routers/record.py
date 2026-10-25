import uuid

from fastapi import APIRouter

from app.core.auth import CurrentUser, DbDep, StaffUser
from app.schemas.generated import ServiceRecordResponse, SignoffRequest
from app.services import record

router = APIRouter(prefix="/record", tags=["record"])


@router.get("/{user_id}", response_model=ServiceRecordResponse)
def get_record(user_id: uuid.UUID, user: CurrentUser, db: DbDep) -> ServiceRecordResponse:
    """Representative training levels and endorsements (SPEC §9.7): self or staff."""
    return record.get_record(db, user, user_id)


@router.post("/{user_id}/signoffs", response_model=ServiceRecordResponse, status_code=201)
def sign_off(
    user_id: uuid.UUID, body: SignoffRequest, user: StaffUser, db: DbDep
) -> ServiceRecordResponse:
    """Sign off a level whose criteria are met; never one's own record."""
    return record.sign_off(db, user, user_id, body.level)
