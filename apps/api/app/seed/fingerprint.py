"""Content hash of the seed data files (decision 119).

The demo seed is idempotent but only runs when asked. The hash lets the dev API
re-seed at startup exactly when a seed file changed (a rebuilt scripted scenario,
a re-exported e2e log, regenerated class profiles), and nothing else.
"""

import hashlib
from datetime import UTC, datetime
from pathlib import Path

from sqlalchemy.orm import Session

from app.models import SeedState

SEED_DIR = Path(__file__).resolve().parent
#: The data the demo seed reads (code changes are not hashed).
SEED_GLOBS = ("scenarios/*.json", "scenarios/src/*.json", "e2e/*.json", "generated/*.json")
SEED_KEY = "demo"


def seed_fingerprint(root: Path = SEED_DIR) -> str:
    h = hashlib.sha256()
    for pattern in SEED_GLOBS:
        for path in sorted(root.glob(pattern)):
            h.update(path.relative_to(root).as_posix().encode())
            h.update(b"\0")
            # Line endings normalised, so a Windows checkout hashes like Linux.
            h.update(path.read_bytes().replace(b"\r\n", b"\n"))
            h.update(b"\0")
    return h.hexdigest()


def stored_fingerprint(db: Session) -> str | None:
    row = db.get(SeedState, SEED_KEY)
    return row.fingerprint if row else None


def store_fingerprint(db: Session, fingerprint: str) -> None:
    row = db.get(SeedState, SEED_KEY)
    if row is None:
        row = SeedState(key=SEED_KEY)
        db.add(row)
    row.fingerprint = fingerprint
    row.updated_at = datetime.now(UTC)
