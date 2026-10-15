"""Path builders, one per SPEC §7 behaviour ("Python generates, TS simulates", SPEC §19).

Every builder returns a `Path`: waypoints (AGL, scenario frame) plus timing
estimates used for spawn scheduling, scenario duration and despawn times. Times
are horizontal distance / speed + holds; turns and climbs are ignored, so they
run slightly short (the validator measures the real sim).
"""

import math
import random
from dataclasses import dataclass, field
from itertools import pairwise

from app.services.generator.routes import Point, bearing_of, bearing_point, inside
from app.services.generator.streams import uniform

#: SPEC §7: SMUGGLING_DROP hovers 10-20 s at the drop point.
DROP_HOLD_S = (10.0, 20.0)
#: Drop point distance from the asset, and its bearing offset from the approach axis.
DROP_RANGE_M = (300.0, 900.0)
DROP_BEARING_DEG = 15.0
#: RECON_LOITER orbit (representative).
ORBIT_RADIUS_M = (300.0, 600.0)
ORBIT_POINTS = 8
#: DECOY: high and loud, orbiting outside interceptor range.
DECOY_AGL_M = (150.0, 300.0)
DECOY_ORBIT_RANGE_M = (1700.0, 2300.0)
#: TRANSIT: civilians keep clear of the asset.
TRANSIT_MIN_RANGE_M = 1200.0
#: FRIENDLY_PATROL loop around own position.
PATROL_RADIUS_M = (400.0, 1000.0)


@dataclass
class Path:
    waypoints: list[dict]
    #: Seconds from spawn to the threat's critical point (dive / drop / orbit start).
    critical_s: float
    #: Seconds from spawn to the end of the path (for despawn and duration).
    end_s: float
    extra: dict = field(default_factory=dict)


def wp(p: Point, agl: float, speed: float, **kw: object) -> dict:
    return {"x": p[0], "y": agl, "z": p[1], "speedMps": speed, **kw}


def path_time(points: list[Point], speed: float) -> float:
    return sum(math.dist(a, b) for a, b in pairwise(points)) / speed


def attack_run(spawn: Point, route: list[Point], asset: Point, agl: float, speed: float) -> Path:
    """Low approach (optionally terrain-masked `route`), terminal DIVE on the asset."""
    pts = [spawn, *route, asset]
    wps = [wp(p, agl, speed) for p in pts[:-1]] + [wp(asset, 0, speed, action="DIVE")]
    t = path_time(pts, speed)
    return Path(wps, critical_s=t, end_s=t)


def recon_loiter(
    rng: random.Random, spawn: Point, asset: Point, agl: float, speed: float, half: float
) -> Path:
    """Approach at 80-150 m AGL, orbit near the asset once, leave on another bearing."""
    radius = uniform(rng, *ORBIT_RADIUS_M)
    centre = bearing_point(asset, rng.uniform(0, 360), uniform(rng, 0, 300))
    start_angle = bearing_of(centre, spawn)
    ring = [
        bearing_point(centre, start_angle + 360 * k / ORBIT_POINTS, radius)
        for k in range(ORBIT_POINTS + 1)
    ]
    exit_b = (bearing_of(asset, spawn) + rng.uniform(90, 270)) % 360
    exit_p = next(
        p
        for p in (bearing_point(asset, exit_b, half - 300 - 100 * k) for k in range(60))
        if inside(p, half)
    )
    pts = [spawn, *ring, exit_p]
    approach = path_time([spawn, ring[0]], speed)
    return Path(
        [wp(p, agl, speed) for p in pts],
        critical_s=approach,
        end_s=path_time(pts, speed),
        extra={"orbitCentre": centre},
    )


def smuggling_drop(
    rng: random.Random, spawn: Point, asset: Point, agl: float, speed: float
) -> Path:
    """Low, across the border, hover 10-20 s with DROP, then RTH (back to spawn, despawn)."""
    axis = bearing_of(asset, spawn)
    drop_p = bearing_point(
        asset,
        (axis + rng.uniform(-DROP_BEARING_DEG, DROP_BEARING_DEG)) % 360,
        uniform(rng, *DROP_RANGE_M),
    )
    hold = round(uniform(rng, *DROP_HOLD_S), 1)
    back = bearing_point(drop_p, bearing_of(drop_p, spawn), 80)
    pts = [spawn, drop_p]
    t_drop = path_time(pts, speed) + hold
    wps = [
        wp(spawn, agl, speed),
        wp(drop_p, agl, speed, holdS=hold, action="DROP"),
        wp(back, agl, speed, action="RTH"),
    ]
    return Path(
        wps,
        critical_s=t_drop,
        end_s=t_drop + path_time([drop_p, spawn], speed),
        extra={"drop": drop_p},
    )


def decoy(rng: random.Random, spawn: Point, asset: Point, speed: float, laps: int) -> Path:
    """High, loud approach to an orbit outside interceptor range; stays to draw attention."""
    agl = round(uniform(rng, *DECOY_AGL_M))
    rng_m = uniform(rng, *DECOY_ORBIT_RANGE_M)
    axis = bearing_of(asset, spawn)
    ring = [
        bearing_point(asset, axis + sweep, rng_m)
        for sweep in [(-40 + 80 * (k % 2)) for k in range(2 * laps + 1)]
    ]
    pts = [spawn, *ring]
    t = path_time(pts, speed)
    return Path(
        [wp(p, agl, speed) for p in pts], critical_s=path_time([spawn, ring[0]], speed), end_s=t
    )


def transit(rng: random.Random, asset: Point, half: float, agl: float, speed: float) -> Path:
    """Civilian wander: 4-6 points, all at least TRANSIT_MIN_RANGE_M from the asset."""
    n = rng.randint(4, 6)
    pts: list[Point] = []
    for _ in range(200):
        if len(pts) == n:
            break
        p = bearing_point(asset, rng.uniform(0, 360), uniform(rng, TRANSIT_MIN_RANGE_M, 4500))
        if inside(p, half) and (not pts or math.dist(p, pts[-1]) <= 2500):
            pts.append(p)
    t = path_time(pts, speed)
    return Path([wp(p, agl, speed) for p in pts], critical_s=t, end_s=t)


def friendly_patrol(rng: random.Random, asset: Point, speed: float, loops: int) -> Path:
    """A loop of 4-6 points around own position, flown `loops` times at 60 m AGL."""
    n = rng.randint(4, 6)
    radius = uniform(rng, *PATROL_RADIUS_M)
    start = rng.uniform(0, 360)
    ring = [bearing_point(asset, start + 360 * k / n, radius) for k in range(n)]
    pts = ring * loops + [ring[0]]
    t = path_time(pts, speed)
    return Path([wp(p, 60, speed) for p in pts], critical_s=t, end_s=t)


def bird_leader(rng: random.Random, start: Point, half: float, agl: float, speed: float) -> Path:
    """Slow meander: 3-5 legs of 400-1200 m."""
    pts = [start]
    heading = rng.uniform(0, 360)
    for _ in range(rng.randint(3, 5)):
        heading = (heading + rng.uniform(-70, 70)) % 360
        nxt = bearing_point(pts[-1], heading, uniform(rng, 400, 1200))
        if not inside(nxt, half):
            heading = bearing_of(pts[-1], (0.0, 0.0))
            nxt = bearing_point(pts[-1], heading, 600)
        pts.append(nxt)
    t = path_time(pts, speed)
    return Path([wp(p, agl, speed) for p in pts], critical_s=t, end_s=t)


def helicopter_transit(rng: random.Random, half: float, speed: float) -> Path:
    """Friendly helicopter crossing the map edge to edge at 150 m AGL."""
    b = rng.uniform(0, 360)
    a = bearing_point((0.0, 0.0), b, half - 300)
    z = bearing_point((0.0, 0.0), (b + 180 + rng.uniform(-30, 30)) % 360, half - 300)
    t = path_time([a, z], speed)
    return Path([wp(a, 150, speed), wp(z, 150, speed)], critical_s=t, end_s=t)
