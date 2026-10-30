"""User study kit (Part 6I): real participants under codes, never demo data.

Participants are accounts named only by a code (P001), in their own unit. The
sequence S01 → S15 → S04 is assigned once; each Assessment run counts, in order.
Rows carry the code, scenario and results and no names, e-mail or addresses.
"""

import csv
import io

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import local_auth_id
from app.models import Assignment, Scenario, Unit, User
from app.schemas.generated import (
    KillChainStage,
    StudyResultsResponse,
    StudyRow,
    UserRole,
)
from app.services.analytics.trends import assessment_facts

STUDY_UNIT = "User Study"
STUDY_DOMAIN = "@study"
SEQUENCE = ("S01", "S15", "S04")
STAGES = [s.value for s in KillChainStage]


def study_unit(db: Session) -> Unit:
    unit = db.scalar(select(Unit).where(Unit.name == STUDY_UNIT))
    if unit is None:
        unit = Unit(name=STUDY_UNIT)
        db.add(unit)
        db.flush()
    return unit


def enrol(db: Session, count: int) -> list[str]:
    """Add participants up to `count` in total; returns every code."""
    unit = study_unit(db)
    existing = set(db.scalars(select(User.name).where(User.unit_id == unit.id)))
    codes = [f"P{i:03d}" for i in range(1, count + 1)]
    for code in codes:
        if code in existing:
            continue
        email = f"{code.lower()}{STUDY_DOMAIN}"
        db.add(
            User(
                auth_id=local_auth_id(email),
                name=code,
                email=email,
                role=UserRole.TRAINEE,
                unit_id=unit.id,
            )
        )
    assigned = set(db.scalars(select(Assignment.scenario_id).where(Assignment.unit_id == unit.id)))
    for row in db.scalars(select(Scenario).where(Scenario.code.in_(SEQUENCE))):
        if row.id not in assigned:
            db.add(Assignment(scenario_id=row.id, unit_id=unit.id))
    db.commit()
    return codes


def study_results(db: Session) -> StudyResultsResponse:
    unit = db.scalar(select(Unit).where(Unit.name == STUDY_UNIT))
    if unit is None:
        return StudyResultsResponse(participants=0, rows=[])
    users = list(db.scalars(select(User).where(User.unit_id == unit.id).order_by(User.name)))
    codes = {u.id: u.name for u in users}
    runs: dict[str, int] = {}
    rows: list[StudyRow] = []
    for f in assessment_facts(db, list(codes)):
        if f.row.is_demo:
            continue
        code = codes[f.row.user_id]
        runs[code] = runs.get(code, 0) + 1
        stages = {
            s: round(100 * f.stage_ok[s] / f.stage_total[s]) if f.stage_total[s] else None
            for s in STAGES
        }
        rows.append(
            StudyRow(
                participant=code,
                run=runs[code],
                scenario=f.scenario_row.code or f.scenario_row.name,
                total=f.total,
                detection_latency_s=f.latency_s,
                exact_classification=f.accuracy,
                stage_pct=stages,
            )
        )
    return StudyResultsResponse(participants=len(runs), rows=rows)


def results_csv(results: StudyResultsResponse) -> str:
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(
        [
            "participant",
            "run",
            "scenario",
            "total",
            "detection_latency_s",
            "exact_classification",
            *[f"stage_{s.lower()}_pct" for s in STAGES],
        ]
    )
    for r in results.rows:
        writer.writerow(
            [
                r.participant,
                r.run,
                r.scenario,
                r.total,
                r.detection_latency_s,
                r.exact_classification,
                *[r.stage_pct.get(s) for s in STAGES],
            ]
        )
    return out.getvalue()
