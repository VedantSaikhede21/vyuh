"""Seed demo units, users, the threat library and scripted scenarios (SPEC §22). Idempotent.

Run: `uv run python -m app.seed.demo`

Users get `auth_id = local:<email>` so `POST /auth/dev-login` works in AUTH_MODE=local.
There are no passwords in our DB. In AUTH_MODE=supabase, create the demo users in the
Supabase dashboard instead; they are auto-provisioned on first login and roles are then
set here in the DB.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import AuthMode, get_settings
from app.core.db import make_engine, make_session_factory
from app.core.security import local_auth_id
from app.models import Unit, User
from app.schemas.generated import UserRole
from app.seed.scenarios import seed_scenarios
from app.seed.threats import seed_threat_types

logger = logging.getLogger(__name__)

UNITS = ["Demo Unit Alpha", "Demo Unit Bravo"]

# (email, display name, role, unit)
DEMO_USERS: list[tuple[str, str, UserRole, str]] = [
    ("admin@demo", "Demo Admin", UserRole.ADMIN, "Demo Unit Alpha"),
    ("instructor@demo", "Demo Instructor", UserRole.INSTRUCTOR, "Demo Unit Alpha"),
    *[
        (f"trainee{i}@demo", f"Demo Trainee {i}", UserRole.TRAINEE, UNITS[0 if i <= 3 else 1])
        for i in range(1, 7)
    ],
]


def seed_units(db: Session) -> dict[str, Unit]:
    units: dict[str, Unit] = {}
    for name in UNITS:
        unit = db.scalar(select(Unit).where(Unit.name == name))
        if unit is None:
            unit = Unit(name=name)
            db.add(unit)
        units[name] = unit
    db.flush()
    return units


def seed_users(db: Session, units: dict[str, Unit]) -> int:
    count = 0
    for email, name, role, unit_name in DEMO_USERS:
        auth_id = local_auth_id(email)
        user = db.scalar(select(User).where(User.auth_id == auth_id))
        if user is None:
            user = User(auth_id=auth_id)
            db.add(user)
            count += 1
        user.name, user.email, user.role = name, email, role
        user.unit_id = units[unit_name].id
    return count


def run() -> None:
    settings = get_settings()
    factory = make_session_factory(make_engine(settings.database_url))
    with factory() as db:
        units = seed_units(db)
        created = seed_users(db, units) if settings.auth_mode is AuthMode.LOCAL else 0
        threats = seed_threat_types(db)
        scenarios = seed_scenarios(db)
        db.commit()
    print(
        f"Seeded {len(units)} units, {created} new demo users (auth mode: {settings.auth_mode}), "
        f"{threats} threat types, {scenarios} scenarios written"
    )


if __name__ == "__main__":
    run()
