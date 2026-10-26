"""Who may see whose data (SPEC §11; decision 123 closed in Phase 6E).

Trainees see themselves, instructors their own unit, admins everything. Every
read or write of another user's or a unit's data goes through these checks, so
the rule lives in one place.
"""

import uuid

from sqlalchemy import ColumnElement, false, true

from app.core.errors import ApiError
from app.models import Unit, User
from app.schemas.generated import ErrorCode, UserRole


def can_view_unit(viewer: User, unit_id: uuid.UUID | None) -> bool:
    if viewer.role is UserRole.ADMIN:
        return True
    if viewer.role is UserRole.INSTRUCTOR:
        return unit_id is not None and viewer.unit_id == unit_id
    return False


def can_view_user(viewer: User, subject: User) -> bool:
    """Self, an admin, or an instructor of the subject's unit."""
    return viewer.id == subject.id or can_view_unit(viewer, subject.unit_id)


def require_unit(viewer: User, unit_id: uuid.UUID | None) -> None:
    if not can_view_unit(viewer, unit_id):
        raise ApiError(ErrorCode.FORBIDDEN, "Outside your unit")


def require_user(viewer: User, subject: User) -> None:
    if not can_view_user(viewer, subject):
        raise ApiError(ErrorCode.FORBIDDEN, "Outside your unit")


def unit_filter(viewer: User) -> ColumnElement[bool]:
    """WHERE clause on `Unit` for the units a viewer may list."""
    if viewer.role is UserRole.ADMIN:
        return true()
    # `== None` would become IS NULL and match unit-less rows.
    return false() if viewer.unit_id is None else Unit.id == viewer.unit_id


def member_filter(viewer: User) -> ColumnElement[bool]:
    """WHERE clause on `User` for the people whose data a viewer may list."""
    if viewer.role is UserRole.ADMIN:
        return true()
    return false() if viewer.unit_id is None else User.unit_id == viewer.unit_id
