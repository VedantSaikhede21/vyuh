"""Assignments (SPEC §11: POST /assignments, GET /assignments/mine; decision 120).

An assignment targets a whole unit or one trainee. It counts as completed for a
trainee once they finish an Assessment session of the scenario that started after
the assignment was made (Practice allows pause and hints, so it is not graded).
"""

import uuid
from collections.abc import Iterable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Assignment, TrainingSession, Unit, User
from app.models import Scenario as ScenarioRow
from app.schemas.generated import (
    AssignmentItem,
    CreateAssignmentRequest,
    ErrorCode,
    SessionMode,
    SessionStatus,
    UserRole,
)
from app.services.access import member_filter, require_unit, require_user, unit_filter
from app.services.scenarios import get_scenario_row, scenario_code


def completed_session(db: Session, a: Assignment, user_id: uuid.UUID) -> uuid.UUID | None:
    """The first Assessment session of the scenario `user_id` completed since `a` was made."""
    return db.scalar(
        select(TrainingSession.id)
        .where(
            TrainingSession.user_id == user_id,
            TrainingSession.scenario_id == a.scenario_id,
            TrainingSession.mode == SessionMode.ASSESSMENT,
            TrainingSession.status == SessionStatus.COMPLETED,
            TrainingSession.started_at >= a.created_at,
        )
        .order_by(TrainingSession.started_at)
        .limit(1)
    )


def item(db: Session, a: Assignment, for_user: uuid.UUID | None = None) -> AssignmentItem:
    scenario = db.get_one(ScenarioRow, a.scenario_id)
    unit = db.get(Unit, a.unit_id) if a.unit_id else None
    target = db.get(User, a.user_id) if a.user_id else None
    by = db.get(User, a.assigned_by) if a.assigned_by else None
    done = completed_session(db, a, for_user) if for_user is not None else None
    return AssignmentItem(
        id=a.id,
        scenario_id=a.scenario_id,
        scenario_code=scenario_code(scenario),
        scenario_name=scenario.name,
        unit_id=a.unit_id,
        unit_name=unit.name if unit else None,
        user_id=a.user_id,
        user_name=target.name if target else None,
        assigned_by_name=by.name if by else None,
        due_at=a.due_at,
        created_at=a.created_at,
        completed=done is not None,
        completed_session_id=done,
    )


def create_assignments(
    db: Session, user: User, body: CreateAssignmentRequest
) -> list[AssignmentItem]:
    """One row for the unit (if given) and one per named trainee."""
    if not body.unit_id and not body.user_ids:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Choose a unit or at least one trainee")
    scenario = get_scenario_row(db, body.scenario_id, user)
    rows: list[Assignment] = []
    if body.unit_id:
        if db.get(Unit, body.unit_id) is None:
            raise ApiError(ErrorCode.NOT_FOUND, "Unit not found")
        require_unit(user, body.unit_id)
        rows.append(Assignment(scenario_id=scenario.id, unit_id=body.unit_id))
    for uid in dict.fromkeys(body.user_ids or []):
        target = db.get(User, uid)
        if target is None or target.role is not UserRole.TRAINEE:
            raise ApiError(ErrorCode.NOT_FOUND, "Trainee not found", {"userId": str(uid)})
        require_user(user, target)
        rows.append(Assignment(scenario_id=scenario.id, user_id=uid))
    for r in rows:
        r.assigned_by = user.id
        r.due_at = body.due_at
    db.add_all(rows)
    db.commit()
    return [item(db, r) for r in rows]


def assignments_of(db: Session, user: User) -> list[Assignment]:
    """Assignments that reach `user`: their own and their unit's, soonest due first."""
    targets = [Assignment.user_id == user.id]
    if user.unit_id is not None:
        targets.append(Assignment.unit_id == user.unit_id)
    return list(
        db.scalars(
            select(Assignment)
            .where(or_(*targets))
            .order_by(Assignment.due_at.asc().nulls_last(), Assignment.created_at)
        )
    )


def my_assignments(db: Session, user: User) -> list[AssignmentItem]:
    return [item(db, a, user.id) for a in assignments_of(db, user)]


def unit_assignments(db: Session, unit_id: uuid.UUID) -> list[Assignment]:
    """Assignments to the unit or to any of its members, newest first."""
    members = select(User.id).where(User.unit_id == unit_id)
    return list(
        db.scalars(
            select(Assignment)
            .where(or_(Assignment.unit_id == unit_id, Assignment.user_id.in_(members)))
            .order_by(Assignment.created_at.desc())
        )
    )


def all_assignments(db: Session, viewer: User) -> list[AssignmentItem]:
    """The newest 100 assignments to the viewer's unit or its members (all for admins)."""
    members = select(User.id).where(member_filter(viewer))
    units = select(Unit.id).where(unit_filter(viewer))
    rows: Iterable[Assignment] = db.scalars(
        select(Assignment)
        .where(or_(Assignment.unit_id.in_(units), Assignment.user_id.in_(members)))
        .order_by(Assignment.created_at.desc())
        .limit(100)
    )
    return [item(db, a) for a in rows]
