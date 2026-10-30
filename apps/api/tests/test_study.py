"""User study kit (Part 6I): codes only, admin only, demo data never counts."""

from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models import Assignment, Unit, User
from app.models import Scenario as ScenarioRow
from app.schemas.generated import UserRole
from app.services.study import STUDY_UNIT, enrol, results_csv, study_results
from tests.conftest import assert_error

Headers = Callable[[User], dict[str, str]]


def test_enrol_makes_coded_accounts_and_is_repeatable(
    db: Session, scenarios: dict[str, ScenarioRow]
) -> None:
    assert enrol(db, 2) == ["P001", "P002"]
    assert enrol(db, 3) == ["P001", "P002", "P003"]
    unit = db.query(Unit).filter_by(name=STUDY_UNIT).one()
    users = db.query(User).filter_by(unit_id=unit.id).all()
    assert sorted(u.name for u in users) == ["P001", "P002", "P003"]
    assert all(u.email and u.email.endswith("@study") for u in users)
    wanted = {"S01", "S15", "S04"} & set(scenarios)
    assert db.query(Assignment).filter_by(unit_id=unit.id).count() == len(wanted)


def test_empty_study_is_a_worded_zero(db: Session) -> None:
    assert study_results(db).participants == 0
    assert results_csv(study_results(db)).startswith("participant,run,scenario,total")


def test_results_are_admin_only(
    client: TestClient, make_user: Callable[..., User], auth_header: Headers
) -> None:
    trainee = auth_header(make_user())
    admin = auth_header(make_user(UserRole.ADMIN, email="admin@test"))
    assert_error(client.get("/api/v1/study/results", headers=trainee), 403, "FORBIDDEN")
    assert client.get("/api/v1/study/results", headers=admin).status_code == 200
    res = client.get("/api/v1/study/results.csv", headers=admin)
    assert res.status_code == 200
    assert res.headers["content-type"].startswith("text/csv")
    assert "@" not in res.text
