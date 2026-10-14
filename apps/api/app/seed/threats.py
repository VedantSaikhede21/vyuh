"""Seed the threat library (`threat_types`, SPEC §7, §10) from the generated class profiles.

`seed/generated/class_profiles.json` is written by `pnpm gen:schemas` from
`CLASS_PROFILES` in packages/shared (decision 49). Idempotent by code.
"""

import json
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import ThreatType

PROFILES_FILE = Path(__file__).resolve().parent / "generated" / "class_profiles.json"
SOURCE_REF = "Representative values, SPEC §7; sources in docs/realism-sources.md"


def load_profiles(path: Path = PROFILES_FILE) -> dict[str, dict[str, Any]]:
    classes: dict[str, dict[str, Any]] = json.loads(path.read_text(encoding="utf-8"))["classes"]
    return classes


def display_name(code: str) -> str:
    return code.replace("_", " ").capitalize()


def seed_threat_types(db: Session) -> int:
    """Insert or update one row per contact class; returns the number of rows written."""
    profiles = load_profiles()
    for code, p in sorted(profiles.items()):
        row = db.get(ThreatType, code) or ThreatType(code=code)
        row.name = display_name(code)
        row.category = p["category"]
        row.is_threat = p["isThreat"]
        row.size_m = p["sizeM"]
        row.rcs_m2 = p["rcsM2"]
        row.max_speed_mps = p["maxSpeedMps"]
        row.thermal_signature = p["thermalContrast"]
        row.control_links = list(p["typicalLinks"])
        row.source_ref = SOURCE_REF
        db.add(row)
    db.flush()
    return len(profiles)
