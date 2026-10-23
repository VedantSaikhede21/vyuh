from fastapi import APIRouter
from sqlalchemy import select

from app.core.auth import DbDep, StaffUser
from app.models import Unit, User
from app.schemas.generated import UnitListResponse, UnitMember, UnitSummary

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
