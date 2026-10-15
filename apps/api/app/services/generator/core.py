"""Procedural scenario generator (SPEC §7, §7.1; requirements 3a.1; decision 74).

`generate(GenerateRequest) -> dict` is a pure function of the request and the
terrain files: the same request gives byte-identical JSON (`canonical_json`).
Every part draws from its own named sub-stream (streams.py), and every planned
contact group has a stable slot key, so regenerating one group (bounded retries
after a failed static check) or trimming another never shifts the rest.
"""

import hashlib
import json
import math
import random
from dataclasses import dataclass, field
from typing import Any

from app.core.errors import ApiError
from app.schemas.generated import ErrorCode, GenerateRequest, Scenario
from app.services.generator import behaviours as bh
from app.services.generator import contacts as cs
from app.services.generator.briefing import briefing, effector_line
from app.services.generator.difficulty import (
    BIRD_BUDGET,
    ENTITY_CAP,
    FIRST_TRACK_MAX_DIFFICULTY,
    LEVELS,
    Level,
    ammo_for,
)
from app.services.generator.environment import (
    NIGHT_SUN_EL_DEG,
    pick_date,
    pick_time,
    weather_for,
)
from app.services.generator.routes import (
    ROUTE_RADIUS_FACTOR,
    Point,
    bearing_of,
    bearing_point,
    fit_bearing,
    inside,
    masked_route,
    pick_axes,
)
from app.services.generator.siting import Site, effectors, site
from app.services.generator.static_checks import contact_problems
from app.services.generator.streams import stream, uniform
from app.services.generator.visibility import FINE_STEP_M, GRID_N, exposure_grid, visible
from app.services.scenarios import scenario_rule_violations
from app.services.terrain import Terrain, load_terrain

GENERATOR_VERSION = 1
SCORING_TREE_ID = "default_v3"
SCHEMA_VERSION = 1
#: Attempts per contact group before giving up (deterministic attempt sub-streams).
MAX_ATTEMPTS = 8
#: First-spawn window per difficulty (s): later threats arrive while earlier ones are live.
SPAWN_WINDOW_S = {1: (5, 15), 2: (5, 60), 3: (5, 90), 4: (5, 120), 5: (5, 90)}
#: D1-D2: the first single threat spawns in this window (first track within ~30 s).
FIRST_SPAWN_S = (0.0, 3.0)
#: Auto duration: last threat's critical point + this, rounded up to 30 s, clamped.
DURATION_TAIL_S = 60
DURATION_RANGE_S = (180, 900)
#: Low threats (AGL ≤ this) from D3 take a terrain-masked route.
MASK_AGL_M = 40.0
#: Swarm followers: lateral spacing per rank (m) and height above the leader (m).
SWARM_SPACING_M = (20.0, 40.0)
SWARM_AGL_JITTER_M = 5.0
#: A decoy orbit must be in view; its axis turns in DECOY_STEP_DEG steps until it is.
DECOY_STEP_DEG = 20
#: Behaviour weights for single threats at D3+ by time band.
SINGLE_WEIGHTS = {
    "NIGHT": (("ATTACK_RUN", 0.4), ("SMUGGLING_DROP", 0.35), ("RECON_LOITER", 0.25)),
    "OTHER": (("ATTACK_RUN", 0.5), ("RECON_LOITER", 0.3), ("SMUGGLING_DROP", 0.2)),
}
FALSE_WEIGHTS = {
    2: (("BIRD_FLOCK", 0.5), ("TRANSIT", 0.5)),
    3: (("BIRD_FLOCK", 0.4), ("TRANSIT", 0.3), ("FRIENDLY_PATROL", 0.3)),
    4: (("BIRD_FLOCK", 0.4), ("TRANSIT", 0.3), ("FRIENDLY_PATROL", 0.3)),
    5: (("BIRD_FLOCK", 0.4), ("TRANSIT", 0.25), ("FRIENDLY_PATROL", 0.25), ("HELICOPTER", 0.1)),
}
MAX_FRIENDLY_PATROLS = 2
FLOCK_SIZE = (3, 5)
FLOCK_MIN = 3
DENSITY_POINT = {"LOW": 0.0, "MED": 0.5, "HIGH": 1.0}
NAME_ADJ = ("Grey", "Silent", "Low", "Long", "Cold", "Broken", "Quiet", "High", "Red", "Narrow")
NAME_NOUN = (
    "Lantern",
    "Ridge",
    "Harvest",
    "Canal",
    "Signal",
    "Orchard",
    "Crossing",
    "Watch",
    "Field",
    "Line",
)


@dataclass
class Slot:
    """One planned contact group. `key` names its random sub-stream."""

    key: str
    role: str
    behaviour: str
    cls: str
    size: int = 1
    axis: float = 0.0
    link: str = "RF_MANUAL"
    is_threat: bool = True


@dataclass
class Group:
    slot: Slot
    contacts: list[dict]
    critical_s: float = 0.0
    end_s: float = 0.0
    extra: dict = field(default_factory=dict)


@dataclass
class Ctx:
    req: GenerateRequest
    level: Level
    terrain: Terrain
    half: float
    site: Site
    band: str
    asset: Point
    duration_s: int = 0
    border_axis: float | None = None
    _exposure: dict[int, list[list[bool]]] = field(default_factory=dict)
    _grid: Any = None

    def leg_exposure(self, bearing: float, agl: float, near_m: float, far_m: float) -> float:
        """Share of points (every 100 m) on the axis between near_m and far_m from the asset
        in view of the radar at `agl` (visibility heuristic)."""
        steps = max(1, int((far_m - near_m) // 100))
        seen = sum(
            visible(
                self.terrain,
                self.site.radar_xz,
                self.site.radar_y,
                bearing_point(self.asset, bearing, near_m + (far_m - near_m) * k / steps),
                agl,
                FINE_STEP_M,
            )
            for k in range(steps + 1)
        )
        return seen / (steps + 1)

    def exposure(self, agl: float) -> list[list[bool]]:
        bucket = int(agl // 10) * 10
        if self._grid is None:
            self._grid = self.terrain.coarse_grid(GRID_N)
        if bucket not in self._exposure:
            radius = self.level.spawn_m * ROUTE_RADIUS_FACTOR
            self._exposure[bucket] = exposure_grid(
                self.terrain,
                self.site.radar_xz,
                self.site.radar_y,
                float(bucket),
                self.asset,
                radius,
            )
        return self._exposure[bucket]


class GenerationError(ApiError):
    def __init__(self, message: str, details: dict[str, Any] | None = None) -> None:
        super().__init__(ErrorCode.VALIDATION_ERROR, message, details)


def canonical_json(scenario: dict) -> str:
    """The stored / compared form: sorted keys, no whitespace, UTF-8 text."""
    return json.dumps(scenario, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _weighted(rng: random.Random, options: tuple[tuple[str, float], ...]) -> str:
    names = [o[0] for o in options]
    return rng.choices(names, weights=[o[1] for o in options])[0]


# ---- planning -----------------------------------------------------------------


def _conditions(req: GenerateRequest, level: Level, rng: random.Random) -> tuple[str, str]:
    band = req.time_band.value if req.time_band else None
    preset = req.weather_preset.value if req.weather_preset else None
    if preset == "DUST":
        raise GenerationError("DUST weather needs a desert terrain preset (not available yet)")
    combos = [c for c in level.conditions if band is None or c[0] == band]
    if band is None:
        band, weather = rng.choice(combos)
    else:
        weathers = [w for b, w in combos] or sorted({w for _, w in level.conditions})
        weather = rng.choice(weathers)
    return band, preset or weather


#: Axis refinement: search ±AXIS_SEARCH_DEG in AXIS_STEP_DEG steps for an exposed final leg.
AXIS_SEARCH_DEG = 60
AXIS_STEP_DEG = 5
#: Typical threat speed used to turn reveal seconds into metres for axis choice.
REVEAL_REF_SPEED_MPS = 16.0
#: A recon threat's critical point is this close (validator CRITICAL_RANGE_M), so the
#: axis must be in view out to here plus the reveal distance.
CRITICAL_RANGE_M = 1000.0


def _best_axis(ctx: Ctx, axis: float) -> float:
    """The bearing near `axis` whose final approach the radar sees best (proxy), so terrain
    masking hides the outer route but not the last REVEAL seconds (decision 76)."""
    level = ctx.level
    agl = level.lowest_agl_m + 20
    far = min(level.spawn_m - 300, CRITICAL_RANGE_M + level.reveal_s * REVEAL_REF_SPEED_MPS)
    if level.difficulty <= FIRST_TRACK_MAX_DIFFICULTY:
        far = level.spawn_m - 300  # D1-D2 pacing: the whole approach in view
    best: tuple[float, int, float] | None = None
    for k in range(-AXIS_SEARCH_DEG // AXIS_STEP_DEG, AXIS_SEARCH_DEG // AXIS_STEP_DEG + 1):
        b = (axis + k * AXIS_STEP_DEG) % 360
        if not inside(bearing_point(ctx.asset, b, level.spawn_m), ctx.half):
            continue
        score = (ctx.leg_exposure(b, agl, 300, far), -abs(k), b)
        if best is None or score > best:
            best = score
    return best[2] if best is not None else axis


def _plan_threats(ctx: Ctx, rng: random.Random) -> list[Slot]:
    req, level, d = ctx.req, ctx.level, ctx.req.difficulty
    n_axes = rng.randint(*level.axes)
    axes = [
        _best_axis(ctx, fit_bearing(ctx.asset, b, level.spawn_m, ctx.half))
        for b in pick_axes(rng, n_axes)
    ]
    slots: list[Slot] = []

    if req.threat_mix:
        mix = sorted((cls.value, n) for cls, n in req.threat_mix.items())
        classes = [cls for cls, n in mix for _ in range(n)]
        for i, cls in enumerate(classes):
            behaviour = rng.choice(cs.CLASS_BEHAVIOURS[cls])
            slots.append(Slot(f"threat:{i}", "SINGLE", behaviour, cls, axis=axes[i % n_axes]))
        if req.swarm_size:
            slots.append(
                Slot("swarm:0", "SWARM", "SWARM_SATURATION", "QUAD_SMALL", req.swarm_size, axes[0])
            )
        return slots

    n = rng.randint(*level.threats)
    decoys, swarm_sizes = 0, []
    if level.swarm_tier == 1 and n >= 2 and rng.random() < 0.5:
        swarm_sizes = [req.swarm_size or min(n, rng.randint(2, 3))]
    elif level.swarm_tier == 2 and n >= 3:
        decoys = 1
        swarm_sizes = [req.swarm_size or max(2, min(rng.randint(4, 6), n - decoys - 1))]
    elif level.swarm_tier == 3:
        decoys = 1 if n < 12 else 2
        rest = n - decoys
        k = 2 if rest < 12 else 3
        if req.swarm_size:
            swarm_sizes = [req.swarm_size] * k
        else:
            members = rest - max(1, rest // 5)
            swarm_sizes = [members // k + (1 if i < members % k else 0) for i in range(k)]
            swarm_sizes = [s for s in swarm_sizes if s >= 2]
    singles = max(0, n - decoys - sum(swarm_sizes))

    for i, size in enumerate(swarm_sizes):
        cls = rng.choice(cs.classes_for("SWARM_SATURATION", d))
        slots.append(Slot(f"swarm:{i}", "SWARM", "SWARM_SATURATION", cls, size, axes[i % n_axes]))
    for i in range(decoys):
        cls = rng.choice(cs.classes_for("DECOY", d))
        off = rng.uniform(100, 160) * rng.choice((-1, 1))
        axis = fit_bearing(ctx.asset, (axes[0] + off) % 360, level.spawn_m, ctx.half)
        slots.append(Slot(f"decoy:{i}", "DECOY", "DECOY", cls, axis=axis, link="RF_MANUAL"))
    for i in range(singles):
        if d == 1 or (d <= FIRST_TRACK_MAX_DIFFICULTY and i == 0):
            # D1, and the D2 pacing threat: a plain attack run (decision 79).
            behaviour = "ATTACK_RUN"
        elif d == 2:
            behaviour = _weighted(rng, (("ATTACK_RUN", 0.65), ("RECON_LOITER", 0.35)))
        else:
            behaviour = _weighted(rng, SINGLE_WEIGHTS["NIGHT" if ctx.band == "NIGHT" else "OTHER"])
        cls = rng.choice(cs.classes_for(behaviour, d))
        slots.append(
            Slot(
                f"threat:{i}", "SINGLE", behaviour, cls, axis=axes[(i + len(swarm_sizes)) % n_axes]
            )
        )
    return slots


def _assign_links(slots: list[Slot], level: Level, rng: random.Random) -> None:
    """Silent-link share by members (SPEC §7.1); decoys stay loud; swarms share one link."""
    eligible = [s for s in slots if s.role != "DECOY"]
    target = round(level.silent_share * sum(s.size for s in eligible))
    silent = 0
    for s in eligible:
        if not cs.has_rf_option(s.cls):
            s.link = rng.choice(cs.silent_options(s.cls))
            silent += s.size
    order = eligible[:]
    rng.shuffle(order)
    for s in order:
        if s.link != "RF_MANUAL" or not cs.silent_options(s.cls):
            continue
        if silent + s.size <= target or (silent < target and s.size == 1):
            s.link = rng.choice(cs.silent_options(s.cls))
            silent += s.size


# ---- building -----------------------------------------------------------------


#: Fast classes stay above radar ground clutter (sim-core CLUTTER_AGL_M, 15 m): their
#: short flight would otherwise leave too little warning (decision 76).
FAST_CLASSES = frozenset({"FPV", "LOITERING_GENERIC"})
FAST_MIN_AGL_M = 15.0


def _threat_agl(rng: random.Random, level: Level, behaviour: str, cls: str) -> float:
    low = level.lowest_agl_m
    if behaviour == "RECON_LOITER":
        return round(uniform(rng, max(80.0, low), 150.0))
    if behaviour == "SMUGGLING_DROP":
        return round(uniform(rng, max(20.0, low), max(60.0, low + 10)))
    agl = round(uniform(rng, low, low + 40))
    return max(agl, FAST_MIN_AGL_M) if cls in FAST_CLASSES else agl


#: A threat's final approach must be at least this share in view (heuristic), else it
#: is flown higher in AGL_RAISE_STEP_M steps, up to AGL_RAISE_MAX_M (decision 76).
MIN_LEG_EXPOSURE = 0.85
AGL_RAISE_STEP_M = 10.0
AGL_RAISE_MAX_M = 60.0


def _segment_exposure(
    ctx: Ctx, a: Point, b: Point, agl: float, from_b: float, length: float
) -> float:
    """Share in view of the points (every 100 m) on segment a→b lying `from_b` to
    `from_b + length` metres before b."""
    seg = math.dist(a, b)
    lo, hi = min(from_b, seg), min(from_b + length, seg)
    if hi - lo < 1 or seg < 1:
        return 1.0
    n = max(1, int((hi - lo) // 100))
    pts = [
        (b[0] + (a[0] - b[0]) * d / seg, b[1] + (a[1] - b[1]) * d / seg)
        for d in (lo + (hi - lo) * k / n for k in range(n + 1))
    ]
    seen = sum(
        visible(ctx.terrain, ctx.site.radar_xz, ctx.site.radar_y, p, agl, FINE_STEP_M) for p in pts
    )
    return seen / len(pts)


#: If no lift keeps the approach in view, the bearing turns in BEARING_STEP_DEG steps
#: (alternating sides) up to BEARING_MAX_DEG from the planned axis.
BEARING_STEP_DEG = 10
BEARING_MAX_DEG = 60
#: Smugglers: bearing search around the border axis, and reference height / speed used to
#: place the border on a well-exposed axis.
SMUGGLER_MAX_DEG = 30
SMUGGLER_REF_AGL_M = 40.0
SMUGGLER_REF_SPEED_MPS = 12.5


def _lift(ctx: Ctx, agl: float, a: Point, b: Point, from_b: float, length: float) -> float:
    """The lowest AGL (from `agl` up) that keeps the final approach in view."""
    return _lift_scored(ctx, agl, a, b, from_b, length)[1]


def _lift_scored(
    ctx: Ctx,
    agl: float,
    a: Point,
    b: Point,
    from_b: float,
    length: float,
    need: float = MIN_LEG_EXPOSURE,
) -> tuple[float, float]:
    """(exposure, agl): the first lift reaching MIN_LEG_EXPOSURE, else the best one."""
    best = (-1.0, agl)
    k = 0
    while k * AGL_RAISE_STEP_M <= AGL_RAISE_MAX_M:
        trial = agl + k * AGL_RAISE_STEP_M
        exposure = _segment_exposure(ctx, a, b, trial, from_b, length)
        if exposure >= need:
            return exposure, trial
        if exposure > best[0]:
            best = (exposure, trial)
        k += 1
    return best


#: D1-D2 pacing: the first threat spawns this far from the radar (small-quad Pd ≈ 0.75),
#: so it is tracked within FIRST_TRACK_MAX_S (decision 79).
FIRST_SPAWN_RADAR_M = 2600.0
#: ...and the first FIRST_VIEW_M after its spawn point must be fully in view.
FIRST_VIEW_M = 800.0


def _spawn_dist(ctx: Ctx, bearing: float, first: bool) -> float:
    """Spawn distance from the asset on a bearing: the table's, or for the D1-D2 first
    threat the point FIRST_SPAWN_RADAR_M from the radar."""
    if not first:
        return ctx.level.spawn_m
    ux, uz = math.sin(math.radians(bearing)), math.cos(math.radians(bearing))
    wx = ctx.asset[0] - ctx.site.radar_xz[0]
    wz = ctx.asset[1] - ctx.site.radar_xz[1]
    wu = wx * ux + wz * uz
    return -wu + math.sqrt(max(wu * wu - (wx * wx + wz * wz) + FIRST_SPAWN_RADAR_M**2, 0.0))


def _fit_approach(
    ctx: Ctx,
    bearing: float,
    agl: float,
    from_asset: float,
    length: float | None,
    max_deg: int = BEARING_MAX_DEG,
    first: bool = False,
) -> tuple[float, float]:
    """(bearing, agl) near the planned bearing whose straight approach to the asset is in
    view from `from_asset` to `from_asset + length` metres out (decision 76); with
    `length` None, all the way to 200 m short of the spawn point (D1-D2 pacing)."""
    asset, half = ctx.asset, ctx.half
    best = (-1.0, bearing, agl)
    for k in range(2 * max_deg // BEARING_STEP_DEG + 1):
        off = (k + 1) // 2 * BEARING_STEP_DEG * (1 if k % 2 else -1)
        b = (bearing + off) % 360
        dist = _spawn_dist(ctx, b, first)
        spawn = bearing_point(asset, b, dist)
        if not inside(spawn, half):
            continue
        if length is None:
            # D1-D2 pacing: the stretch just after spawn must be fully in view.
            exposure, lifted = _lift_scored(
                ctx, agl, spawn, asset, dist - FIRST_VIEW_M - 200, FIRST_VIEW_M, 1.0
            )
        else:
            exposure, lifted = _lift_scored(ctx, agl, spawn, asset, from_asset, length)
        if exposure >= (1.0 if length is None else MIN_LEG_EXPOSURE):
            return b, lifted
        if exposure > best[0]:
            best = (exposure, b, lifted)
    return best[1], best[2]


def _set_agl(waypoints: list[dict], agl: float) -> None:
    for w in waypoints:
        if w.get("action") != "DIVE":
            w["y"] = agl


def _approach(ctx: Ctx, spawn: Point, agl: float, speed: float) -> list[Point]:
    """Interior waypoints: a least-exposure route to a reveal point, then straight in.

    Only low threats from D3 are masked, and only beyond the reveal point, which
    leaves `reveal_s` of straight final approach (decision 76).
    """
    if agl > MASK_AGL_M or ctx.req.difficulty < 3:
        return []
    reveal_m = ctx.level.reveal_s * speed
    if reveal_m >= ctx.level.spawn_m - 300:
        return []
    reveal = bearing_point(ctx.asset, bearing_of(ctx.asset, spawn), reveal_m)
    radius = ctx.level.spawn_m * ROUTE_RADIUS_FACTOR
    exposed = ctx.exposure(agl)
    return [*masked_route(ctx._grid, exposed, spawn, reveal, ctx.asset, radius), reveal]


def _contact(
    slot: Slot,
    cls: str,
    behaviour: str,
    path: list[dict],
    spawn_s: float,
    rng: random.Random,
    **kw: Any,
) -> dict:
    affiliation = kw.pop("affiliation", "HOSTILE" if slot.is_threat else "NEUTRAL")
    link = kw.pop("link", slot.link)
    return {
        "class": cls,
        "isThreat": slot.is_threat,
        "affiliation": affiliation,
        "controlLink": link,
        "behaviour": behaviour,
        "spawnTMs": round(spawn_s * 10) * 100,
        "path": path,
        "emissions": cs.emissions(rng, link, kw.pop("friendly_id", None)),
        **kw,
    }


def _build_threat(ctx: Ctx, slot: Slot, rng: random.Random) -> Group:
    level, asset = ctx.level, ctx.asset
    first = ctx.req.difficulty <= FIRST_TRACK_MAX_DIFFICULTY and slot.key == "threat:0"
    spawn_s = uniform(rng, *(FIRST_SPAWN_S if first else SPAWN_WINDOW_S[ctx.req.difficulty]))
    speed = cs.speed_for(rng, slot.cls)
    if slot.role == "DECOY":
        p = None
        for k in range(360 // DECOY_STEP_DEG):
            axis = (slot.axis + k * DECOY_STEP_DEG) % 360
            if not inside(bearing_point(asset, axis, level.spawn_m), ctx.half):
                continue
            spawn = bearing_point(asset, axis, level.spawn_m)
            p = bh.decoy(rng, spawn, asset, speed, laps=3)
            orbit = p.waypoints[1:]
            agl = orbit[0]["y"]
            seen = sum(
                visible(
                    ctx.terrain,
                    ctx.site.radar_xz,
                    ctx.site.radar_y,
                    (w["x"], w["z"]),
                    agl,
                    FINE_STEP_M,
                )
                for w in orbit
            )
            if seen / len(orbit) >= MIN_LEG_EXPOSURE:
                break
        if p is None:
            raise GenerationError("No decoy axis fits inside the map")
        return Group(
            slot,
            [_contact(slot, slot.cls, "DECOY", p.waypoints, uniform(rng, 5, 30), rng)],
            p.critical_s,
            p.end_s,
        )

    agl = _threat_agl(rng, level, slot.behaviour, slot.cls)
    if slot.behaviour == "SMUGGLING_DROP":
        base = ctx.border_axis if ctx.border_axis is not None else slot.axis
        axis = fit_bearing(asset, (base + rng.uniform(-10, 10)) % 360, level.spawn_m, ctx.half)
        # Stay within ±40° of the border axis so the route still crosses the border line.
        axis, agl = _fit_approach(
            ctx, axis, agl, bh.DROP_RANGE_M[0], level.reveal_s * speed, SMUGGLER_MAX_DEG
        )
        spawn = bearing_point(asset, axis, level.spawn_m)
        p = bh.smuggling_drop(rng, spawn, asset, agl, speed)
        drop = p.extra["drop"]
        _set_agl(p.waypoints, _lift(ctx, agl, spawn, drop, 0, level.reveal_s * speed))
        return Group(
            slot,
            [_contact(slot, slot.cls, slot.behaviour, p.waypoints, spawn_s, rng)],
            spawn_s + p.critical_s,
            spawn_s + p.end_s,
            {"axis": axis},
        )

    jitter = rng.uniform(-10, 10)
    bearing = fit_bearing(asset, (slot.axis + jitter) % 360, level.spawn_m, ctx.half)
    reveal_m = level.reveal_s * speed
    # D1-D2 pacing: the first threat spawns near the radar and is in view all the way.
    if slot.behaviour == "RECON_LOITER":
        view_m = None if first else reveal_m
        bearing, agl = _fit_approach(ctx, bearing, agl, CRITICAL_RANGE_M, view_m, first=first)
    else:
        # Swarm followers fly a little higher than the leader; check with a margin.
        margin = SWARM_AGL_JITTER_M if slot.role == "SWARM" else 0.0
        view_m = None if first else reveal_m - 200
        bearing, agl = _fit_approach(ctx, bearing, agl - margin, 200, view_m, first=first)
        agl += margin
    spawn = bearing_point(asset, bearing, _spawn_dist(ctx, bearing, first))
    if slot.behaviour == "RECON_LOITER":
        p = bh.recon_loiter(rng, spawn, asset, agl, speed, ctx.half)
        ring0 = (p.waypoints[1]["x"], p.waypoints[1]["z"])
        from_b = max(0.0, CRITICAL_RANGE_M - math.dist(ring0, asset))
        _set_agl(p.waypoints, _lift(ctx, agl, spawn, ring0, from_b, level.reveal_s * speed))
        return Group(
            slot,
            [_contact(slot, slot.cls, slot.behaviour, p.waypoints, spawn_s, rng)],
            spawn_s + p.critical_s,
            spawn_s + p.end_s,
        )

    route = _approach(ctx, spawn, agl, speed)
    lead = bh.attack_run(spawn, route, asset, agl, speed)
    if slot.role != "SWARM":
        return Group(
            slot,
            [_contact(slot, slot.cls, slot.behaviour, lead.waypoints, spawn_s, rng)],
            spawn_s + lead.critical_s,
            spawn_s + lead.end_s,
        )

    # Swarm: followers fly the leader's path offset sideways, spawning staggered.
    perp = math.radians(bearing_of(spawn, asset) + 90)
    members = [_contact(slot, slot.cls, "SWARM_SATURATION", lead.waypoints, spawn_s, rng)]
    t, last = spawn_s, spawn_s + lead.critical_s
    for k in range(1, slot.size):
        side = (k + 1) // 2 * (1 if k % 2 else -1)
        off = side * uniform(rng, *SWARM_SPACING_M)
        dx, dz = off * math.sin(perp), off * math.cos(perp)
        path = []
        for w in lead.waypoints:
            scale = 0.4 if w.get("action") == "DIVE" else 1.0
            path.append(
                w
                | {
                    "x": w["x"] + dx * scale,
                    "z": w["z"] + dz * scale,
                    "y": w["y"] + rng.uniform(0, SWARM_AGL_JITTER_M)
                    if w.get("action") != "DIVE"
                    else 0,
                }
            )
        t += uniform(rng, 3, 8)
        members.append(_contact(slot, slot.cls, "SWARM_SATURATION", path, t, rng))
        last = t + lead.critical_s
    return Group(slot, members, last, last)


def _build_false(ctx: Ctx, slot: Slot, rng: random.Random) -> Group:
    asset, half, dur = ctx.asset, ctx.half, ctx.duration_s
    spawn_s = uniform(rng, 0, 0.4 * dur)
    if slot.role == "BIRD_FLOCK":
        cls = rng.choice(("BIRD_SMALL", "BIRD_LARGE"))
        speed = cs.speed_for(rng, cls)
        start = bearing_point(asset, rng.uniform(0, 360), uniform(rng, 1500, 4500))
        if not inside(start, half, 600):
            start = bearing_point(asset, bearing_of(asset, (0.0, 0.0)), 2000)
        agl = round(uniform(rng, 30, 120))
        p = bh.bird_leader(rng, start, half, agl, speed)
        flock = [_contact(slot, cls, "BIRD_FLOCK", p.waypoints, spawn_s, rng, link="NONE")]
        for _ in range(1, slot.size):
            j = (start[0] + rng.uniform(-25, 25), start[1] + rng.uniform(-25, 25))
            flock.append(
                _contact(
                    slot,
                    cls,
                    "BIRD_FLOCK",
                    [bh.wp(j, agl + round(rng.uniform(-5, 5)), speed)],
                    spawn_s,
                    rng,
                    link="NONE",
                )
            )
        return Group(slot, flock, spawn_s + p.end_s, spawn_s + p.end_s)
    if slot.role == "TRANSIT":
        speed = cs.speed_for(rng, "CIVILIAN_HOBBY")
        p = bh.transit(rng, asset, half, round(uniform(rng, 30, 100)), speed)
        return Group(
            slot,
            [_contact(slot, "CIVILIAN_HOBBY", "TRANSIT", p.waypoints, spawn_s, rng)],
            spawn_s + p.end_s,
            spawn_s + p.end_s,
        )
    if slot.role == "FRIENDLY_PATROL":
        speed = cs.speed_for(rng, "FRIENDLY_QUAD")
        loop_len = 2 * math.pi * 700
        loops = max(2, math.ceil(dur * speed / loop_len) + 1)
        p = bh.friendly_patrol(rng, asset, speed, loops)
        fid = (
            f"BLUE-{rng.randint(1, 99):02d}"
            if rng.random() < cs.FRIENDLY_ID_P[ctx.req.difficulty]
            else None
        )
        c = _contact(
            slot,
            "FRIENDLY_QUAD",
            "FRIENDLY_PATROL",
            p.waypoints,
            uniform(rng, 0, 30),
            rng,
            affiliation="FRIENDLY",
            friendly_id=fid,
        )
        return Group(slot, [c], p.end_s, p.end_s)
    # HELICOPTER
    speed = cs.speed_for(rng, "HELICOPTER_FRIENDLY")
    p = bh.helicopter_transit(rng, half, speed)
    c = _contact(
        slot,
        "HELICOPTER_FRIENDLY",
        "TRANSIT",
        p.waypoints,
        spawn_s,
        rng,
        affiliation="FRIENDLY",
        link="NONE",
    )
    return Group(slot, [c], spawn_s + p.end_s, spawn_s + p.end_s)


def _with_retries(ctx: Ctx, slot: Slot, build: Any) -> Group:
    seed = ctx.req.seed
    problems: list[str] = []
    for attempt in range(MAX_ATTEMPTS):
        group = build(ctx, slot, stream(seed, f"{slot.key}:attempt:{attempt}"))
        problems = [
            p
            for i, c in enumerate(group.contacts)
            for p in contact_problems(c | {"id": f"{slot.key}#{i}"}, ctx.half, [ctx.site.asset])
        ]
        if not problems:
            return group
    raise GenerationError(
        f"Could not generate {slot.key} after {MAX_ATTEMPTS} attempts",
        {"slot": slot.key, "problems": problems[:5]},
    )


def _plan_false(ctx: Ctx, rng: random.Random) -> list[Slot]:
    d, level = ctx.req.difficulty, ctx.level
    lo, hi = level.false_contacts
    if ctx.req.false_contact_density is not None and hi > 0:
        n = round(lo + (hi - lo) * DENSITY_POINT[ctx.req.false_contact_density.value])
    else:
        n = rng.randint(lo, hi)
    slots: list[Slot] = []
    patrols = helis = 0
    birds_left = BIRD_BUDGET
    for i in range(n):
        role = _weighted(rng, FALSE_WEIGHTS[d])
        if (role == "FRIENDLY_PATROL" and patrols >= MAX_FRIENDLY_PATROLS) or (
            role == "HELICOPTER" and helis >= 1
        ):
            role = "BIRD_FLOCK"
        patrols += role == "FRIENDLY_PATROL"
        helis += role == "HELICOPTER"
        size = 1
        if role == "BIRD_FLOCK":
            size = min(rng.randint(*FLOCK_SIZE), birds_left)
            if size < FLOCK_MIN:  # bird budget spent: a civilian transit instead
                role, size = "TRANSIT", 1
            birds_left -= size if role == "BIRD_FLOCK" else 0
        slots.append(Slot(f"false:{i}", role, role, "", size, is_threat=False))
    return slots


def _trim(threats: list[Group], false: list[Group], level: Level) -> None:
    """Clamp to ENTITY_CAP: false contacts, then flock members, then swarm followers."""

    def total() -> int:
        return sum(len(g.contacts) for g in threats + false)

    while total() > ENTITY_CAP and len(false) > level.false_contacts[0]:
        false.pop()
    while total() > ENTITY_CAP:
        flocks = [g for g in false if g.slot.role == "BIRD_FLOCK" and len(g.contacts) > FLOCK_MIN]
        if not flocks:
            break
        max(flocks, key=lambda g: len(g.contacts)).contacts.pop()
    while total() > ENTITY_CAP:
        n_threats = sum(len(g.contacts) for g in threats)
        swarms = [g for g in threats if g.slot.role == "SWARM" and len(g.contacts) > 2]
        if not swarms or n_threats <= level.threats[0]:
            break
        max(swarms, key=lambda g: len(g.contacts)).contacts.pop()
    if total() > ENTITY_CAP:
        raise GenerationError(f"More than {ENTITY_CAP} entities requested", {"entities": total()})


def _border_line(asset: Point, axis: float, spawn_m: float, half: float) -> list[list[float]]:
    """A line across the map, perpendicular to the smuggling axis, 55 % of the way out."""
    centre = bearing_point(asset, axis, 0.55 * spawn_m)
    ends = []
    for side in (90, -90):
        b = (axis + side) % 360
        reach = 0.0
        while inside(bearing_point(centre, b, reach + 100), half, 50):
            reach += 100
        ends.append(bearing_point(centre, b, reach))
    return [list(ends[0]), list(centre), list(ends[1])]


#: Keys rounded to 0.1 m; every other float to 0.01 (probabilities, seconds, m/s).
_METRE_KEYS = frozenset({"x", "y", "z"})


def _round(value: Any, key: str = "") -> Any:
    if isinstance(value, float):
        r = round(value, 1 if key in _METRE_KEYS else 2)
        return int(r) if r.is_integer() else r
    if isinstance(value, dict):
        return {k: _round(v, k) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_round(v, key) for v in value]
    return value


# ---- entry point --------------------------------------------------------------


def generate(req: GenerateRequest) -> dict:
    """GenerateRequest → Scenario dict (camelCase, rounded, validated)."""
    terrain = load_terrain(req.terrain_preset)
    level = LEVELS[req.difficulty]
    meta = terrain.meta
    half = terrain.size_m / 2
    seed = req.seed

    env = stream(seed, "environment")
    band, weather_preset = _conditions(req, level, env)
    date = pick_date(env, weather_preset)
    time, sun_el = pick_time(env, meta.origin.lat, meta.origin.lon, date, meta.utc_offset_min, band)
    weather = weather_for(env, weather_preset)
    is_night = sun_el < NIGHT_SUN_EL_DEG

    where = site(stream(seed, "siting"), terrain, req.difficulty)
    asset = (where.asset["x"], where.asset["z"])
    ctx = Ctx(req=req, level=level, terrain=terrain, half=half, site=where, band=band, asset=asset)

    plan_rng = stream(seed, "plan")
    threat_slots = _plan_threats(ctx, plan_rng)
    if not threat_slots:
        raise GenerationError("The request produces no threats")
    _assign_links(threat_slots, level, plan_rng)
    smugglers = [s for s in threat_slots if s.behaviour == "SMUGGLING_DROP"]
    if smugglers:
        # The border crosses the best-exposed smuggling axis (decision 76).
        ctx.border_axis, _ = _fit_approach(
            ctx,
            smugglers[0].axis,
            SMUGGLER_REF_AGL_M,
            bh.DROP_RANGE_M[0],
            level.reveal_s * SMUGGLER_REF_SPEED_MPS,
        )

    threats = [_with_retries(ctx, s, _build_threat) for s in threat_slots]
    last_critical = max(g.critical_s for g in threats)
    ctx.duration_s = req.duration_s or int(
        min(
            max(math.ceil((last_critical + DURATION_TAIL_S) / 30) * 30, DURATION_RANGE_S[0]),
            DURATION_RANGE_S[1],
        )
    )
    false = [_with_retries(ctx, s, _build_false) for s in _plan_false(ctx, stream(seed, "false"))]
    _trim(threats, false, level)

    # Ids in a stable order: threats, then false contacts; group ids per swarm / flock.
    contacts: list[dict] = []
    swarm_no = flock_no = 0
    for g in threats + false:
        group_id = None
        if g.slot.role == "SWARM" and len(g.contacts) > 1:
            swarm_no += 1
            group_id = f"sw{swarm_no}"
        elif g.slot.role == "BIRD_FLOCK" and len(g.contacts) > 1:
            flock_no += 1
            group_id = f"fl{flock_no}"
        for c in g.contacts:
            c["id"] = f"c{len(contacts) + 1:02d}"
            if group_id:
                c["groupId"] = group_id
            despawn = round((g.end_s + 3) * 10) * 100
            leaves_map = g.slot.role in ("BIRD_FLOCK", "TRANSIT", "HELICOPTER")
            if (leaves_map or g.slot.behaviour == "RECON_LOITER") and (
                c["spawnTMs"] < despawn < ctx.duration_s * 1000
            ):
                c["despawnTMs"] = despawn
            contacts.append(c)

    accuracy = cs.ai_accuracy(
        req.ai_assist_accuracy if req.ai_assist_accuracy is not None else level.ai_accuracy,
        is_night,
        weather_preset,
    )
    ai_rng = stream(seed, "ai")
    for c in contacts:
        c["aiSuggestion"] = cs.ai_suggestion(ai_rng, c["class"], accuracy)

    zones: list[dict] = [
        {"id": f"nk{i + 1}", "kind": "NO_KINETIC", "polygon": [list(p) for p in box]}
        for i, box in enumerate(where.no_kinetic)
    ]
    if ctx.border_axis is not None:
        zones.append(
            {
                "id": "bl1",
                "kind": "BORDER_LINE",
                "polyline": _border_line(asset, ctx.border_axis, level.spawn_m, half),
            }
        )

    n_threats = sum(c["isThreat"] for c in contacts)
    effs = effectors(where.asset, req.difficulty, ammo_for(level, n_threats))
    roe = req.roe.value if req.roe else level.roe
    eff_lines = [effector_line(e) for e in effs]
    eff_lines.insert(0, "Radar, EO/IR camera and RF detector on high ground near the asset")
    name_rng = stream(seed, f"name:{req.terrain_preset}:{req.difficulty}")
    name = f"{name_rng.choice(NAME_ADJ)} {name_rng.choice(NAME_NOUN)}"

    request = {
        "terrainPreset": req.terrain_preset,
        "timeOfDay": time,
        "date": date,
        "weather": weather,
        "difficulty": req.difficulty,
        "seed": seed,
        "threatMix": dict(sorted(_count_classes(contacts).items())),
        "falseContactDensity": req.false_contact_density.value
        if req.false_contact_density
        else None,
        "swarmSize": req.swarm_size,
        "aiAssistAccuracy": accuracy,
        "durationS": ctx.duration_s,
        "roe": roe,
    }
    request = {k: v for k, v in request.items() if v is not None}
    scenario_id = (
        "GEN-"
        + hashlib.sha256(
            json.dumps(
                req.model_dump(mode="json", by_alias=True, exclude_none=True), sort_keys=True
            ).encode()
        ).hexdigest()[:12]
    )

    scenario = _round(
        {
            "id": scenario_id,
            "schemaVersion": SCHEMA_VERSION,
            "generatorVersion": GENERATOR_VERSION,
            "name": name,
            "briefing": briefing(
                difficulty=req.difficulty,
                band=band,
                weather_preset=weather_preset,
                roe=roe,
                asset_name=where.asset["name"],
                effector_lines=eff_lines,
                axes=[s.axis for s in threat_slots if s.role != "DECOY"] or [threat_slots[0].axis],
                has_border=ctx.border_axis is not None,
                has_no_kinetic=bool(where.no_kinetic),
                has_friendly=any(c["affiliation"] == "FRIENDLY" for c in contacts),
            ),
            "seed": seed,
            "difficulty": req.difficulty,
            "request": request,
            "terrain": {
                "preset": meta.name,
                "origin": {"lat": meta.origin.lat, "lon": meta.origin.lon},
            },
            "environment": {"date": date, "time": time, "isNight": is_night, "weather": weather},
            "roe": roe,
            "zones": zones,
            "assets": [where.asset],
            "sensors": where.sensors,
            "effectors": effs,
            "contacts": contacts,
            "durationS": ctx.duration_s,
            "scoringTreeId": SCORING_TREE_ID,
        }
    )
    _validate(scenario)
    return scenario


def _count_classes(contacts: list[dict]) -> dict[str, int]:
    out: dict[str, int] = {}
    for c in contacts:
        if c["isThreat"]:
            out[c["class"]] = out.get(c["class"], 0) + 1
    return out


def _validate(scenario: dict) -> None:
    model = Scenario.model_validate(scenario)
    problems = scenario_rule_violations(model)
    if problems:
        raise GenerationError("Generated scenario failed validation", {"problems": problems[:10]})
