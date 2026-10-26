from fastapi import APIRouter, Request
from sqlalchemy import select

from app.core.auth import CurrentUser, DbDep, SettingsDep
from app.core.errors import ApiError
from app.core.security import LOCAL_TOKEN_TTL, create_local_token, local_auth_id
from app.models import User
from app.schemas.generated import (
    DevLoginRequest,
    ErrorCode,
    MeResponse,
    TokenResponse,
    UnitRef,
)
from app.services import guests

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=MeResponse)
def me(user: CurrentUser) -> MeResponse:
    unit = UnitRef(id=user.unit.id, name=user.unit.name) if user.unit else None
    return MeResponse(
        id=user.id,
        name=user.name,
        email=user.email,
        role=user.role,
        unit=unit,
        rating=user.rating,
        is_guest=user.is_guest,
    )


@router.post("/dev-login", response_model=TokenResponse)
def dev_login(body: DevLoginRequest, settings: SettingsDep, db: DbDep) -> TokenResponse:
    """Dev-only: issue a local token for a seeded user. Disabled when ENV=prod."""
    if not settings.dev_login_enabled:
        raise ApiError(ErrorCode.NOT_FOUND, "Not found")
    auth_id = local_auth_id(body.email)
    user = db.scalar(select(User).where(User.auth_id == auth_id))
    if user is None:
        raise ApiError(ErrorCode.UNAUTHORIZED, "Unknown demo user")
    return TokenResponse(
        access_token=create_local_token(user.auth_id, settings),
        token_type="bearer",  # noqa: S106 — OAuth token type, not a secret
        expires_in=int(LOCAL_TOKEN_TTL.total_seconds()),
    )


@router.post("/guest", response_model=TokenResponse)
def guest(request: Request, settings: SettingsDep, db: DbDep) -> TokenResponse:
    """A short-lived guest account for the public demo (SPEC §11, §20). Not found unless
    GUEST_MODE_ENABLED; limited per client address and in guests alive at once."""
    if not settings.guest_mode_enabled:
        raise ApiError(ErrorCode.NOT_FOUND, "Not found")
    address = request.client.host if request.client else "unknown"
    request.app.state.guest_limiter.check(address)
    return guests.create_guest(db, settings)
