"""Scenario rules, listing and lookup."""

import uuid
from collections import Counter

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import ScoreRow, TrainingSession, User
from app.schemas.generated import (
    EoIrSensor,
    ErrorCode,
    GenerateRequest,
    GenerateScenarioResponse,
    NonThreatClass,
    Scenario,
    ScenarioDetailResponse,
    ScenarioKind,
    ScenarioListItem,
    SessionStatus,
    ThreatClass,
    UserRole,
)

_THREAT = {c.value for c in ThreatClass}
_NON_THREAT = {c.value for c in NonThreatClass}
_SILENT_LINKS = {"AUTONOMOUS_GNSS", "FIBRE_OPTIC", "NONE"}


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
        if c.emissions.rf_active and c.control_link.value in _SILENT_LINKS:
            problems.append(
                f"contacts.{c.id}: rfActive must be false for control link {c.control_link.value}"
            )
        if c.emissions.friendly_id_code is not None and not c.emissions.rf_active:
            problems.append(f"contacts.{c.id}: friendlyIdCode requires rfActive")
        if c.despawn_t_ms is not None and c.despawn_t_ms <= c.spawn_t_ms:
            problems.append(f"contacts.{c.id}: despawnTMs must be after spawnTMs")
    for x in s.sensors:
        if isinstance(x, EoIrSensor) and x.fov_deg_min > x.fov_deg_max:
            problems.append(f"sensors.{x.id}: fovDegMin > fovDegMax")
    return problems


def load_scenario(row: ScenarioRow) -> Scenario:
    return Scenario.model_validate(row.content)


def list_item(row: ScenarioRow, best_score: float | None = None) -> ScenarioListItem:
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
        terrain_preset=content.terrain.preset,
        date=content.environment.date,
        time=content.environment.time,
        weather=content.environment.weather,
        tags=list(row.tags),
        best_score=best_score,
    )


def best_scores(db: Session, user_id: uuid.UUID) -> dict[uuid.UUID, float]:
    """Scenario id → the user's best score total over their completed sessions."""
    query = (
        select(TrainingSession.scenario_id, func.max(ScoreRow.total))
        .join(ScoreRow, ScoreRow.session_id == TrainingSession.id)
        .where(
            TrainingSession.user_id == user_id,
            TrainingSession.status == SessionStatus.COMPLETED,
        )
        .group_by(TrainingSession.scenario_id)
    )
    return {scenario_id: float(total) for scenario_id, total in db.execute(query)}


# Scenarios tagged `test` (S11-S14) verify sim behaviour; they are not part of the
# training library (SPEC §7.2), so trainees do not see them in the list.
TEST_TAG = "test"
# Generated scenarios (Phase 3a, plan Q6) are not part of the library list; each
# trainee sees their own under "My generated" (`list_own_generated`, Phase 4a).
GENERATED_TAG = "generated"
STAFF_ROLES = frozenset({UserRole.INSTRUCTOR, UserRole.ADMIN})
#: Fields a trainee may set on POST /scenarios/generate (requirements 3a.6).
TRAINEE_GENERATE_FIELDS = frozenset({"terrain_preset", "time_band", "difficulty", "seed"})


def list_scenarios(
    db: Session,
    kind: ScenarioKind | None = None,
    difficulty: int | None = None,
    *,
    include_test: bool = True,
    user_id: uuid.UUID | None = None,
) -> list[ScenarioListItem]:
    """Library list. Generated scenarios appear only when asked for by kind."""
    query = select(ScenarioRow).order_by(ScenarioRow.difficulty, ScenarioRow.code, ScenarioRow.name)
    if not include_test:
        query = query.where(~ScenarioRow.tags.contains([TEST_TAG]))
    if kind is not ScenarioKind.GENERATED:
        query = query.where(ScenarioRow.kind != ScenarioKind.GENERATED)
    if kind is not None:
        query = query.where(ScenarioRow.kind == kind)
    if difficulty is not None:
        query = query.where(ScenarioRow.difficulty == difficulty)
    best = best_scores(db, user_id) if user_id is not None else {}
    return [list_item(row, best.get(row.id)) for row in db.scalars(query)]


def list_own_generated(db: Session, user_id: uuid.UUID) -> list[ScenarioListItem]:
    """The user's own generated scenarios, newest first, with their best scores."""
    query = (
        select(ScenarioRow)
        .where(ScenarioRow.kind == ScenarioKind.GENERATED, ScenarioRow.created_by == user_id)
        .order_by(ScenarioRow.created_at.desc(), ScenarioRow.id)
    )
    best = best_scores(db, user_id)
    return [list_item(row, best.get(row.id)) for row in db.scalars(query)]


def get_scenario_row(db: Session, scenario_id: uuid.UUID, user: User) -> ScenarioRow:
    """A scenario the user may open: a generated one only by its creator or staff
    (others get NOT_FOUND, so ids of other people's runs are not confirmed)."""
    row = db.get(ScenarioRow, scenario_id)
    if row is None or (
        row.kind is ScenarioKind.GENERATED
        and row.created_by != user.id
        and user.role not in STAFF_ROLES
    ):
        raise ApiError(ErrorCode.NOT_FOUND, "Scenario not found")
    return row


def generate_scenario(db: Session, user: User, body: GenerateRequest) -> GenerateScenarioResponse:
    """Generate a scenario, or return the user's existing copy of the same request."""
    # Imported here: the generator loads terrain, which most routes never need.
    from app.services.generator import generate

    if user.role not in STAFF_ROLES:
        extra = sorted(
            body.model_fields[f].alias or f
            for f in body.model_fields_set - TRAINEE_GENERATE_FIELDS
            if getattr(body, f) is not None
        )
        if extra:
            raise ApiError(
                ErrorCode.FORBIDDEN,
                "Trainees may choose only terrain, time band, difficulty and seed",
                {"fields": extra},
            )
    content = generate(body)
    row = db.scalar(
        select(ScenarioRow).where(
            ScenarioRow.kind == ScenarioKind.GENERATED,
            ScenarioRow.created_by == user.id,
            ScenarioRow.content["id"].astext == content["id"],
        )
    )
    if row is None:
        row = ScenarioRow(
            code=None,
            name=content["name"],
            kind=ScenarioKind.GENERATED,
            seed=content["seed"],
            difficulty=content["difficulty"],
            tags=[GENERATED_TAG],
            request=content["request"],
            content=content,
            schema_version=content["schemaVersion"],
            created_by=user.id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return GenerateScenarioResponse(scenario_id=row.id, scenario=load_scenario(row))


def scenario_detail(row: ScenarioRow) -> ScenarioDetailResponse:
    return ScenarioDetailResponse(
        scenario_id=row.id, code=row.code, kind=row.kind, scenario=load_scenario(row)
    )
