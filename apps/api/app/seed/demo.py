"""Seed demo units, users, the threat library and scripted scenarios (SPEC §22). Idempotent.

Run: `pnpm seed` (or `uv run python -m app.seed.demo` in apps/api). In ENV=dev the API
also re-seeds at startup when the seed files changed (decision 119).

Users get `auth_id = local:<email>` so `POST /auth/dev-login` works in AUTH_MODE=local.
There are no passwords in our DB. In AUTH_MODE=supabase, create the demo users in the
Supabase dashboard instead; they are auto-provisioned on first login and roles are then
set here in the DB.
"""

import logging

from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import AuthMode, Settings, get_settings
from app.core.db import make_engine, make_session_factory
from app.core.security import local_auth_id
from app.models import Unit, User
from app.schemas.generated import UserRole
from app.seed.demo_history import seed_demo_history, seed_demo_record
from app.seed.e2e import E2E_UNIT, seed_e2e_user
from app.seed.fingerprint import seed_fingerprint, store_fingerprint, stored_fingerprint
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


def seed_units(db: Session, names: list[str] = UNITS) -> dict[str, Unit]:
    units: dict[str, Unit] = {}
    for name in names:
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


def seed_all(factory: sessionmaker[Session], settings: Settings) -> str:
    """Run every seed step and record the seed files' fingerprint; returns a summary."""
    fingerprint = seed_fingerprint()
    with factory() as db:
        units = seed_units(db)
        created = seed_users(db, units) if settings.auth_mode is AuthMode.LOCAL else 0
        threats = seed_threat_types(db)
        scenarios = seed_scenarios(db)
        db.commit()
        # Fixed sessions for visual baselines; scored through the real session path.
        e2e = (
            seed_e2e_user(db, seed_units(db, [E2E_UNIT])[E2E_UNIT])
            if settings.auth_mode is AuthMode.LOCAL
            else 0
        )
        # Demo history for trends and the unit dashboard (SPEC §22, decision 125).
        history = seed_demo_history(db) if settings.auth_mode is AuthMode.LOCAL else 0
        # Demo sign-offs and remark for the service record (SPEC §9.7, Phase 6C).
        signoffs = seed_demo_record(db) if settings.auth_mode is AuthMode.LOCAL else 0
        store_fingerprint(db, fingerprint)
        db.commit()
    return (
        f"Seeded {len(units)} units, {created} new demo users (auth mode: {settings.auth_mode}), "
        f"{threats} threat types, {scenarios} scenarios written, {e2e} e2e sessions rebuilt, "
        f"{history} demo sessions rebuilt, {signoffs} demo sign-offs"
    )


def seed_if_changed(factory: sessionmaker[Session], settings: Settings) -> str | None:
    """Re-seed when the seed files differ from what the DB last got; None if unchanged."""
    with factory() as db:
        if stored_fingerprint(db) == seed_fingerprint():
            return None
    return seed_all(factory, settings)


def run() -> None:
    settings = get_settings()
    print(seed_all(make_session_factory(make_engine(settings.database_url)), settings))


if __name__ == "__main__":
    run()
