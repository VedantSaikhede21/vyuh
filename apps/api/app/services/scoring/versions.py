"""Scoring tree versions: built-in files plus instructor weight versions (decision 121).

A weight edit changes only `componentMax`; every leaf of a changed component is
scaled by new / old (and a `pointsMetric` leaf gets the same `pointsScale`), so the
tree structure, thresholds and penalties stay exactly as in the built-in tree. Each
save is a new immutable row `<base>_w<n>`. Re-scoring is an explicit instructor
action that writes a new score row (SPEC §9.6); nothing is re-scored silently.
"""

import json
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import ScoreRow, ScoringTreeRow, TrainingSession, User
from app.schemas.generated import (
    ErrorCode,
    Score,
    ScoringTreeSummary,
    SessionStatus,
    UpdateWeightsRequest,
)
from app.services.scoring.engine import COMPONENTS
from app.services.scoring.tree import TREE_DIR, Tree, load_tree

#: Allowed weight per edited component (a component at 0 would not be scored at all).
MIN_WEIGHT = 1.0
MAX_WEIGHT = 60.0

_db_trees: dict[str, tuple[Tree, str]] = {}


def builtin_ids() -> list[str]:
    return sorted(p.stem for p in TREE_DIR.glob("*.json"))


def get_tree(db: Session, tree_id: str) -> Tree:
    """A built-in tree from its file, else a stored weight version (immutable, so cached)."""
    if tree_id in builtin_ids():
        return load_tree(tree_id)
    return _stored(db, tree_id)[0]


def base_of(db: Session, tree_id: str) -> str:
    return tree_id if tree_id in builtin_ids() else _stored(db, tree_id)[1]


def _stored(db: Session, tree_id: str) -> tuple[Tree, str]:
    if tree_id not in _db_trees:
        row = db.get(ScoringTreeRow, tree_id)
        if row is None:
            raise ApiError(ErrorCode.NOT_FOUND, f"Unknown scoring tree {tree_id}")
        _db_trees[tree_id] = (Tree.model_validate(row.content), row.base_id)
    return _db_trees[tree_id]


def editable_components(tree: Tree) -> list[str]:
    """Components this tree scores with at least one leaf."""
    maxima = tree.component_max.model_dump()
    used = {leaf.component for leaf in tree.all_leaves() if leaf.component}
    return [c for c in COMPONENTS if c in used and maxima[c] > 0]


def reweighted(tree: Tree, new_max: dict[str, float], new_id: str) -> dict[str, Any]:
    """The tree JSON with `new_max` applied by scaling each changed component's leaves."""
    old_max = tree.component_max.model_dump()
    factor = {c: new_max[c] / old_max[c] for c in COMPONENTS if old_max[c] > 0}
    content = tree.model_dump(mode="json", by_alias=True, exclude_defaults=True)

    def scale(node: Any) -> Any:
        if isinstance(node, list):
            return [scale(n) for n in node]
        if not isinstance(node, dict):
            return node
        out = {k: scale(v) for k, v in node.items()}
        if "leaf" in out and out.get("component") in factor:
            f = factor[out["component"]]
            if f != 1:
                out["points"] = round(out.get("points", 0) * f, 4)
                if "pointsMetric" in out:
                    out["pointsScale"] = round(out.get("pointsScale", 1.0) * f, 6)
                    # The feedback quotes the metric on its own scale ("report 7.0/10");
                    # say it is scaled, or it reads against the new maximum (Phase 4b
                    # tech debt).
                    fb = out.get("feedback")
                    if isinstance(fb, str):
                        out["feedback"] = re.sub(
                            r"(\{" + re.escape(out["pointsMetric"]) + r"[^}]*\})/(\d+)",
                            rf"\1/\2 (scaled by {f:g} for this tree's weights)",
                            fb,
                            count=1,
                        )
        return out

    content["nodes"] = scale(content["nodes"])
    content["id"] = new_id
    content["componentMax"] = {c: round(new_max[c], 4) for c in COMPONENTS}
    return content


def _summary(db: Session, tree: Tree, row: ScoringTreeRow | None) -> ScoringTreeSummary:
    scored = db.scalar(select(func.count()).where(ScoreRow.tree_version == tree.id)) or 0
    creator = db.get(User, row.created_by) if row is not None and row.created_by else None
    return ScoringTreeSummary(
        id=tree.id,
        base_id=row.base_id if row is not None else tree.id,
        derived_from=row.derived_from if row is not None else None,
        description=tree.description,
        component_max=tree.component_max,
        editable=editable_components(tree),
        built_in=row is None,
        created_at=row.created_at if row is not None else None,
        created_by_name=creator.name if creator is not None else None,
        scored_sessions=scored,
    )


def list_trees(db: Session) -> list[ScoringTreeSummary]:
    out = [_summary(db, load_tree(i), None) for i in builtin_ids()]
    rows = db.scalars(select(ScoringTreeRow).order_by(ScoringTreeRow.created_at))
    out += [_summary(db, Tree.model_validate(r.content), r) for r in rows]
    return out


def create_weight_version(
    db: Session, user: User, tree_id: str, body: UpdateWeightsRequest
) -> ScoringTreeSummary:
    tree = get_tree(db, tree_id)
    base = base_of(db, tree_id)
    old = tree.component_max.model_dump()
    new = body.component_max.model_dump()
    editable = set(editable_components(tree))
    problems = []
    for c in COMPONENTS:
        if c in editable:
            if not MIN_WEIGHT <= new[c] <= MAX_WEIGHT:
                problems.append(f"{c}: weight must be {MIN_WEIGHT:.0f}-{MAX_WEIGHT:.0f}")
        elif new[c] != old[c]:
            problems.append(f"{c}: not scored by {tree_id}, so its weight cannot change")
    if not problems and all(new[c] == old[c] for c in COMPONENTS):
        problems.append("No weight changed")
    if problems:
        raise ApiError(ErrorCode.VALIDATION_ERROR, "Weights not saved", {"problems": problems})
    n = db.scalar(select(func.count()).where(ScoringTreeRow.base_id == base)) or 0
    new_id = f"{base}_w{n + 1}"
    content = reweighted(tree, new, new_id)
    if body.note:
        content["description"] = f"{body.note} (weights from {tree_id})"
    else:
        content["description"] = f"Weights edited from {tree_id}; structure of {base}."
    Tree.model_validate(content)  # the scaled tree must still be valid
    row = ScoringTreeRow(
        id=new_id,
        base_id=base,
        derived_from=tree_id,
        content=json.loads(json.dumps(content)),
        created_by=user.id,
        created_at=datetime.now(UTC),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return _summary(db, Tree.model_validate(row.content), row)


def rescore(db: Session, session_id: uuid.UUID, tree_id: str) -> Score:
    """Score a completed session again with `tree_id`; the new row becomes its latest score."""
    # Imported here: sessions imports this module for get_tree.
    from app.services.scenarios import load_scenario
    from app.services.scoring.engine import score_session
    from app.services.sessions import store_score, stored_events, with_derived_fields

    row = db.get(TrainingSession, session_id)
    if row is None:
        raise ApiError(ErrorCode.NOT_FOUND, "Session not found")
    if row.status is not SessionStatus.COMPLETED:
        raise ApiError(
            ErrorCode.SESSION_NOT_ACTIVE,
            "Only completed sessions can be re-scored",
            {"status": row.status.value},
        )
    scenario = load_scenario(db.get_one(ScenarioRow, row.scenario_id))
    tree = get_tree(db, tree_id)
    if base_of(db, tree_id) != base_of(db, scenario.scoring_tree_id):
        raise ApiError(
            ErrorCode.VALIDATION_ERROR,
            f"{tree_id} does not share the structure of {scenario.scoring_tree_id}",
            {"scenarioTree": scenario.scoring_tree_id},
        )
    exists = db.scalar(
        select(func.count()).where(ScoreRow.session_id == row.id, ScoreRow.tree_version == tree_id)
    )
    if exists:
        raise ApiError(
            ErrorCode.VALIDATION_ERROR, f"This session already has a score from {tree_id}"
        )
    score = score_session(scenario, stored_events(db, row.id), tree)
    store_score(db, row.id, score)
    db.commit()
    return with_derived_fields(db, score, scenario, row)
