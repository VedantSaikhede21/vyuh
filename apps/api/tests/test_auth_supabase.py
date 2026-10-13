"""AUTH_MODE=supabase with a mocked JWKS endpoint (no network)."""

import json
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import AuthMode
from app.main import create_app
from app.models import User
from app.schemas.generated import UserRole
from tests.conftest import assert_error, make_settings

SUPABASE_URL = "https://demo-project.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
KID = "test-key-1"
ME = "/api/v1/auth/me"

_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)
_OTHER_KEY = rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jwks() -> dict[str, Any]:
    jwk = json.loads(jwt.algorithms.RSAAlgorithm.to_jwk(_KEY.public_key()))
    jwk.update({"kid": KID, "alg": "RS256", "use": "sig"})
    return {"keys": [jwk]}


def _token(key: rsa.RSAPrivateKey = _KEY, kid: str = KID, **claims: Any) -> str:
    now = datetime.now(UTC)
    payload = {
        "sub": "6f1c2a9e-0000-4000-8000-000000000001",
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + timedelta(hours=1),
        "email": "new.user@example.com",
        "user_metadata": {"full_name": "New User"},
        # A role claim must never be trusted for RBAC.
        "app_metadata": {"role": "ADMIN"},
    } | claims
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": kid})


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch, db: Session) -> Iterator[TestClient]:
    security.get_jwks_client.cache_clear()
    monkeypatch.setattr(jwt.PyJWKClient, "fetch_data", lambda self: _jwks())
    app = create_app(make_settings(auth_mode=AuthMode.SUPABASE, supabase_url=SUPABASE_URL))
    yield TestClient(app, raise_server_exceptions=False)
    app.state.engine.dispose()
    security.get_jwks_client.cache_clear()


def _get_me(client: TestClient, token: str) -> Any:
    return client.get(ME, headers={"Authorization": f"Bearer {token}"})


def test_valid_token_provisions_trainee(client: TestClient, db: Session) -> None:
    response = _get_me(client, _token())
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["role"] == "TRAINEE"
    assert body["name"] == "New User"
    assert body["email"] == "new.user@example.com"
    user = db.scalar(select(User).where(User.auth_id == "6f1c2a9e-0000-4000-8000-000000000001"))
    assert user is not None and user.role is UserRole.TRAINEE


def test_existing_user_keeps_db_role(client: TestClient, db: Session) -> None:
    user = User(auth_id="sb-instructor", name="Inst", email="i@example.com")
    user.role = UserRole.INSTRUCTOR
    db.add(user)
    db.commit()
    response = _get_me(client, _token(sub="sb-instructor"))
    assert response.status_code == 200
    assert response.json()["role"] == "INSTRUCTOR"


@pytest.mark.parametrize(
    "token_kwargs",
    [
        {"aud": "someone-else"},
        {"iss": "https://evil.example/auth/v1"},
        {"exp": datetime.now(UTC) - timedelta(minutes=5)},
        {"key": _OTHER_KEY},
        {"kid": "unknown-kid"},
    ],
    ids=["wrong-audience", "wrong-issuer", "expired", "wrong-key", "unknown-kid"],
)
def test_invalid_tokens_rejected(client: TestClient, token_kwargs: dict[str, Any]) -> None:
    assert_error(_get_me(client, _token(**token_kwargs)), 401, "UNAUTHORIZED")


def test_local_token_rejected_in_supabase_mode(client: TestClient) -> None:
    hs = jwt.encode(
        {"sub": "x", "exp": datetime.now(UTC) + timedelta(hours=1)},
        "y" * 40,
        algorithm="HS256",
    )
    assert_error(_get_me(client, hs), 401, "UNAUTHORIZED")
