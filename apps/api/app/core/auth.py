"""Auth dependencies: token → users row, and role checks (RBAC)."""

from collections.abc import Callable
from typing import Annotated, Any

from fastapi import Depends, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import AuthMode, Settings
from app.core.db import get_db
from app.core.errors import ApiError
from app.core.security import decode_token
from app.models import User
from app.schemas.generated import ErrorCode, UserRole

_bearer = HTTPBearer(auto_error=False)


def get_app_settings(request: Request) -> Settings:
    return request.app.state.settings


SettingsDep = Annotated[Settings, Depends(get_app_settings)]
DbDep = Annotated[Session, Depends(get_db)]


def _display_name(claims: dict[str, Any], email: str | None) -> str:
    metadata = claims.get("user_metadata")
    if isinstance(metadata, dict):
        for key in ("full_name", "name"):
            value = metadata.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()[:120]
    return (email.split("@")[0] if email else "Trainee")[:120]


def _provision_supabase_user(db: Session, auth_id: str, claims: dict[str, Any]) -> User:
    """First request from a new Supabase user: create a TRAINEE with no unit.

    The role is never taken from token claims (docs/decisions.md).
    """
    email = claims.get("email") if isinstance(claims.get("email"), str) else None
    user = User(auth_id=auth_id, name=_display_name(claims, email), email=email)
    user.role = UserRole.TRAINEE
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def get_current_user(
    settings: SettingsDep,
    db: DbDep,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> User:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise ApiError(ErrorCode.UNAUTHORIZED, "Missing bearer token")
    claims = decode_token(credentials.credentials, settings)
    auth_id = str(claims["sub"])
    user = db.scalar(select(User).where(User.auth_id == auth_id))
    if user is None:
        if settings.auth_mode is AuthMode.SUPABASE:
            return _provision_supabase_user(db, auth_id, claims)
        raise ApiError(ErrorCode.UNAUTHORIZED, "Unknown user")
    return user


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_role(*roles: UserRole) -> Callable[[User], User]:
    """Dependency factory: allow only users whose role is one of `roles`.

    Roles are explicit (no implicit hierarchy): list every role a route allows,
    e.g. `require_role(UserRole.INSTRUCTOR, UserRole.ADMIN)`.
    """
    if not roles:
        raise ValueError("require_role needs at least one role")
    allowed = frozenset(roles)

    def check(user: CurrentUser) -> User:
        if user.role not in allowed:
            raise ApiError(
                ErrorCode.FORBIDDEN,
                "Insufficient role",
                {"required": sorted(r.value for r in allowed)},
            )
        return user

    return check


#: Instructor or admin (Phase 4b staff routes).
StaffUser = Annotated[User, Depends(require_role(UserRole.INSTRUCTOR, UserRole.ADMIN))]
