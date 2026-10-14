"""Scenario rules, listing and lookup."""

import uuid
from collections import Counter

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.schemas.generated import (
    EoIrSensor,
    ErrorCode,
    NonThreatClass,
    Scenario,
    ScenarioDetailResponse,
    ScenarioKind,
    ScenarioListItem,
    ThreatClass,
)

_THREAT = {c.value for c in ThreatClass}
_NON_THREAT = {c.value for c in NonThreatClass}


def scenario_rule_violations(s: Scenario) -> list[str]:
    """Cross-field rules from the zod `superRefine` in packages/shared/src/scenario.ts.

    JSON Schema cannot express these, so they are re-checked here (CLAUDE.md §12).
    """
    problems: list[str] = []
    lists = {
        "zones": [z.id for z in s.zones],
        "assets": [a.id for a in s.assets],
        "sensors": [x.id for x in s.sensors],
        "effectors": [e.id for e in s.effectors],
        "contacts": [c.id for c in s.contacts],
    }
    for key, ids in lists.items():
        problems += [f'{key}: duplicate id "{i}"' for i, n in Counter(ids).items() if n > 1]
    duration_ms = s.duration_s * 1000
    for c in s.contacts:
        cls = c.class_.value
        expected = cls in _THREAT
        if c.is_threat != expected or (not expected and cls not in _NON_THREAT):
            problems.append(f"contacts.{c.id}: isThreat must be {expected} for class {cls}")
        if c.spawn_t_ms > duration_ms:
            problems.append(f"contacts.{c.id}: spawns after scenario ends")
        if c.despawn_t_ms is not None and c.despawn_t_ms <= c.spawn_t_ms:
            problems.append(f"contacts.{c.id}: despawnTMs must be after spawnTMs")
    for x in s.sensors:
        if isinstance(x, EoIrSensor) and x.fov_deg_min > x.fov_deg_max:
            problems.append(f"sensors.{x.id}: fovDegMin > fovDegMax")
    return problems


def load_scenario(row: ScenarioRow) -> Scenario:
    return Scenario.model_validate(row.content)


def list_item(row: ScenarioRow) -> ScenarioListItem:
    content = load_scenario(row)
    return ScenarioListItem(
        id=row.id,
        code=row.code,
        name=row.name,
        kind=row.kind,
        difficulty=row.difficulty,
        duration_s=content.duration_s,
        roe=content.roe,
        is_night=content.environment.is_night,
        tags=list(row.tags),
    )


def list_scenarios(
    db: Session, kind: ScenarioKind | None = None, difficulty: int | None = None
) -> list[ScenarioListItem]:
    query = select(ScenarioRow).order_by(ScenarioRow.difficulty, ScenarioRow.code, ScenarioRow.name)
    if kind is not None:
        query = query.where(ScenarioRow.kind == kind)
    if difficulty is not None:
        query = query.where(ScenarioRow.difficulty == difficulty)
    return [list_item(row) for row in db.scalars(query)]


def get_scenario_row(db: Session, scenario_id: uuid.UUID) -> ScenarioRow:
    row = db.get(ScenarioRow, scenario_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Scenario not found")
    return row


def scenario_detail(row: ScenarioRow) -> ScenarioDetailResponse:
    return ScenarioDetailResponse(
        scenario_id=row.id, code=row.code, kind=row.kind, scenario=load_scenario(row)
    )
