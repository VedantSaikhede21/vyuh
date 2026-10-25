"""Trainee trends and the unit dashboard (SPEC §11, §12 Phase 4; decisions 122-123).

Assessment sessions only: Practice allows pause and hints, so it is not comparable.
Each completed session is read once into a `SessionFacts` (latest score row, kill
chain); trends and unit figures are plain aggregates of those.
"""

import uuid
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from statistics import mean

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import TrainingSession, Unit, User
from app.schemas.generated import (
    AiTrustMetrics,
    AssignmentCompletion,
    ComponentPct,
    ErrorCode,
    KillChainStage,
    KillChainStatus,
    MistakeItem,
    RatingChange,
    Scenario,
    SessionMode,
    SessionStatus,
    StageRate,
    TraineeTrendsResponse,
    TrendPoint,
    TrendUser,
    UnitDashboardResponse,
    UnitRef,
    UnitSessionRow,
    UnitTraineeRow,
    UserRole,
)
from app.services.analytics.ai_trust import ai_trust, combine
from app.services.analytics.kill_chain import kill_chain
from app.services.assignments import completed_session, unit_assignments
from app.services.display import display_int, display_opt
from app.services.recommendation import recommend_difficulty
from app.services.scenarios import load_scenario, scenario_code
from app.services.sessions import (
    latest_score_row,
    rating_change,
    score_from_row,
    stored_events,
)

PCT_COMPONENTS = ("detection", "classification", "decision", "report")

#: Scoring-tree leaves that are mistakes, in plain words (SPEC §9.2 leaf ids).
MISTAKES: dict[str, str] = {
    "MISSED": "Threat track never marked detected",
    "LATENCY_OVER_30S": "Threat marked detected more than 30 s after it was on the sensors",
    "NOT_CLASSIFIED": "Threat track left unclassified",
    "CLASS_WRONG": "Threat classified as the wrong type",
    "CLASS_WRONG_BEFORE_IDENTIFIABLE": "Classified before the camera could identify it",
    "DECISION_NONE": "No response ordered against a threat",
    "DECISION_INEFFECTIVE": "Response ordered but it had no effect",
    "DECISION_INEFFECTIVE_EW": "EW ordered against a link it cannot affect",
    "DECISION_ENGAGED_NOT_NEUTRALISED": "Engaged a threat but did not neutralise it",
    "DROP_BEFORE_NEUTRALISED": "Threat dropped its payload before it was neutralised",
    "FRATRICIDE": "Interceptor fired at a friendly drone",
    "FRIENDLY_JAMMED": "Friendly drone caught in a jam",
    "WRONGLY_ENGAGED": "Non-threat engaged (bird, civilian or helicopter)",
    "CIVILIAN_JAMMED": "Civilian drone caught in a jam sector",
    "BIRD_EW_ORDERED": "EW ordered on a bird",
    "REPORT_NONE": "No contact report sent for a threat",
    "ROE_VIOLATION_ATTEMPT": "Intercept attempted against the ROE",
    "NO_KINETIC_VIOLATION_ATTEMPT": "Intercept attempted over a no-kinetic zone",
}

STAGES = [s for s in KillChainStage]


@dataclass
class SessionFacts:
    row: TrainingSession
    scenario_row: ScenarioRow
    scenario: Scenario
    total: float
    components: dict[str, float | None]
    latency_s: float | None
    accuracy: float | None
    tree_version: str
    rating: RatingChange | None
    trust: AiTrustMetrics
    mistakes: Counter[str] = field(default_factory=Counter)
    stage_ok: Counter[str] = field(default_factory=Counter)
    stage_total: Counter[str] = field(default_factory=Counter)

    @property
    def ended_at(self) -> datetime:
        return self.row.ended_at or self.row.started_at


def _facts(db: Session, row: TrainingSession, scenarios: dict[uuid.UUID, tuple]) -> SessionFacts:
    score_row = latest_score_row(db, row.id)
    if score_row is None:  # pragma: no cover - completed sessions always have a score
        raise ValueError(f"session {row.id} has no score")
    score = score_from_row(db, score_row)
    if row.scenario_id not in scenarios:
        srow = db.get_one(ScenarioRow, row.scenario_id)
        scenarios[row.scenario_id] = (srow, load_scenario(srow))
    srow, scenario = scenarios[row.scenario_id]
    comp = score.components.model_dump()
    cmax = score.component_max.model_dump()
    pct = {c: round(100 * comp[c] / cmax[c], 1) if cmax[c] > 0 else None for c in PCT_COMPONENTS}
    latencies = [
        p.detection_latency_s
        for p in score.per_contact
        if p.is_threat and p.detection_latency_s is not None
    ]
    tracked = [p for p in score.per_contact if p.track_ids]
    exact = [
        p for p in tracked if p.classification_correct and p.classification_correct.value == "EXACT"
    ]
    events = stored_events(db, row.id)
    facts = SessionFacts(
        row=row,
        scenario_row=srow,
        scenario=scenario,
        total=score.total,
        components=pct,
        latency_s=round(mean(latencies), 1) if latencies else None,
        accuracy=round(len(exact) / len(tracked), 3) if tracked else None,
        tree_version=score.tree_version,
        rating=rating_change(db, row, scenario.difficulty),
        trust=ai_trust(scenario, events),
    )
    for p in score.per_contact:
        for leaf in {getattr(x, "root", x) for x in p.leaves}:
            if leaf in MISTAKES:
                facts.mistakes[leaf] += 1
    for chain in kill_chain(scenario, events):
        for step in chain.stages:
            if step.status is KillChainStatus.NOT_APPLICABLE:
                continue
            facts.stage_total[step.stage.value] += 1
            if step.status is KillChainStatus.OK:
                facts.stage_ok[step.stage.value] += 1
    return facts


def assessment_facts(db: Session, user_ids: list[uuid.UUID]) -> list[SessionFacts]:
    """Completed Assessment sessions of these users, oldest first."""
    if not user_ids:
        return []
    rows = db.scalars(
        select(TrainingSession)
        .where(
            TrainingSession.user_id.in_(user_ids),
            TrainingSession.mode == SessionMode.ASSESSMENT,
            TrainingSession.status == SessionStatus.COMPLETED,
        )
        .order_by(TrainingSession.ended_at.asc().nulls_last(), TrainingSession.started_at)
    )
    cache: dict[uuid.UUID, tuple] = {}
    return [_facts(db, r, cache) for r in rows]


def _avg_int(values: list[float]) -> int | None:
    """Mean score or percentage as its display value (decision 149)."""
    return display_opt(mean(values)) if values else None


def _avg(values: list[float | None], digits: int = 1) -> float | None:
    present = [v for v in values if v is not None]
    return round(mean(present), digits) if present else None


def stage_rates(facts: list[SessionFacts]) -> list[StageRate]:
    ok: Counter[str] = Counter()
    total: Counter[str] = Counter()
    for f in facts:
        ok.update(f.stage_ok)
        total.update(f.stage_total)
    return [
        StageRate(
            stage=s,
            ok=ok[s.value],
            total=total[s.value],
            rate=round(ok[s.value] / total[s.value], 3) if total[s.value] else None,
        )
        for s in STAGES
    ]


def weakest(rates: list[StageRate]) -> KillChainStage | None:
    """The applicable stage with the lowest OK rate (ties: the earlier stage)."""
    scored = [r for r in rates if r.rate is not None]
    # `rate` is a generated root model; compare its float.
    return min(scored, key=lambda r: getattr(r.rate, "root", r.rate)).stage if scored else None


def mistake_items(facts: list[SessionFacts], *, min_sessions: int = 1) -> list[MistakeItem]:
    count: Counter[str] = Counter()
    sessions: Counter[str] = Counter()
    trainees: defaultdict[str, set[uuid.UUID]] = defaultdict(set)
    for f in facts:
        for code, n in f.mistakes.items():
            count[code] += n
            sessions[code] += 1
            trainees[code].add(f.row.user_id)
    items = [
        MistakeItem(
            code=code,
            text=MISTAKES[code],
            count=count[code],
            sessions=sessions[code],
            trainees=len(trainees[code]),
        )
        for code in count
        if sessions[code] >= min_sessions
    ]
    items.sort(key=lambda m: (-m.trainees, -m.sessions, -m.count, m.code))
    return items[:8]


def _point(f: SessionFacts, current_rating: int) -> TrendPoint:
    nxt, _ = recommend_difficulty(f.rating.after if f.rating else current_rating)
    return TrendPoint(
        session_id=f.row.id,
        scenario_id=f.scenario_row.id,
        scenario_code=scenario_code(f.scenario_row),
        scenario_name=f.scenario_row.name,
        difficulty=f.scenario.difficulty,
        ended_at=f.ended_at,
        total=display_int(f.total),
        components=ComponentPct(**{c: display_opt(v) for c, v in f.components.items()}),
        detection_latency_s=f.latency_s,
        classification_accuracy=f.accuracy,
        recommended_difficulty=nxt,
        rating_before=f.rating.before if f.rating else None,
        rating_after=f.rating.after if f.rating else None,
        # Generated root models: pass the floats.
        over_trust=getattr(f.trust.over_trust, "root", f.trust.over_trust),
        under_trust=getattr(f.trust.under_trust, "root", f.trust.under_trust),
        tree_version=f.tree_version,
        is_demo=f.row.is_demo,
    )


def trainee_trends(db: Session, viewer: User, user_id: uuid.UUID) -> TraineeTrendsResponse:
    """Self, or instructor / admin (SPEC §11)."""
    if viewer.id != user_id and viewer.role not in (UserRole.INSTRUCTOR, UserRole.ADMIN):
        raise ApiError(ErrorCode.FORBIDDEN, "Trends are visible to the trainee and instructors")
    user = db.get(User, user_id)
    if user is None:
        raise ApiError(ErrorCode.NOT_FOUND, "User not found")
    facts = assessment_facts(db, [user.id])
    return TraineeTrendsResponse(
        user=TrendUser(id=user.id, name=user.name, unit_name=user.unit.name if user.unit else None),
        rating=user.rating,
        points=[_point(f, user.rating) for f in facts],
        # "Recurring": seen in at least two sessions.
        mistakes=mistake_items(facts, min_sessions=2),
        stages=stage_rates(facts),
        ai_trust=combine(f.trust for f in facts),
    )


def _change(totals: list[float]) -> float | None:
    if len(totals) < 2:
        return None
    k = min(3, len(totals) // 2)
    return display_int(mean(totals[-k:]) - mean(totals[:k]))


def unit_dashboard(db: Session, unit_id: uuid.UUID) -> UnitDashboardResponse:
    unit = db.get(Unit, unit_id)
    if unit is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Unit not found")
    trainees = list(
        db.scalars(
            select(User)
            .where(User.unit_id == unit.id, User.role == UserRole.TRAINEE)
            .order_by(User.name)
        )
    )
    facts = assessment_facts(db, [t.id for t in trainees])
    by_user: defaultdict[uuid.UUID, list[SessionFacts]] = defaultdict(list)
    for f in facts:
        by_user[f.row.user_id].append(f)

    board = []
    for t in trainees:
        mine = by_user[t.id]
        totals = [f.total for f in mine]
        board.append(
            UnitTraineeRow(
                user_id=t.id,
                name=t.name,
                sessions=len(mine),
                avg_total=_avg_int(totals),
                last_total=display_opt(totals[-1]) if totals else None,
                best_total=display_opt(max(totals)) if totals else None,
                change=_change(totals),
                detection_latency_s=_avg([f.latency_s for f in mine]),
                classification_accuracy=_avg([f.accuracy for f in mine], 3),
                weakest_stage=weakest(stage_rates(mine)),
            )
        )
    # Leaderboard: average total (unrounded, so display ties keep their real order),
    # trainees without sessions last.
    raw_avg = {
        t.id: (mean(f.total for f in by_user[t.id]) if by_user[t.id] else None) for t in trainees
    }
    board.sort(key=lambda r: (raw_avg[r.user_id] is None, -(raw_avg[r.user_id] or 0), r.name))

    completion = []
    member_names = {t.id: t.name for t in trainees}
    for a in unit_assignments(db, unit.id):
        covered = list(member_names) if a.unit_id == unit.id else [a.user_id]
        covered = [u for u in covered if u in member_names]
        done = [u for u in covered if completed_session(db, a, u) is not None]
        srow = db.get_one(ScenarioRow, a.scenario_id)
        completion.append(
            AssignmentCompletion(
                assignment_id=a.id,
                scenario_id=a.scenario_id,
                scenario_code=scenario_code(srow),
                scenario_name=srow.name,
                due_at=a.due_at,
                assigned=len(covered),
                completed=len(done),
                pending=[member_names[u] for u in covered if u not in done],
            )
        )

    rates = stage_rates(facts)
    recent = sorted(facts, key=lambda f: f.ended_at, reverse=True)[:12]
    return UnitDashboardResponse(
        unit=UnitRef(id=unit.id, name=unit.name),
        sessions=len(facts),
        demo_sessions=sum(f.row.is_demo for f in facts),
        avg_total=_avg_int([f.total for f in facts]),
        components=ComponentPct(
            **{
                c: _avg_int([v for f in facts if (v := f.components[c]) is not None])
                for c in PCT_COMPONENTS
            }
        ),
        detection_latency_s=_avg([f.latency_s for f in facts]),
        classification_accuracy=_avg([f.accuracy for f in facts], 3),
        leaderboard=board,
        stages=rates,
        weakest_stage=weakest(rates),
        mistakes=mistake_items(facts),
        assignments=completion,
        recent=[
            UnitSessionRow(
                session_id=f.row.id,
                user_id=f.row.user_id,
                user_name=member_names[f.row.user_id],
                scenario_code=scenario_code(f.scenario_row),
                scenario_name=f.scenario_row.name,
                difficulty=f.scenario.difficulty,
                ended_at=f.ended_at,
                total=display_int(f.total),
                tree_version=f.tree_version,
                is_demo=f.row.is_demo,
            )
            for f in recent
        ],
    )
