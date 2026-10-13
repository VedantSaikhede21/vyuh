from collections.abc import Callable
from typing import Annotated

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.auth import require_role
from app.models import User
from app.schemas.generated import UserRole
from tests.conftest import assert_error

PATH = "/api/v1/_test/instructor-only"


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    instructor_or_admin = require_role(UserRole.INSTRUCTOR, UserRole.ADMIN)

    @app.get(PATH)
    def instructor_only(user: Annotated[User, Depends(instructor_or_admin)]) -> dict[str, str]:
        return {"role": user.role.value}

    return TestClient(app, raise_server_exceptions=False)


@pytest.mark.parametrize("role", [UserRole.INSTRUCTOR, UserRole.ADMIN])
def test_allowed_roles(
    client: TestClient,
    make_user: Callable[..., User],
    auth_header: Callable[[User], dict[str, str]],
    role: UserRole,
) -> None:
    user = make_user(role, f"{role.value.lower()}@test")
    response = client.get(PATH, headers=auth_header(user))
    assert response.status_code == 200
    assert response.json() == {"role": role.value}


def test_denied_role(
    client: TestClient,
    make_user: Callable[..., User],
    auth_header: Callable[[User], dict[str, str]],
) -> None:
    user = make_user(UserRole.TRAINEE)
    error = assert_error(client.get(PATH, headers=auth_header(user)), 403, "FORBIDDEN")
    assert error["details"]["required"] == ["ADMIN", "INSTRUCTOR"]


def test_unauthenticated_is_401_not_403(client: TestClient) -> None:
    assert_error(client.get(PATH), 401, "UNAUTHORIZED")


def test_require_role_needs_roles() -> None:
    with pytest.raises(ValueError, match="at least one role"):
        require_role()
