"""Seed the hand-written scripted scenarios (`seed/scenarios/*.json`). Idempotent by code.

A scenario that already has sessions is never changed (replay and scores depend on
its content); edit it under a new code instead.
"""

import json
import logging
from pathlib import Path

from sqlalchemy import exists, select
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import TrainingSession
from app.schemas.generated import Scenario, ScenarioKind
from app.services.scenarios import scenario_rule_violations

logger = logging.getLogger(__name__)

SCENARIO_DIR = Path(__file__).resolve().parent / "scenarios"

TAGS: dict[str, list[str]] = {"S01": ["tutorial", "demo"], "S02": ["demo"]}


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


def seed_scenarios(db: Session, directory: Path = SCENARIO_DIR) -> int:
    """Insert new scripted scenarios, update unused ones; returns the number written."""
    written = 0
    for scenario in load_scripted(directory):
        content = scenario.model_dump(mode="json", by_alias=True, exclude_none=True)
        row = db.scalar(select(ScenarioRow).where(ScenarioRow.code == scenario.id))
        if row is None:
            row = ScenarioRow(code=scenario.id, kind=ScenarioKind.SCRIPTED)
            db.add(row)
        elif row.content == content:
            continue
        elif db.scalar(select(exists().where(TrainingSession.scenario_id == row.id))):
            logger.warning("Scenario %s has sessions; not updating its content", scenario.id)
            continue
        row.name = scenario.name
        row.seed = scenario.seed
        row.difficulty = scenario.difficulty
        row.tags = TAGS.get(scenario.id, [])
        row.request = None
        row.content = content
        row.schema_version = scenario.schema_version
        written += 1
    db.flush()
    return written
