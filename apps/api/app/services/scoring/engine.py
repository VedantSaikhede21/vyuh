"""Session scoring: metrics → decision tree → Score (SPEC §9).

Each component is the mean, over the threat contacts scored for that component,
of the points each earned (so it never exceeds the tree's max). A leaf with
`excluded` drops the contact from every component; `excludeComponents` drops it
from only those (per-component denominators, decision 56). The total is scaled
to 100 over the components the tree scores (max > 0), then session-level
adjustments (penalties / bonuses) are added and the result clamped to 0..100.
"""

from typing import Any

from app.schemas.generated import (
    ClassificationResult,
    ContactClass,
    ContactOutcome,
    Penalty,
    PerContactMetrics,
    ResponseKind,
    Scenario,
    Score,
    ScoreComponents,
)
from app.services.scoring.metrics import contact_metrics
from app.services.scoring.tree import Tree, evaluate, load_tree, render_feedback

COMPONENTS = ("detection", "classification", "decision", "report", "efficiency")


def _per_contact(
    m: dict[str, Any], points: float, leaves: list[str], feedback: list[str]
) -> PerContactMetrics:
    """Optional metrics that are None are left unset, so they are omitted (not null) in JSON."""
    fired = m["responsesFired"] > 0
    optional: dict[str, Any] = {
        "first_detectable_t_ms": m["firstDetectableTMs"],
        "trainee_detected_t_ms": m["traineeDetectedTMs"],
        "detection_latency_s": m["detectionLatencyS"],
        "classified_as": m["classifiedAs"] and ContactClass(m["classifiedAs"]),
        "classification_correct": m["classificationCorrect"]
        and ClassificationResult(m["classificationCorrect"]),
        "identifiable_when_classified": m["identifiableWhenClassified"],
        "dropped_t_ms": m.get("droppedTMs"),
        # Threat: an effector actually fired. Non-threat: left alone (EW on a bird is not).
        "response_appropriate": (
            fired if m["isThreat"] else m["outcome"] == "IGNORED_OK" and not m.get("ewOnBird")
        ),
    }
    return PerContactMetrics(
        contact_id=m["contactId"],
        is_threat=m["isThreat"],
        track_ids=m["trackIds"],
        responses=[ResponseKind(r) for r in m["responses"]],
        outcome=ContactOutcome(m["outcome"]),
        points=points,
        leaves=leaves,
        feedback=feedback,
        **{k: v for k, v in optional.items() if v is not None},
    )


def score_session(
    scenario: Scenario, events: list[dict[str, Any]], tree: Tree | None = None
) -> Score:
    tree = tree or load_tree(scenario.scoring_tree_id)
    maxima = tree.component_max.model_dump()
    totals = dict.fromkeys(COMPONENTS, 0.0)
    counts = dict.fromkeys(COMPONENTS, 0)
    scored_threats = 0
    penalties: list[Penalty] = []
    per_contact: list[PerContactMetrics] = []

    for m in contact_metrics(scenario, events):
        leaves = evaluate(tree, m)
        earned = dict.fromkeys(COMPONENTS, 0.0)
        adjust = 0.0
        for leaf in leaves:
            if leaf.component:
                earned[leaf.component] += leaf.points
            if leaf.adjust is not None:
                adjust += leaf.adjust
                penalties.append(
                    Penalty(
                        code=leaf.leaf,
                        points=leaf.adjust,
                        contact_id=m["contactId"],
                        feedback=render_feedback(leaf.feedback, m),
                    )
                )
        excluded = any(leaf.excluded for leaf in leaves)
        partial = {c for leaf in leaves for c in leaf.exclude_components}
        if m["isThreat"] and not excluded:
            scored_threats += 1
            for c in COMPONENTS:
                if c not in partial:
                    totals[c] += earned[c]
                    counts[c] += 1
        per_contact.append(
            _per_contact(
                m,
                sum(earned.values()) + adjust,
                [leaf.leaf for leaf in leaves],
                [render_feedback(leaf.feedback, m) for leaf in leaves],
            )
        )

    components = {
        c: round(totals[c] / counts[c], 2) if counts[c] else float(maxima[c]) for c in COMPONENTS
    }
    possible = sum(v for v in maxima.values() if v > 0)
    base = 100 * sum(components[c] for c in COMPONENTS if maxima[c] > 0) / possible
    adjustments = sum(p.points for p in penalties if not p.unavoidable)
    total = round(min(max(base + adjustments, 0.0), 100.0), 1)

    outcomes = [p.outcome.value for p in per_contact if p.outcome]
    return Score(
        total=total,
        components=ScoreComponents(**components),
        component_max=tree.component_max,
        penalties=penalties,
        per_contact=per_contact,
        metrics={
            "threats": sum(c.is_threat for c in scenario.contacts),
            "scoredThreats": scored_threats,
            "neutralised": outcomes.count("NEUTRALISED"),
            "leaked": outcomes.count("LEAKED"),
            "eventCount": len(events),
        },
        tree_version=tree.id,
    )
