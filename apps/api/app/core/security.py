"""JWT issue/verify for both auth modes (CLAUDE.md §11, docs/decisions.md)."""

from datetime import UTC, datetime, timedelta
from functools import lru_cache
from typing import Any

import jwt

from app.core.config import AuthMode, Settings
from app.core.errors import ApiError
from app.schemas.generated import ErrorCode

LOCAL_ISSUER = "vyuh-local"
LOCAL_AUDIENCE = "vyuh"
LOCAL_TOKEN_TTL = timedelta(hours=8)
SUPABASE_ALGORITHMS = ["RS256", "ES256"]


def local_auth_id(email: str) -> str:
    return f"local:{email.strip().lower()}"


def create_local_token(auth_id: str, settings: Settings, now: datetime | None = None) -> str:
    issued = now or datetime.now(UTC)
    claims = {
        "sub": auth_id,
        "iss": LOCAL_ISSUER,
        "aud": LOCAL_AUDIENCE,
        "iat": issued,
        "exp": issued + LOCAL_TOKEN_TTL,
    }
    return jwt.encode(claims, settings.local_jwt_secret.get_secret_value(), algorithm="HS256")


@lru_cache(maxsize=4)
def get_jwks_client(jwks_url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(jwks_url, cache_keys=True, lifespan=600, timeout=5)


def _unauthorized(message: str) -> ApiError:
    return ApiError(ErrorCode.UNAUTHORIZED, message)


def decode_token(token: str, settings: Settings) -> dict[str, Any]:
    """Verify a bearer token and return its claims, or raise UNAUTHORIZED."""
    options = {"require": ["exp", "sub"]}
    try:
        if settings.auth_mode is AuthMode.LOCAL:
            return jwt.decode(
                token,
                settings.local_jwt_secret.get_secret_value(),
                algorithms=["HS256"],
                audience=LOCAL_AUDIENCE,
                issuer=LOCAL_ISSUER,
                options=options,
            )
        signing_key = get_jwks_client(settings.supabase_jwks_url).get_signing_key_from_jwt(token)
        return jwt.decode(
            token,
            signing_key.key,
            algorithms=SUPABASE_ALGORITHMS,
            audience=settings.supabase_jwt_audience,
            issuer=settings.supabase_issuer,
            options=options,
        )
    except jwt.ExpiredSignatureError as exc:
        raise _unauthorized("Token expired") from exc
    except jwt.PyJWKClientError as exc:
        raise _unauthorized("Token signing key not found") from exc
    except jwt.InvalidTokenError as exc:
        raise _unauthorized("Invalid token") from exc
