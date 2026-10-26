"""Seed the hand-written scripted scenarios (`seed/scenarios/*.json`). Idempotent by code.

A scenario that already has sessions keeps its gameplay content (replay and scores depend
on it); only its display fields (name, briefing, tags), scoring tree and generator version
may change. AI-assist suggestions may also change while no session on the scenario ran
on SIM_VERSION 6 or later, the first that shows them (decision 132). Any other edit needs
a new code (decision 46).
"""

import json
import logging
from pathlib import Path
from typing import Any

from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.models import Scenario as ScenarioRow
from app.models import TrainingSession
from app.schemas.generated import Scenario, ScenarioKind, SessionStatus
from app.services.scenarios import scenario_rule_violations

logger = logging.getLogger(__name__)

#: Content keys a used scenario may still change: display text, and the scoring tree
#: and generator version, which do not change what the sim does (stored scores keep
#: their tree_version; replay needs only the sim content). Decision 115.
DISPLAY_FIELDS = ("name", "briefing", "scoringTreeId", "generatorVersion")

#: The first sim version that reads `aiSuggestion` (AI_SUGGESTION_SHOWN).
AI_SUGGESTION_SIM_VERSION = 6

SCENARIO_DIR = Path(__file__).resolve().parent / "scenarios"
#: Library sources (scripts/scenarios/build_scripted.py); their tags are seeded too.
SOURCE_DIR = SCENARIO_DIR / "src"

TAGS: dict[str, list[str]] = {
    "S01": ["tutorial", "demo"],
    "S02": ["demo"],
    "S11": ["test"],  # Phase 2 test scenarios (SPEC §7.2)
    "S12": ["test"],
    "S13": ["test"],
    "S14": ["test"],
}


#: Library scenarios guests may play, on top of their own tags (SPEC §20 judge path:
#: S15 first, S06 the urban follow-up; Phase 6E).
DEMO_CODES = frozenset({"S06", "S15"})


def scenario_tags(code: str, sources: Path = SOURCE_DIR) -> list[str]:
    """Tags of a scripted scenario: TAGS, else its library source's tags."""
    if code in TAGS:
        return TAGS[code]
    source = sources / f"{code}.json"
    tags = (
        list(json.loads(source.read_text(encoding="utf-8")).get("tags", []))
        if source.is_file()
        else []
    )
    return [*tags, "demo"] if code in DEMO_CODES and "demo" not in tags else tags


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


def _without_ai(content: dict[str, Any]) -> dict[str, Any]:
    contacts = [
        {k: v for k, v in c.items() if k != "aiSuggestion"} for c in content.get("contacts", [])
    ]
    return {**gameplay_content(content), "contacts": contacts}


def _suggestions_unused(db: Session, row: ScenarioRow) -> bool:
    """No started session on this scenario ran on a sim that shows AI suggestions (a
    CREATED session has no events, so nothing in it depends on the content)."""
    newest = db.scalar(
        select(func.max(TrainingSession.sim_version)).where(
            TrainingSession.scenario_id == row.id,
            TrainingSession.status != SessionStatus.CREATED,
        )
    )
    return newest is None or newest < AI_SUGGESTION_SIM_VERSION


def seed_scenarios(db: Session, directory: Path = SCENARIO_DIR) -> int:
    """Insert new scripted scenarios, update unused ones; returns the number written."""
    written = 0
    for scenario in load_scripted(directory):
        content = scenario.model_dump(mode="json", by_alias=True, exclude_none=True)
        tags = scenario_tags(scenario.id, directory / "src")
        row = db.scalar(select(ScenarioRow).where(ScenarioRow.code == scenario.id))
        if row is None:
            row = ScenarioRow(code=scenario.id, kind=ScenarioKind.SCRIPTED)
            db.add(row)
        elif row.content == content and list(row.tags) == tags:
            continue
        elif db.scalar(select(exists().where(TrainingSession.scenario_id == row.id))):
            keep = dict(row.content)
            if gameplay_content(row.content) != gameplay_content(content):
                if not (
                    _without_ai(row.content) == _without_ai(content)
                    and _suggestions_unused(db, row)
                ):
                    logger.warning(
                        "Scenario %s has sessions; not updating its content", scenario.id
                    )
                    continue
                keep["contacts"] = content["contacts"]
            row.name = scenario.name
            row.tags = tags
            row.content = {**keep, **{k: content[k] for k in DISPLAY_FIELDS if k in content}}
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
