import uuid

from fastapi import APIRouter
from sqlalchemy import select

from app.core.auth import DbDep, StaffUser
from app.models import Unit, User
from app.schemas.generated import ReadinessResponse, UnitListResponse, UnitMember, UnitSummary
from app.services import portal

router = APIRouter(prefix="/units", tags=["units"])


@router.get("", response_model=UnitListResponse)
def list_units(user: StaffUser, db: DbDep) -> UnitListResponse:
    """Units with their members, for the unit selector and the assignment form."""
    items = []
    for unit in db.scalars(select(Unit).order_by(Unit.name)):
        members = db.scalars(
            select(User)
            .where(User.unit_id == unit.id, User.is_guest.is_(False))
            .order_by(User.name)
        )
        items.append(
            UnitSummary(
                id=unit.id,
                name=unit.name,
                members=[UnitMember(id=m.id, name=m.name, role=m.role) for m in members],
            )
        )
    return UnitListResponse(items=items)


@router.get("/{unit_id}/readiness", response_model=ReadinessResponse)
def readiness(unit_id: uuid.UUID, user: StaffUser, db: DbDep) -> ReadinessResponse:
    """One row per trainee: level, sign-off waiting, last assessment, weakest stage, overdue."""
    return portal.readiness(db, unit_id)
