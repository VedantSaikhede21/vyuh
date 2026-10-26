"""Instructors see their own unit only; admins see every unit (Phase 6E, closes decision 123)."""

from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Scenario, Unit, User
from app.schemas.generated import UserRole
from tests.conftest import assert_error

Headers = Callable[[User], dict[str, str]]


@pytest.fixture
def org(db: Session, make_user: Callable[..., User]) -> dict[str, Any]:
    """Two units, each with an instructor and a trainee, and one admin in neither."""
    a, b = Unit(name="Alpha"), Unit(name="Bravo")
    db.add_all([a, b])
    db.commit()
    return {
        "a": a,
        "b": b,
        "inst_a": make_user(UserRole.INSTRUCTOR, "ia@test", unit_id=a.id),
        "inst_b": make_user(UserRole.INSTRUCTOR, "ib@test", unit_id=b.id),
        "t_a": make_user(UserRole.TRAINEE, "ta@test", unit_id=a.id),
        "t_b": make_user(UserRole.TRAINEE, "tb@test", unit_id=b.id),
        "admin": make_user(UserRole.ADMIN, "admin@test"),
        "loose": make_user(UserRole.INSTRUCTOR, "nounit@test"),
    }


def test_unit_pages_are_own_unit_only(
    client: TestClient, auth_header: Headers, org: dict[str, Any]
) -> None:
    a, b = org["a"].id, org["b"].id
    for path in ("/api/v1/aar/units/{}", "/api/v1/units/{}/readiness"):
        ia = auth_header(org["inst_a"])
        assert client.get(path.format(a), headers=ia).status_code == 200
        assert_error(client.get(path.format(b), headers=ia), 403, "FORBIDDEN")
        assert_error(
            client.get(path.format(a), headers=auth_header(org["loose"])), 403, "FORBIDDEN"
        )
        for unit in (a, b):
            assert (
                client.get(path.format(unit), headers=auth_header(org["admin"])).status_code == 200
            )

    def names(u: User) -> list[str]:
        items = client.get("/api/v1/units", headers=auth_header(u)).json()["items"]
        return [x["name"] for x in items]

    assert names(org["inst_a"]) == ["Alpha"]
    assert names(org["loose"]) == []
    assert set(names(org["admin"])) >= {"Alpha", "Bravo"}


def test_people_are_own_unit_only(
    client: TestClient, auth_header: Headers, org: dict[str, Any]
) -> None:
    ia = auth_header(org["inst_a"])
    for path in ("/api/v1/aar/users/{}/trends", "/api/v1/record/{}"):
        assert client.get(path.format(org["t_a"].id), headers=ia).status_code == 200
        assert_error(client.get(path.format(org["t_b"].id), headers=ia), 403, "FORBIDDEN")
        admin = auth_header(org["admin"])
        assert client.get(path.format(org["t_b"].id), headers=admin).status_code == 200


def test_assignments_are_own_unit_only(
    client: TestClient,
    auth_header: Headers,
    org: dict[str, Any],
    scenarios: dict[str, Scenario],
) -> None:
    ia, ib = auth_header(org["inst_a"]), auth_header(org["inst_b"])
    sid = str(scenarios["S15"].id)
    to_b = {"scenarioId": sid, "unitId": str(org["b"].id)}
    assert_error(client.post("/api/v1/assignments", json=to_b, headers=ia), 403, "FORBIDDEN")
    to_tb = {"scenarioId": sid, "userIds": [str(org["t_b"].id)]}
    assert_error(client.post("/api/v1/assignments", json=to_tb, headers=ia), 403, "FORBIDDEN")
    assert client.post("/api/v1/assignments", json=to_b, headers=ib).status_code == 201

    def listed(h: dict[str, str]) -> list[Any]:
        return client.get("/api/v1/assignments", headers=h).json()["items"]

    assert listed(ia) == []
    assert len(listed(ib)) == 1
    assert len(listed(auth_header(org["admin"]))) == 1


def test_live_sessions_are_own_unit_only(
    client: TestClient, auth_header: Headers, org: dict[str, Any]
) -> None:
    ia = auth_header(org["inst_a"])
    assert client.get("/api/v1/sessions/active", headers=ia).status_code == 200
    assert_error(
        client.get(f"/api/v1/sessions/active?unit={org['b'].id}", headers=ia), 403, "FORBIDDEN"
    )
    admin = auth_header(org["admin"])
    assert (
        client.get(f"/api/v1/sessions/active?unit={org['b'].id}", headers=admin).status_code == 200
    )
