"""Scenario builder (SPEC §12 Phase 4; decision 124): POST /scenarios/preview and POST /scenarios.

The instructor fills a form over the generator's request and may fix the asset
position and draw extra NO_KINETIC zones. The generator builds the scenario around
them; static checks run before and after. Saved as kind AUTHORED (tag `authored`),
listed in the library and assignable.
"""

import hashlib
import json

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import Scenario as ScenarioRow
from app.models import User
from app.schemas.generated import (
    AuthorPreviewResponse,
    AuthorScenarioRequest,
    AuthorScenarioResponse,
    ErrorCode,
    Scenario,
    ScenarioKind,
)
from app.services.generator import SCORING_TREE_ID, GenerationError, generate
from app.services.generator.siting import _flat
from app.services.scenarios import load_scenario, scenario_rule_violations
from app.services.scoring.versions import base_of
from app.services.terrain import load_terrain

AUTHORED_TAG = "authored"
#: The asset stays this far inside the map edge, so threats have room to approach.
ASSET_EDGE_M = 2500.0
#: Zone vertices stay inside the map edge.
ZONE_EDGE_M = 100.0
ZONE_MIN_AREA_M2 = 10_000.0  # 100 m by 100 m
ZONE_MAX_AREA_M2 = 16_000_000.0  # 4 km by 4 km

Point = tuple[float, float]


def _area(poly: list[Point]) -> float:
    return abs(
        sum(a[0] * b[1] - b[0] * a[1] for a, b in zip(poly, poly[1:] + poly[:1], strict=True)) / 2
    )


def _cross(o: Point, a: Point, b: Point) -> float:
    return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])


def _segments_cross(p1: Point, p2: Point, q1: Point, q2: Point) -> bool:
    d1, d2 = _cross(q1, q2, p1), _cross(q1, q2, p2)
    d3, d4 = _cross(p1, p2, q1), _cross(p1, p2, q2)
    return d1 * d2 < 0 and d3 * d4 < 0


def self_intersects(poly: list[Point]) -> bool:
    n = len(poly)
    edges = [(poly[i], poly[(i + 1) % n]) for i in range(n)]
    for i in range(n):
        for j in range(i + 1, n):
            if j == i + 1 or (i == 0 and j == n - 1):
                continue  # neighbours share a vertex
            if _segments_cross(*edges[i], *edges[j]):
                return True
    return False


def point_in_polygon(x: float, z: float, poly: list[Point]) -> bool:
    inside = False
    for (x1, z1), (x2, z2) in zip(poly, poly[1:] + poly[:1], strict=True):
        if (z1 > z) != (z2 > z) and x < x1 + (z - z1) * (x2 - x1) / (z2 - z1):
            inside = not inside
    return inside


def request_problems(db: Session, body: AuthorScenarioRequest) -> list[str]:
    """Checks on what the instructor entered, before anything is generated."""
    try:
        terrain = load_terrain(body.generate.terrain_preset)
    except ApiError:
        return [f"Unknown terrain preset {body.generate.terrain_preset}"]
    half = terrain.size_m / 2
    out: list[str] = []
    if body.asset_xz is not None:
        ax, az = body.asset_xz
        limit = half - ASSET_EDGE_M
        if abs(ax) > limit or abs(az) > limit:
            out.append(
                f"Asset must be at least {ASSET_EDGE_M / 1000:.1f} km inside the map edge, "
                "so threats have room to approach"
            )
        elif not _flat(terrain, ax, az):
            out.append("Asset is on a steep slope; place it on level ground")
    names = [z.name.strip().lower() for z in body.no_kinetic_zones]
    for i, zone in enumerate(body.no_kinetic_zones):
        label = f"Zone {i + 1} ({zone.name})"
        poly = [(float(p[0]), float(p[1])) for p in zone.polygon]
        if any(abs(x) > half - ZONE_EDGE_M or abs(z) > half - ZONE_EDGE_M for x, z in poly):
            out.append(f"{label}: a corner is outside the map")
        area = _area(poly)
        if area < ZONE_MIN_AREA_M2:
            out.append(f"{label}: too small ({area / 1e6:.3f} km², minimum 0.01 km²)")
        elif area > ZONE_MAX_AREA_M2:
            out.append(f"{label}: too large ({area / 1e6:.1f} km², maximum 16 km²)")
        if self_intersects(poly):
            out.append(f"{label}: edges cross; draw the outline in order")
        if body.asset_xz is not None and point_in_polygon(*body.asset_xz, poly):
            out.append(f"{label}: covers the asset, so it could never be defended kinetically")
        if names.count(zone.name.strip().lower()) > 1 and names.index(names[i]) != i:
            out.append(f"{label}: another zone has the same name")
    if body.scoring_tree_id is not None:
        try:
            base: str | None = base_of(db, body.scoring_tree_id)
        except ApiError:
            base = None
        if base != SCORING_TREE_ID:
            out.append(f"Scoring tree {body.scoring_tree_id} is not a version of {SCORING_TREE_ID}")
    return out


def scenario_problems(scenario: dict) -> list[str]:
    """Checks on the generated result."""
    out = scenario_rule_violations(Scenario.model_validate(scenario))
    for asset in scenario["assets"]:
        for zone in scenario["zones"]:
            if zone["kind"] == "NO_KINETIC" and point_in_polygon(
                asset["x"], asset["z"], [tuple(p) for p in zone["polygon"]]
            ):
                out.append(
                    f"The asset is inside no-kinetic zone {zone['id']} "
                    f"({zone.get('name', 'zone')}); move the asset"
                )
    if not any(c["isThreat"] for c in scenario["contacts"]):
        out.append("The scenario has no threats")
    return out


def _content_id(body: AuthorScenarioRequest) -> str:
    raw = json.dumps(body.model_dump(mode="json", by_alias=True, exclude_none=True), sort_keys=True)
    return "AUT-" + hashlib.sha256(raw.encode()).hexdigest()[:12]


def _build(db: Session, body: AuthorScenarioRequest) -> tuple[dict | None, list[str]]:
    problems = request_problems(db, body)
    if problems:
        return None, problems
    extra = [
        ([(float(p[0]), float(p[1])) for p in z.polygon], z.name.strip())
        for z in body.no_kinetic_zones
    ]
    asset = (float(body.asset_xz[0]), float(body.asset_xz[1])) if body.asset_xz else None
    try:
        scenario = generate(body.generate, asset_xz=asset, extra_no_kinetic=extra)
    except GenerationError as err:
        detail = "; ".join(err.details.get("problems", [])[:3]) if err.details else ""
        return None, [f"The generator could not build this: {err.message}. {detail}".strip()]
    scenario["id"] = _content_id(body)
    scenario["name"] = body.name.strip()
    if body.note and body.note.strip():
        scenario["briefing"] += f"\n## Instructor note\n{body.note.strip()}"
    if body.scoring_tree_id:
        scenario["scoringTreeId"] = body.scoring_tree_id
    return scenario, scenario_problems(scenario)


def _mix(scenario: dict | None) -> tuple[dict[str, int], int]:
    if scenario is None:
        return {}, 0
    mix: dict[str, int] = {}
    for c in scenario["contacts"]:
        if c["isThreat"]:
            mix[c["class"]] = mix.get(c["class"], 0) + 1
    return dict(sorted(mix.items())), sum(not c["isThreat"] for c in scenario["contacts"])


def preview(db: Session, body: AuthorScenarioRequest) -> AuthorPreviewResponse:
    scenario, problems = _build(db, body)
    mix, others = _mix(scenario)
    return AuthorPreviewResponse.model_validate(
        {
            "scenario": scenario,
            "problems": problems,
            "threatMix": mix,
            "nonThreats": others,
        }
    )


def save(db: Session, user: User, body: AuthorScenarioRequest) -> AuthorScenarioResponse:
    scenario, problems = _build(db, body)
    if scenario is None or problems:
        raise ApiError(
            ErrorCode.VALIDATION_ERROR, "The scenario failed its checks", {"problems": problems}
        )
    row = db.scalar(
        select(ScenarioRow).where(
            ScenarioRow.kind == ScenarioKind.AUTHORED,
            ScenarioRow.content["id"].astext == scenario["id"],
        )
    )
    if row is None:
        row = ScenarioRow(
            code=None,
            name=scenario["name"],
            kind=ScenarioKind.AUTHORED,
            seed=scenario["seed"],
            difficulty=scenario["difficulty"],
            tags=[AUTHORED_TAG],
            request=body.model_dump(mode="json", by_alias=True, exclude_none=True),
            content=scenario,
            schema_version=scenario["schemaVersion"],
            created_by=user.id,
        )
        db.add(row)
        db.commit()
        db.refresh(row)
    return AuthorScenarioResponse(
        scenario_id=row.id, kind=ScenarioKind.AUTHORED, scenario=load_scenario(row)
    )
