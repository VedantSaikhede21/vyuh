"""Phase 6C reads: operator home, public status, unit readiness, live sessions and the
scoring summary behind Help (SPEC §11)."""

import json
import uuid
from collections import Counter
from datetime import UTC, datetime, timedelta
from typing import Any

from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app import __version__
from app.core.config import Settings
from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import SessionEvent, TrainingSession, Unit, User
from app.schemas.generated import (
    ActiveSessionRow,
    ActiveSessionsResponse,
    ComponentStatus,
    ErrorCode,
    HomeResponse,
    HomeSessionRow,
    LevelState,
    ReadinessResponse,
    ReadinessRow,
    ScoringLeafSummary,
    ScoringSummaryResponse,
    SessionStatus,
    StageRate,
    StatusResponse,
    UnitRef,
    UserRole,
)
from app.services.analytics.trends import STAGES, assessment_facts, weakest
from app.services.assignments import assignments_of, item
from app.services.display import display_int
from app.services.generator.core import GENERATOR_VERSION, SCORING_TREE_ID
from app.services.notices import list_notices
from app.services.record import build_record, session_view
from app.services.scenarios import scenario_code
from app.services.scoring.tree import TREE_DIR
from app.services.sessions import latest_score_row
from app.services.terrain import available_presets, preset_revision

#: Live monitor: an ACTIVE session with no batch for this long is not shown (heartbeats are 2 s).
LIVE_WINDOW = timedelta(seconds=60)


def _stages(views: list[Any]) -> list[StageRate]:
    """Kill-chain stage rates over threat contacts only (SPEC §9.7 definition)."""
    ok: Counter[str] = Counter()
    total: Counter[str] = Counter()
    for v in views:
        ok.update(v.stage_ok)
        total.update(v.stage_total)
    return [
        StageRate(
            stage=s,
            ok=ok[s.value],
            total=total[s.value],
            rate=round(ok[s.value] / total[s.value], 3) if total[s.value] else None,
        )
        for s in STAGES
    ]


# ---- Home ---------------------------------------------------------------------------------


def home(db: Session, user: User) -> HomeResponse:
    facts = assessment_facts(db, [user.id])
    views = [session_view(db, f) for f in facts]
    open_items = [it for it in (item(db, a, user.id) for a in assignments_of(db, user))]
    open_items = [it for it in open_items if not it.completed]
    # Due soonest first; undated last, newest assignment first among those.
    open_items.sort(
        key=lambda it: (
            it.due_at is None,
            it.due_at or datetime.max.replace(tzinfo=UTC),
            -it.created_at.timestamp(),
        )
    )
    recent_rows = db.execute(
        select(TrainingSession, ScenarioRow)
        .join(ScenarioRow, ScenarioRow.id == TrainingSession.scenario_id)
        .where(
            TrainingSession.user_id == user.id,
            TrainingSession.status == SessionStatus.COMPLETED,
        )
        .order_by(TrainingSession.ended_at.desc().nulls_last())
        .limit(5)
    )
    recent: list[HomeSessionRow] = []
    for row, srow in recent_rows:
        score = latest_score_row(db, row.id)
        if score is None:  # pragma: no cover - completed sessions always have a score
            continue
        recent.append(
            HomeSessionRow(
                session_id=row.id,
                scenario_code=scenario_code(srow),
                scenario_name=srow.name,
                mode=row.mode,
                difficulty=srow.difficulty,
                ended_at=row.ended_at or row.started_at,
                total=display_int(score.total),
                is_demo=row.is_demo,
            )
        )
    notices = list_notices(db, user, limit=3)
    record = build_record(db, user, facts=facts)
    next_level = next((lv for lv in record.levels if lv.state is not LevelState.QUALIFIED), None)
    return HomeResponse(
        assignment=open_items[0] if open_items else None,
        open_assignments=len(open_items),
        stages=_stages(views),
        assessments=len(facts),
        demo_assessments=sum(1 for f in facts if f.row.is_demo),
        rating=user.rating,
        recent=recent,
        notices=notices.items,
        unread_count=notices.unread_count,
        next_level=next_level,
    )


# ---- Status (public, minimal: decision 156) ---------------------------------------------------


def status(db: Session, settings: Settings) -> StatusResponse:
    """Up / down and versions only: no hostnames, database names, model ids or error text."""
    try:
        db.execute(text("SELECT 1"))
        database = ComponentStatus.OK
    except Exception:
        db.rollback()
        database = ComponentStatus.DOWN
    terrain: dict[str, int] = {}
    for preset in available_presets():
        try:
            terrain[preset] = preset_revision(preset)
        except (OSError, ValueError, KeyError):
            continue
    return StatusResponse(
        components={
            "api": ComponentStatus.OK,
            "database": database,
            "llmEnabled": settings.llm_enabled,
        },
        versions={"api": __version__, "generator": GENERATOR_VERSION, "terrain": terrain},
    )


# ---- Readiness board and live sessions ---------------------------------------------------------


def _unit(db: Session, unit_id: uuid.UUID) -> Unit:
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Unit not found")
    return unit


def readiness(db: Session, unit_id: uuid.UUID) -> ReadinessResponse:
    """One row per trainee: level, sign-off waiting, last assessment, weakest stage, overdue."""
    unit = _unit(db, unit_id)
    trainees = list(
        db.scalars(
            select(User)
            .where(User.unit_id == unit.id, User.role == UserRole.TRAINEE)
            .order_by(User.name)
        )
    )
    now = datetime.now(UTC)
    rows: list[ReadinessRow] = []
    for t in trainees:
        facts = assessment_facts(db, [t.id])
        record = build_record(db, t, facts=facts)
        qualified = [lv for lv in record.levels if lv.state is LevelState.QUALIFIED]
        waiting = next(
            (lv for lv in record.levels if lv.state is LevelState.IN_PROGRESS and lv.criteria_met),
            None,
        )
        overdue = sum(
            1
            for a in assignments_of(db, t)
            if (it := item(db, a, t.id)) and not it.completed and it.due_at and it.due_at < now
        )
        last = facts[-1] if facts else None
        rows.append(
            ReadinessRow(
                user_id=t.id,
                name=t.name,
                level=qualified[-1].level if qualified else None,
                awaiting_signoff=waiting.level if waiting else None,
                review_due=any(lv.review_due for lv in record.levels),
                assessments=len(facts),
                last_assessment_at=last.ended_at if last else None,
                last_total=display_int(last.total) if last else None,
                weakest_stage=weakest(_stages([session_view(db, f) for f in facts])),
                overdue_assignments=overdue,
            )
        )
    return ReadinessResponse(unit=UnitRef(id=unit.id, name=unit.name), rows=rows)


def active_sessions(db: Session, unit_id: uuid.UUID | None) -> ActiveSessionsResponse:
    """ACTIVE sessions with a batch in the last minute. Read-only; no score (it is
    computed on the server when the session completes)."""
    now = datetime.now(UTC)
    q = (
        select(TrainingSession, User, ScenarioRow)
        .join(User, User.id == TrainingSession.user_id)
        .join(ScenarioRow, ScenarioRow.id == TrainingSession.scenario_id)
        .where(
            TrainingSession.status == SessionStatus.ACTIVE,
            TrainingSession.last_batch_at >= now - LIVE_WINDOW,
        )
        .order_by(TrainingSession.started_at)
    )
    if unit_id is not None:
        _unit(db, unit_id)
        q = q.where(User.unit_id == unit_id)
    items: list[ActiveSessionRow] = []
    for row, user, srow in db.execute(q):
        sim_t = db.scalar(
            select(func.max(SessionEvent.t_ms)).where(SessionEvent.session_id == row.id)
        )
        items.append(
            ActiveSessionRow(
                session_id=row.id,
                user_id=user.id,
                user_name=user.name,
                scenario_code=scenario_code(srow),
                scenario_name=srow.name,
                mode=row.mode,
                started_at=row.started_at,
                last_batch_at=row.last_batch_at,
                sim_t_ms=sim_t or 0,
            )
        )
    return ActiveSessionsResponse(items=items, polled_at=now)


# ---- Scoring summary (Help) ---------------------------------------------------------------------


def scoring_summary() -> ScoringSummaryResponse:
    """The current built-in tree's weights, latency bands and leaves, read from its file."""
    tree = json.loads((TREE_DIR / f"{SCORING_TREE_ID}.json").read_text("utf-8"))
    leaves: dict[str, ScoringLeafSummary] = {}
    bands: list[float] = []

    def walk(node: Any) -> None:
        nonlocal bands
        if isinstance(node, list):
            for n in node:
                walk(n)
            return
        if not isinstance(node, dict):
            return
        if "bands" in node and node["bands"].get("metric") == "detectionLatencyS":
            bands = list(node["bands"]["edges"])
        if "leaf" in node and node["leaf"] not in leaves:
            leaves[node["leaf"]] = ScoringLeafSummary(
                code=node["leaf"],
                component=node.get("component"),
                points=node.get("points") if "component" in node else None,
                adjust=node.get("adjust"),
            )
        for v in node.values():
            walk(v)

    walk(tree["nodes"])
    return ScoringSummaryResponse(
        current=SCORING_TREE_ID,
        component_max=tree["componentMax"],
        detection_bands_s=bands,
        leaves=list(leaves.values()),
    )
