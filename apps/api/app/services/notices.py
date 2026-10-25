"""Notices (Phase 6C): assignments, instructor remarks, level sign-offs and threat-library
updates, derived from their source rows. Unread = created after `users.notices_seen_at`."""

import json
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import LevelSignoff, SessionRemark, TrainingSession, User
from app.models import Scenario as ScenarioRow
from app.schemas.generated import Notice, NoticeKind, NoticeListResponse
from app.services.assignments import assignments_of, item
from app.services.record import rules
from app.services.scenarios import scenario_code

PROFILES_FILE = Path(__file__).resolve().parents[1] / "seed" / "generated" / "class_profiles.json"
LIMIT = 50


@lru_cache(maxsize=1)
def library_updates() -> list[dict[str, Any]]:
    """Generated from LIBRARY_UPDATES in packages/shared."""
    updates: list[dict[str, Any]] = json.loads(PROFILES_FILE.read_text("utf-8"))["libraryUpdates"]
    return updates


def _label(code: str | None, name: str) -> str:
    return f"{code} {name}" if code else name


def _notices(db: Session, user: User) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for a in assignments_of(db, user):
        it = item(db, a, user.id)
        due = f"Due {it.due_at:%Y-%m-%d}" if it.due_at else "No due date"
        out.append(
            {
                "id": f"assignment:{a.id}",
                "kind": NoticeKind.ASSIGNMENT,
                "title": f"Assigned: {_label(it.scenario_code, it.scenario_name)}",
                "body": "Completed" if it.completed else due,
                "href": f"/train/scenario/{a.scenario_id}",
                "created_at": a.created_at,
            }
        )
    remarks = db.execute(
        select(SessionRemark, TrainingSession.id, ScenarioRow, User.name)
        .join(TrainingSession, TrainingSession.id == SessionRemark.session_id)
        .join(ScenarioRow, ScenarioRow.id == TrainingSession.scenario_id)
        .outerjoin(User, User.id == SessionRemark.author_id)
        .where(TrainingSession.user_id == user.id)
    )
    for remark, session_id, scenario, author in remarks:
        out.append(
            {
                "id": f"remark:{remark.id}",
                "kind": NoticeKind.REMARK,
                "title": f"Remark from {author or 'an instructor'} on "
                f"{_label(scenario_code(scenario), scenario.name)}",
                "body": remark.body,
                "href": f"/aar/session/{session_id}?tab=remarks",
                "created_at": remark.created_at,
            }
        )
    names = {r["level"]: r["name"] for r in rules()["levels"]}
    signoffs = db.execute(
        select(LevelSignoff, User.name)
        .outerjoin(User, User.id == LevelSignoff.signed_by)
        .where(LevelSignoff.user_id == user.id)
    )
    for s, signer in signoffs:
        level = getattr(s.level, "value", s.level)
        out.append(
            {
                "id": f"signoff:{s.id}",
                "kind": NoticeKind.SIGNOFF,
                "title": f"Signed off: {names[level]}",
                "body": f"By {signer or 'a former instructor'}",
                "href": "/record",
                "created_at": s.created_at,
            }
        )
    for u in library_updates():
        out.append(
            {
                "id": f"library:{u['id']}",
                "kind": NoticeKind.LIBRARY,
                "title": u["text"],
                "body": None,
                "href": "/library",
                "created_at": datetime.fromisoformat(u["date"]).replace(tzinfo=UTC),
            }
        )
    out.sort(key=lambda n: (n["created_at"], n["id"]), reverse=True)
    return out


def _unread(n: dict[str, Any], seen: datetime | None) -> bool:
    return seen is None or n["created_at"] > seen


def list_notices(db: Session, user: User, limit: int = LIMIT) -> NoticeListResponse:
    items = _notices(db, user)
    seen = user.notices_seen_at
    return NoticeListResponse(
        items=[Notice(**n, unread=_unread(n, seen)) for n in items[:limit]],
        unread_count=sum(1 for n in items if _unread(n, seen)),
    )


def unread_count(db: Session, user: User) -> int:
    seen = user.notices_seen_at
    return sum(1 for n in _notices(db, user) if _unread(n, seen))


def mark_seen(db: Session, user: User) -> None:
    user.notices_seen_at = db.scalar(select(func.now()))
    db.commit()
