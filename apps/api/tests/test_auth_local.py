from collections.abc import Callable
from datetime import UTC, datetime, timedelta

import jwt
from fastapi.testclient import TestClient

from app.core.config import AuthMode, Env, Settings
from app.core.security import LOCAL_TOKEN_TTL, create_local_token
from app.main import create_app
from app.models import Unit, User
from app.schemas.generated import MeResponse, TokenResponse, UserRole
from tests.conftest import assert_error, make_settings

ME = "/api/v1/auth/me"
DEV_LOGIN = "/api/v1/auth/dev-login"


def test_me_with_valid_token(
    client: TestClient,
    make_user: Callable[..., User],
    unit: Unit,
    auth_header: Callable[[User], dict[str, str]],
) -> None:
    user = make_user(UserRole.INSTRUCTOR, "inst@test", unit_id=unit.id)
    response = client.get(ME, headers=auth_header(user))
    assert response.status_code == 200, response.text
    me = MeResponse.model_validate(response.json())
    assert me.id == user.id
    assert me.role is UserRole.INSTRUCTOR
    assert me.unit is not None and me.unit.name == "Test Unit"
    assert me.rating == 1000
    assert response.json()["isGuest"] is False  # camelCase on the wire


def test_me_without_token(client: TestClient) -> None:
    response = client.get(ME)
    assert_error(response, 401, "UNAUTHORIZED")
    assert response.headers["WWW-Authenticate"] == "Bearer"


def test_me_with_expired_token(
    client: TestClient, settings: Settings, make_user: Callable[..., User]
) -> None:
    user = make_user()
    issued = datetime.now(UTC) - LOCAL_TOKEN_TTL - timedelta(minutes=1)
    token = create_local_token(user.auth_id, settings, now=issued)
    error = assert_error(
        client.get(ME, headers={"Authorization": f"Bearer {token}"}), 401, "UNAUTHORIZED"
    )
    assert error["message"] == "Token expired"


def test_me_with_bad_tokens(
    client: TestClient, settings: Settings, make_user: Callable[..., User]
) -> None:
    user = make_user()
    now = datetime.now(UTC)
    wrong_secret = jwt.encode(
        {"sub": user.auth_id, "iss": "vyuh-local", "aud": "vyuh", "exp": now + timedelta(hours=1)},
        "a-different-secret-that-is-also-long-enough",
        algorithm="HS256",
    )
    no_exp = jwt.encode(
        {"sub": user.auth_id, "iss": "vyuh-local", "aud": "vyuh"},
        settings.local_jwt_secret.get_secret_value(),
        algorithm="HS256",
    )
    for token in ["garbage", wrong_secret, no_exp]:
        assert_error(
            client.get(ME, headers={"Authorization": f"Bearer {token}"}), 401, "UNAUTHORIZED"
        )


def test_me_unknown_user(client: TestClient, settings: Settings) -> None:
    token = create_local_token("local:ghost@test", settings)
    assert_error(client.get(ME, headers={"Authorization": f"Bearer {token}"}), 401, "UNAUTHORIZED")


def test_dev_login_issues_working_token(client: TestClient, make_user: Callable[..., User]) -> None:
    make_user(UserRole.TRAINEE, "trainee1@demo")
    response = client.post(DEV_LOGIN, json={"email": "Trainee1@Demo "})
    assert response.status_code == 200, response.text
    token = TokenResponse.model_validate(response.json())
    assert token.token_type == "bearer"
    me = client.get(ME, headers={"Authorization": f"Bearer {token.access_token}"})
    assert me.status_code == 200
    assert me.json()["email"] == "trainee1@demo"


def test_dev_login_unknown_user(client: TestClient) -> None:
    assert_error(client.post(DEV_LOGIN, json={"email": "nobody@demo"}), 401, "UNAUTHORIZED")


def test_dev_login_disabled_in_prod() -> None:
    settings = make_settings(
        env=Env.PROD, auth_mode=AuthMode.SUPABASE, supabase_url="https://example.supabase.co"
    )
    app = create_app(settings)
    client = TestClient(app, raise_server_exceptions=False)
    assert_error(client.post(DEV_LOGIN, json={"email": "admin@demo"}), 404, "NOT_FOUND")
    app.state.engine.dispose()


def test_dev_login_enabled_offline(make_user: Callable[..., User]) -> None:
    make_user(UserRole.ADMIN, "admin@demo")
    app = create_app(make_settings(env=Env.OFFLINE))
    client = TestClient(app, raise_server_exceptions=False)
    assert client.post(DEV_LOGIN, json={"email": "admin@demo"}).status_code == 200
    app.state.engine.dispose()
