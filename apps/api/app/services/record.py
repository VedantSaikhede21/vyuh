"""Service record: representative training levels and endorsements (SPEC §9.7, decision 155).

Computed from completed Assessment sessions only, using each session's latest score
row and kill chain (`SessionFacts`). The rules are data, generated from
`RECORD_V1` in packages/shared; this module only knows how each criterion kind and
endorsement code is counted.
"""

import json
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import UTC, datetime
from functools import lru_cache
from pathlib import Path
from statistics import mean
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import LevelSignoff, User
from app.schemas.generated import (
    CriterionStatus,
    EndorsementStatus,
    ErrorCode,
    KillChainStatus,
    LevelState,
    LevelStatus,
    ServiceRecordResponse,
    TrainingLevel,
    UnitRef,
    UserRole,
)
from app.schemas.generated import (
    LevelSignoff as LevelSignoffOut,
)
from app.services.access import require_user
from app.services.analytics.trends import SessionFacts, assessment_facts
from app.services.display import display_int, display_opt
from app.services.scoring import versions

RULES_FILE = Path(__file__).resolve().parents[1] / "seed" / "generated" / "record_v1.json"

#: Built-in trees that score ROE attempts (default_v4, decision 116) — for ROE discipline.
ROE_TREES = frozenset({"default_v4"})
ROE_LEAVES = frozenset({"ROE_VIOLATION_ATTEMPT", "NO_KINETIC_VIOLATION_ATTEMPT"})
INEFFECTIVE_EW_LEAVES = frozenset({"DECISION_EW_LESSON", "DECISION_INEFFECTIVE_EW"})
SILENT_THREAT_LINKS = frozenset({"FIBRE_OPTIC", "AUTONOMOUS_GNSS"})


@lru_cache(maxsize=1)
def rules() -> dict[str, Any]:
    """`record_v1`, generated from packages/shared (CI no-diff check keeps it in sync)."""
    data: dict[str, Any] = json.loads(RULES_FILE.read_text("utf-8"))
    return data


def _val(x: Any) -> Any:
    """Generated root models (enums, constrained floats) carry their value in `.root`."""
    return getattr(x, "root", x)


def _leaves(p: Any) -> set[str]:
    return {_val(x) for x in p.leaves}


# ---- Session-level facts the rules read ------------------------------------------------


@dataclass
class _Session:
    facts: SessionFacts
    total: int
    difficulty: int
    night: bool
    #: Threat-contact kill-chain counts per stage (NOT_APPLICABLE excluded).
    stage_ok: Counter[str]
    stage_total: Counter[str]
    roe_scored: bool

    @property
    def id(self) -> uuid.UUID:
        return self.facts.row.id


def session_view(db: Session, f: SessionFacts) -> _Session:
    ok: Counter[str] = Counter()
    total: Counter[str] = Counter()
    for chain in f.chains:
        if not chain.is_threat:
            continue
        for step in chain.stages:
            if step.status is KillChainStatus.NOT_APPLICABLE:
                continue
            total[step.stage.value] += 1
            if step.status is KillChainStatus.OK:
                ok[step.stage.value] += 1
    return _Session(
        facts=f,
        total=display_int(f.total),
        difficulty=f.scenario.difficulty,
        night=f.scenario.environment.is_night,
        stage_ok=ok,
        stage_total=total,
        roe_scored=versions.base_of(db, f.tree_version) in ROE_TREES,
    )


def _window(sessions: list[_Session], crit: dict[str, Any]) -> list[_Session]:
    """The most recent `window` sessions at `minDifficulty` or above (oldest first)."""
    sel = [s for s in sessions if s.difficulty >= crit.get("minDifficulty", 1)]
    n = crit.get("window")
    return sel[-n:] if n else sel


# ---- Criteria -----------------------------------------------------------------------------


def _criterion(crit: dict[str, Any], sessions: list[_Session], rating: int) -> CriterionStatus:
    kind = crit["kind"]
    base = {"id": crit["id"], "label": crit["label"]}
    if kind == "SESSIONS":
        count = sum(
            1
            for s in sessions
            if s.difficulty >= crit.get("minDifficulty", 1)
            and s.total >= crit.get("minTotal", 0)
            and (not crit.get("night") or s.night)
        )
        return CriterionStatus(
            **base,
            value=count,
            target=crit["min"],
            unit="COUNT",
            comparison="AT_LEAST",
            met=count >= crit["min"],
        )
    if kind == "STAGE_OK":
        w = _window(sessions, crit)
        ok = sum(s.stage_ok[crit["stage"]] for s in w)
        total = sum(s.stage_total[crit["stage"]] for s in w)
        return CriterionStatus(
            **base,
            value=display_int(100 * ok / total) if total else None,
            target=display_int(100 * crit["minRate"]),
            unit="PCT",
            comparison="AT_LEAST",
            met=total > 0 and ok / total >= crit["minRate"],
        )
    if kind == "MEAN_LATENCY":
        w = _window(sessions, crit)
        lat = [
            p.detection_latency_s
            for s in w
            for p in s.facts.score.per_contact
            if p.is_threat and p.detection_latency_s is not None
        ]
        value = round(mean(lat), 1) if lat else None
        return CriterionStatus(
            **base,
            value=value,
            target=crit["maxS"],
            unit="S",
            comparison="AT_MOST",
            met=value is not None and value <= crit["maxS"],
        )
    if kind == "NO_LEAVES":
        w = _window(sessions, crit)
        bad = set(crit["leaves"])
        count = sum(len(_leaves(p) & bad) for s in w for p in s.facts.score.per_contact)
        return CriterionStatus(
            **base,
            value=count if w else None,
            target=0,
            unit="COUNT",
            comparison="AT_MOST",
            met=bool(w) and count == 0,
        )
    if kind == "COMPONENT_PCT":
        comp = crit["component"]
        scoring = [
            s
            for s in sessions
            if s.difficulty >= crit.get("minDifficulty", 1)
            and s.facts.components.get(comp) is not None
        ]
        w = scoring[-crit["window"] :] if crit.get("window") else scoring
        pct = [s.facts.components[comp] for s in w]
        value = display_opt(mean(pct)) if pct else None
        return CriterionStatus(
            **base,
            value=value,
            target=crit["minPct"],
            unit="PCT",
            comparison="AT_LEAST",
            met=bool(pct) and mean(pct) >= crit["minPct"],
        )
    if kind == "RATING":
        return CriterionStatus(
            **base,
            value=rating,
            target=crit["min"],
            unit="RATING",
            comparison="AT_LEAST",
            met=rating >= crit["min"],
        )
    raise ValueError(f"unknown criterion kind {kind}")  # pragma: no cover - schema-checked


# ---- Endorsements ---------------------------------------------------------------------------


def _night_ops(s: _Session, p: dict[str, float]) -> bool:
    leaked = any(
        c.is_threat and c.outcome is not None and _val(c.outcome) == "LEAKED"
        for c in s.facts.score.per_contact
    )
    return s.night and s.total >= p["minTotal"] and not leaked


def _swarm(s: _Session, p: dict[str, float]) -> bool:
    outcome = {c.contact_id: _val(c.outcome) for c in s.facts.score.per_contact}
    groups: dict[str, list[str]] = {}
    for c in s.facts.scenario.contacts:
        if c.is_threat and c.group_id:
            groups.setdefault(c.group_id, []).append(c.id)
    return any(
        len(ids) >= p["minSwarm"] and all(outcome.get(i) == "NEUTRALISED" for i in ids)
        for ids in groups.values()
    )


def _silent_link(s: _Session, p: dict[str, float]) -> bool:
    link = {c.id: _val(c.control_link) for c in s.facts.scenario.contacts}
    return any(
        c.is_threat
        and link.get(c.contact_id) in SILENT_THREAT_LINKS
        and _val(c.outcome) == "NEUTRALISED"
        and not (_leaves(c) & INEFFECTIVE_EW_LEAVES)
        for c in s.facts.score.per_contact
    )


def _discrimination(s: _Session, p: dict[str, float]) -> bool:
    pcs = s.facts.score.per_contact
    non_threats = [c for c in pcs if not c.is_threat]
    threats = [c for c in pcs if c.is_threat and "NOT_DETECTABLE" not in _leaves(c)]
    penalties = set(rules()["nonThreatPenaltyLeaves"])
    return (
        len(non_threats) >= p["minNonThreats"]
        and bool(threats)
        and all(
            c.classification_correct is not None and _val(c.classification_correct) == "EXACT"
            for c in threats
        )
        and not any(_leaves(c) & penalties for c in pcs)
    )


def _reporting(s: _Session, p: dict[str, float]) -> bool:
    pct = s.facts.components.get("report")
    return pct is not None and pct >= p["minPct"]


def _calibrated(s: _Session, p: dict[str, float]) -> bool:
    t = s.facts.trust
    return t.shown_wrong >= 1 and t.rejected_wrong == t.shown_wrong


#: Single-session endorsements: earned by the first session that passes.
SINGLE = {
    "NIGHT_OPS": _night_ops,
    "SWARM": _swarm,
    "SILENT_LINK": _silent_link,
    "DISCRIMINATION": _discrimination,
}
#: Earned once `sessions` sessions pass (not necessarily in a row).
COUNTED = {"REPORTING": _reporting, "CALIBRATED_TRUST": _calibrated}


def _endorsement(rule: dict[str, Any], sessions: list[_Session]) -> EndorsementStatus:
    code, params = rule["code"], rule["params"]
    earned_by: _Session | None = None
    progress: dict[str, int] | None = None
    if code in SINGLE:
        earned_by = next((s for s in sessions if SINGLE[code](s, params)), None)
    elif code in COUNTED:
        need = int(params["sessions"])
        passing = [s for s in sessions if COUNTED[code](s, params)]
        earned_by = passing[need - 1] if len(passing) >= need else None
        progress = {"count": min(len(passing), need), "of": need}
    elif code == "ROE_DISCIPLINE":
        # Consecutive sessions on ROE-scoring trees with no ROE / no-kinetic attempt.
        need = int(params["sessions"])
        streak = best = 0
        for s in (x for x in sessions if x.roe_scored):
            clean = not any(_leaves(c) & ROE_LEAVES for c in s.facts.score.per_contact)
            streak = streak + 1 if clean else 0
            best = max(best, streak)
            if streak >= need and earned_by is None:
                earned_by = s
        progress = {"count": min(best, need), "of": need}
    else:  # pragma: no cover - the ruleset is schema-checked
        raise ValueError(f"unknown endorsement {code}")
    return EndorsementStatus(
        code=code,
        name=rule["name"],
        description=rule["description"],
        earned=earned_by is not None,
        session_id=earned_by.id if earned_by else None,
        scenario_name=earned_by.facts.scenario_row.name if earned_by else None,
        earned_at=earned_by.facts.ended_at if earned_by else None,
        progress=progress,
    )


# ---- Record ---------------------------------------------------------------------------------


def _is_staff(user: User) -> bool:
    return user.role in (UserRole.INSTRUCTOR, UserRole.ADMIN)


def _may_sign(viewer: User, subject: User, rule: dict[str, Any]) -> bool:
    if viewer.id == subject.id or not _is_staff(viewer):
        return False
    return rule["signoffBy"] == "STAFF" or viewer.role is UserRole.ADMIN


def build_record(
    db: Session, subject: User, viewer: User | None = None, facts: list[SessionFacts] | None = None
) -> ServiceRecordResponse:
    """The record of `subject`; `viewer` decides which levels may be signed off now."""
    facts = assessment_facts(db, [subject.id]) if facts is None else facts
    sessions = [session_view(db, f) for f in facts]
    signoffs = {
        _val(r.level): r
        for r in db.scalars(select(LevelSignoff).where(LevelSignoff.user_id == subject.id))
    }
    signer_names = {
        u.id: u.name
        for u in db.scalars(
            select(User).where(User.id.in_([r.signed_by for r in signoffs.values()]))
        )
    }
    levels: list[LevelStatus] = []
    can_sign: list[TrainingLevel] = []
    prev_qualified = True
    for rule in rules()["levels"]:
        criteria = [_criterion(c, sessions, subject.rating) for c in rule["criteria"]]
        met = all(c.met for c in criteria)
        signed = signoffs.get(rule["level"])
        if signed is not None:
            state = LevelState.QUALIFIED
        elif prev_qualified:
            state = LevelState.IN_PROGRESS
        else:
            state = LevelState.LOCKED
        levels.append(
            LevelStatus(
                level=rule["level"],
                name=rule["name"],
                state=state,
                criteria_met=met,
                review_due=state is LevelState.QUALIFIED and not met,
                signoff_by=rule["signoffBy"],
                signoff=LevelSignoffOut(
                    by_name=signer_names.get(signed.signed_by, "Former instructor")
                    if signed.signed_by
                    else "Former instructor",
                    at=signed.created_at,
                    is_demo=signed.is_demo,
                )
                if signed
                else None,
                criteria=criteria,
            )
        )
        if (
            viewer is not None
            and state is LevelState.IN_PROGRESS
            and met
            and _may_sign(viewer, subject, rule)
        ):
            can_sign.append(TrainingLevel(rule["level"]))
        prev_qualified = state is LevelState.QUALIFIED
    return ServiceRecordResponse(
        user={
            "id": subject.id,
            "name": subject.name,
            "unit": UnitRef(id=subject.unit.id, name=subject.unit.name) if subject.unit else None,
        },
        ruleset=rules()["id"],
        rating=subject.rating,
        assessments=len(facts),
        demo_assessments=sum(1 for f in facts if f.row.is_demo),
        levels=levels,
        endorsements=[_endorsement(r, sessions) for r in rules()["endorsements"]],
        can_sign_off=can_sign,
    )


def _subject(db: Session, viewer: User, user_id: uuid.UUID) -> User:
    if viewer.id != user_id and not _is_staff(viewer):
        raise ApiError(ErrorCode.FORBIDDEN, "A service record is visible to its owner and staff")
    subject = db.get(User, user_id)
    if subject is None:
        raise ApiError(ErrorCode.NOT_FOUND, "User not found")
    require_user(viewer, subject)
    return subject


def get_record(db: Session, viewer: User, user_id: uuid.UUID) -> ServiceRecordResponse:
    return build_record(db, _subject(db, viewer, user_id), viewer)


def sign_off(
    db: Session,
    viewer: User,
    user_id: uuid.UUID,
    level: TrainingLevel,
    *,
    is_demo: bool = False,
) -> ServiceRecordResponse:
    """Sign off `level` for `user_id`: staff only, never one's own record, only while the
    criteria are met (a snapshot of them is stored). Instructor needs an admin."""
    subject = _subject(db, viewer, user_id)
    if viewer.id == subject.id:
        raise ApiError(ErrorCode.FORBIDDEN, "You cannot sign off your own record")
    rule = next(r for r in rules()["levels"] if r["level"] == _val(level))
    if not _may_sign(viewer, subject, rule):
        raise ApiError(
            ErrorCode.FORBIDDEN,
            "Only an admin can sign off this level"
            if _is_staff(viewer)
            else "Only instructors and admins sign off levels",
        )
    record = build_record(db, subject, viewer)
    status = next(lv for lv in record.levels if _val(lv.level) == _val(level))
    if status.state is not LevelState.IN_PROGRESS or not status.criteria_met:
        reason = (
            "ALREADY_QUALIFIED"
            if status.state is LevelState.QUALIFIED
            else "LOCKED"
            if status.state is LevelState.LOCKED
            else "CRITERIA_NOT_MET"
        )
        raise ApiError(
            ErrorCode.VALIDATION_ERROR,
            {
                "ALREADY_QUALIFIED": "This level is already signed off",
                "LOCKED": "The level below must be qualified first",
                "CRITERIA_NOT_MET": "The criteria for this level are not all met",
            }[reason],
            {"reason": reason},
        )
    db.add(
        LevelSignoff(
            user_id=subject.id,
            level=_val(level),
            ruleset=rules()["id"],
            signed_by=viewer.id,
            criteria=[c.model_dump(mode="json", by_alias=True) for c in status.criteria],
            is_demo=is_demo,
            created_at=datetime.now(UTC),
        )
    )
    db.commit()
    return build_record(db, subject, viewer)
