"""Seed fingerprint and the dev-only re-seed at startup (decision 119)."""

import shutil
from pathlib import Path

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import Env, Settings
from app.main import create_app
from app.seed.demo import seed_if_changed
from app.seed.fingerprint import SEED_DIR, seed_fingerprint, store_fingerprint, stored_fingerprint
from tests.conftest import make_settings


def _copy_seed(tmp: Path) -> Path:
    root = tmp / "seed"
    for sub in ("scenarios", "e2e", "generated", "demo_sessions"):
        shutil.copytree(SEED_DIR / sub, root / sub, ignore=shutil.ignore_patterns("__pycache__"))
    return root


def test_fingerprint_follows_seed_file_content_only(tmp_path: Path) -> None:
    root = _copy_seed(tmp_path)
    base = seed_fingerprint(root)
    assert base == seed_fingerprint(SEED_DIR)
    s04 = root / "scenarios" / "S04.json"
    # Line endings do not count (a Windows checkout hashes like Linux).
    s04.write_bytes(s04.read_bytes().replace(b"\n", b"\r\n"))
    assert seed_fingerprint(root) == base
    s04.write_text(s04.read_text(encoding="utf-8") + " ", encoding="utf-8")
    assert seed_fingerprint(root) != base
    # Files the seed does not read do not count.
    (root / "scenarios" / "notes.txt").write_text("x", encoding="utf-8")
    s04.write_text(s04.read_text(encoding="utf-8")[:-1], encoding="utf-8")
    assert seed_fingerprint(root) == base


def test_seed_runs_only_when_the_seed_files_changed(
    app: FastAPI, settings: Settings, db: Session
) -> None:
    factory = app.state.session_factory
    assert seed_if_changed(factory, settings) is not None
    assert stored_fingerprint(db) == seed_fingerprint()
    assert seed_if_changed(factory, settings) is None
    store_fingerprint(db, "0" * 64)
    db.commit()
    assert seed_if_changed(factory, settings) is not None


def test_dev_api_reseeds_at_startup_when_the_fingerprint_differs(db: Session) -> None:
    store_fingerprint(db, "0" * 64)
    db.commit()
    offline = create_app(make_settings(env=Env.OFFLINE))
    with TestClient(offline):
        pass
    offline.state.engine.dispose()
    db.expire_all()
    assert stored_fingerprint(db) == "0" * 64  # offline / prod: `pnpm seed` by hand

    dev = create_app(make_settings(env=Env.DEV))
    with TestClient(dev):
        pass
    dev.state.engine.dispose()
    db.expire_all()
    assert stored_fingerprint(db) == seed_fingerprint()
