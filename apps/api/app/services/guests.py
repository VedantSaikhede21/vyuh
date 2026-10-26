"""Guest demo accounts (SPEC §20, §22; Phase 6E).

A guest is a short-lived user with the GUEST role: demo scenarios, its own runs,
and the demo units read-only. Guests are deleted `GUEST_TTL_HOURS` after creation
— lazily, on each new guest, at API startup and by `pnpm guests:cleanup` — since a
hosted API may sleep and miss any schedule.
"""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.core.errors import ApiError
from app.core.security import create_guest_token
from app.models import Scenario, TrainingSession, User
from app.schemas.generated import ErrorCode, TokenResponse, UserRole

GUEST_PREFIX = "guest:"


def cleanup_expired(db: Session, ttl_hours: int, now: datetime | None = None) -> int:
    """Delete guests older than the TTL with their sessions and the scenarios they
    generated (sessions first: a session's scenario is RESTRICT). Returns the count."""
    cutoff = (now or datetime.now(UTC)) - timedelta(hours=ttl_hours)
    expired = select(User.id).where(User.is_guest.is_(True), User.created_at < cutoff)
    ids = list(db.scalars(expired))
    if not ids:
        return 0
    db.execute(delete(TrainingSession).where(TrainingSession.user_id.in_(ids)))
    db.execute(delete(Scenario).where(Scenario.created_by.in_(ids)))
    db.execute(delete(User).where(User.id.in_(ids)))
    db.commit()
    return len(ids)


def create_guest(db: Session, settings: Settings) -> TokenResponse:
    """A new guest and its token; cleans up expired guests first. RATE_LIMITED when
    `GUEST_MAX_ACTIVE` guests are alive (the per-address limit is the router's)."""
    cleanup_expired(db, settings.guest_ttl_hours)
    active = db.scalar(select(func.count()).select_from(User).where(User.is_guest.is_(True)))
    if (active or 0) >= settings.guest_max_active:
        raise ApiError(ErrorCode.RATE_LIMITED, "The demo is busy. Try again in a few minutes.")
    key = uuid.uuid4()
    user = User(
        auth_id=f"{GUEST_PREFIX}{key}",
        name=f"Guest {key.hex[:4].upper()}",
        email=None,
        is_guest=True,
    )
    user.role = UserRole.GUEST
    db.add(user)
    db.commit()
    return TokenResponse(
        access_token=create_guest_token(user.auth_id, settings),
        token_type="bearer",  # noqa: S106 — OAuth token type, not a secret
        expires_in=settings.guest_ttl_hours * 3600,
    )
