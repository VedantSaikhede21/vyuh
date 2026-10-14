"""Seed the hand-written scripted scenarios (`seed/scenarios/*.json`). Idempotent by code.

A scenario that already has sessions keeps its gameplay content (replay and scores depend
on it); only its display fields (name, briefing, tags) may change. Any other edit needs a
new code (decision 46).
"""

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import TrainingSession
from app.schemas.generated import Scenario, ScenarioKind
from app.services.scenarios import scenario_rule_violations

logger = logging.getLogger(__name__)

DISPLAY_FIELDS = ("name", "briefing")  # content keys a used scenario may still change

SCENARIO_DIR = Path(__file__).resolve().parent / "scenarios"

TAGS: dict[str, list[str]] = {
    "S01": ["tutorial", "demo"],
    "S02": ["demo"],
    "S11": ["test"],  # Phase 2 test scenarios (SPEC §7.2)
    "S12": ["test"],
    "S13": ["test"],
    "S14": ["test"],
}


def load_scripted(directory: Path = SCENARIO_DIR) -> list[Scenario]:
    scenarios = []
    for path in sorted(directory.glob("*.json")):
        scenario = Scenario.model_validate(json.loads(path.read_text(encoding="utf-8")))
        problems = scenario_rule_violations(scenario)
        if problems:
            raise ValueError(f"{path.name}: {'; '.join(problems)}")
        if scenario.id != path.stem:
            raise ValueError(f"{path.name}: id {scenario.id!r} must match the file name")
        scenarios.append(scenario)
    return scenarios


def gameplay_content(content: dict[str, Any]) -> dict[str, Any]:
    """Scenario content without its display-only fields."""
    return {k: v for k, v in content.items() if k not in DISPLAY_FIELDS}


def seed_scenarios(db: Session, directory: Path = SCENARIO_DIR) -> int:
    """Insert new scripted scenarios, update unused ones; returns the number written."""
    written = 0
    for scenario in load_scripted(directory):
        content = scenario.model_dump(mode="json", by_alias=True, exclude_none=True)
        tags = TAGS.get(scenario.id, [])
        row = db.scalar(select(ScenarioRow).where(ScenarioRow.code == scenario.id))
        if row is None:
            row = ScenarioRow(code=scenario.id, kind=ScenarioKind.SCRIPTED)
            db.add(row)
        elif row.content == content and list(row.tags) == tags:
            continue
        elif db.scalar(select(exists().where(TrainingSession.scenario_id == row.id))):
            if gameplay_content(row.content) != gameplay_content(content):
                logger.warning("Scenario %s has sessions; not updating its content", scenario.id)
                continue
            row.name = scenario.name
            row.tags = tags
            row.content = {**row.content, **{k: content[k] for k in DISPLAY_FIELDS}}
            written += 1
            continue
        row.name = scenario.name
        row.seed = scenario.seed
        row.difficulty = scenario.difficulty
        row.tags = tags
        row.request = None
        row.content = content
        row.schema_version = scenario.schema_version
        written += 1
    db.flush()
    return written
