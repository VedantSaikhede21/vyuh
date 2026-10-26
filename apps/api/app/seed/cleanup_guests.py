"""Delete guest demo accounts older than GUEST_TTL_HOURS, with their data (Phase 6E).

The API also does this at startup and on each new guest; this command is for a host
that wants a scheduled sweep. Usage: `pnpm guests:cleanup`.
"""

from app.core.config import get_settings
from app.core.db import make_engine, make_session_factory
from app.services.guests import cleanup_expired


def run() -> None:
    settings = get_settings()
    factory = make_session_factory(make_engine(settings.database_url))
    with factory() as db:
        n = cleanup_expired(db, settings.guest_ttl_hours)
    print(
        f"Deleted {n} guest account{'' if n == 1 else 's'} older than {settings.guest_ttl_hours} h."
    )


if __name__ == "__main__":
    run()
