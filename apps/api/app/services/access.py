"""Who may see whose data (SPEC §11; decisions 160, 161).

Trainees see themselves, instructors their own unit, admins everything, and
guests the demo units read-only. Every read or write of another user's or a
unit's data goes through these checks, so the rule lives in one place.
"""

from sqlalchemy import ColumnElement, false, select, true

from app.core.errors import ApiError
from app.models import Unit, User
from app.schemas.generated import ErrorCode, UserRole


def can_view_unit(viewer: User, unit: Unit | None) -> bool:
    if unit is None:
        return viewer.role is UserRole.ADMIN
    if viewer.role is UserRole.ADMIN:
        return True
    if viewer.role is UserRole.INSTRUCTOR:
        return viewer.unit_id == unit.id
    if viewer.role is UserRole.GUEST:
        return unit.is_demo
    return False


def can_view_user(viewer: User, subject: User) -> bool:
    """Self, an admin, an instructor of the subject's unit, or a guest for demo units."""
    return viewer.id == subject.id or can_view_unit(viewer, subject.unit)


def require_unit(viewer: User, unit: Unit) -> None:
    if not can_view_unit(viewer, unit):
        raise ApiError(ErrorCode.FORBIDDEN, "Outside your unit")


def require_user(viewer: User, subject: User) -> None:
    if not can_view_user(viewer, subject):
        raise ApiError(ErrorCode.FORBIDDEN, "Outside your unit")


def unit_filter(viewer: User) -> ColumnElement[bool]:
    """WHERE clause on `Unit` for the units a viewer may list."""
    if viewer.role is UserRole.ADMIN:
        return true()
    if viewer.role is UserRole.GUEST:
        return Unit.is_demo.is_(True)
    # `== None` would become IS NULL and match unit-less rows.
    return false() if viewer.unit_id is None else Unit.id == viewer.unit_id


def member_filter(viewer: User) -> ColumnElement[bool]:
    """WHERE clause on `User` for the people whose data a viewer may list."""
    if viewer.role is UserRole.ADMIN:
        return true()
    if viewer.role is UserRole.GUEST:
        return User.unit_id.in_(select(Unit.id).where(Unit.is_demo.is_(True)))
    return false() if viewer.unit_id is None else User.unit_id == viewer.unit_id
