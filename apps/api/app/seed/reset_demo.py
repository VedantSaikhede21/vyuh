"""Remove non-demo sessions of the seeded @demo accounts (decision 126).

Local play and older e2e specs leave real sessions on demo accounts (trainee1@demo),
which then swamp the seeded history in trends and the unit dashboard. This deletes
ONLY sessions with `is_demo = false` that belong to `*@demo` users; their scores,
events and debriefs go with them (ON DELETE CASCADE). Kept: the seeded demo history,
the `e2e@demo` fixture sessions (seeded, rebuilt by `pnpm seed`), every non-@demo
account, users, scenarios and assignments.

Run: `pnpm seed:reset-demo` (lists what it would delete) and
`pnpm seed:reset-demo --yes` (deletes).
"""

import argparse
import sys
from collections import Counter

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import make_engine, make_session_factory
from app.models import ScoreRow, TrainingSession, User
from app.seed.e2e import E2E_EMAIL
from app.services.sessions import recompute_rating

DEMO_DOMAIN = "@demo"


def doomed_sessions(db: Session) -> list[tuple[TrainingSession, str]]:
    """(session, owner email) for every session the reset would delete."""
    rows = db.execute(
        select(TrainingSession, User.email)
        .join(User, User.id == TrainingSession.user_id)
        .where(
            User.email.like(f"%{DEMO_DOMAIN}"),
            User.email != E2E_EMAIL,
            TrainingSession.is_demo.is_(False),
        )
        .order_by(User.email, TrainingSession.started_at)
    )
    return [(s, email or "") for s, email in rows]


def reset_demo(db: Session, *, apply: bool) -> tuple[int, int]:
    """Print the plan; delete when `apply`. Returns (sessions, score rows)."""
    doomed = doomed_sessions(db)
    ids = [s.id for s, _ in doomed]
    scores = (
        db.scalar(select(func.count()).where(ScoreRow.session_id.in_(ids))) if ids else 0
    ) or 0
    per = Counter((email, s.mode.value, s.status.value) for s, email in doomed)
    if not doomed:
        print("Nothing to delete: no non-demo sessions on @demo accounts.")
        return 0, 0
    print(f"{'Deleting' if apply else 'Would delete'} {len(ids)} sessions and {scores} score rows:")
    for (email, mode, status), n in sorted(per.items()):
        print(f"  {email:<20} {mode:<10} {status:<10} {n:>4}")
    if apply:
        owners = {s.user_id for s, _ in doomed}
        db.execute(delete(TrainingSession).where(TrainingSession.id.in_(ids)))
        # Their rating history went with them (cascade): re-derive each owner's Elo.
        for user in db.scalars(select(User).where(User.id.in_(owners))):
            recompute_rating(db, user)
        db.commit()
        print("Done.")
    else:
        print("Dry run: nothing deleted. Re-run with --yes to delete.")
    return len(ids), scores


def run() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--yes", action="store_true", help="delete (default: list only)")
    # pnpm passes a bare `--` through to the script; drop it.
    args = parser.parse_args([a for a in sys.argv[1:] if a != "--"])
    factory = make_session_factory(make_engine(get_settings().database_url))
    with factory() as db:
        reset_demo(db, apply=args.yes)


if __name__ == "__main__":
    run()
