"""Terrain-ray visibility heuristic for routing and siting only (decision 76).

A straight ray from the radar to a point, sampled on the heightmap: every
FINE_STEP_M (about the DEM's 27 m) for axis choice and radar siting, every
RAY_STEP_M for the masked-route grid (which only steers the hidden outer route).
It ignores buildings, Earth curvature, radar Pd, clutter and noise:
it only biases where the generator puts the radar and how low routes run. What
is actually detected, and when, is decided by sim-core (the validator).
"""

import math

from app.services.terrain import Terrain

Point = tuple[float, float]

RAY_STEP_M = 100.0
FINE_STEP_M = 30.0
#: Near the radar every ray is sampled at sim-core's 10 m LOS step: the radar sits on a
#: grid point, and terrain a few tens of metres away can still rise above the mast.
NEAR_STEP_M = 10.0
NEAR_RANGE_M = 150.0
#: Exposure grid resolution (cells per side) for masked routing.
GRID_N = 96
_CACHE_MAX = 64
_grids: dict[tuple, list[list[bool]]] = {}


def visible(
    terrain: Terrain,
    src: Point,
    src_y: float,
    dst: Point,
    agl: float,
    step: float = RAY_STEP_M,
) -> bool:
    """True when no terrain sample rises above the straight line src → dst (dst at `agl`)."""
    dst_y = terrain.height_at(*dst) + agl
    dist = math.dist(src, dst)
    if dist < 2 * NEAR_STEP_M:
        return True
    near = [d for d in range(int(NEAR_STEP_M), int(min(NEAR_RANGE_M, dist)), int(NEAR_STEP_M))]
    start = max(NEAR_RANGE_M, step)
    far = [start + k * step for k in range(int(max(dist - start, 0.0) // step))]
    # Inlined Terrain.height_at (same bilinear maths) — this loop dominates generation time.
    h = terrain.heights
    r = terrain.meta.resolution
    n = r - 1
    size = terrain.size_m
    scale = n / size
    off = size / 2
    sx, sz = src
    dx, dz, dy = dst[0] - sx, dst[1] - sz, dst_y - src_y
    for d in near + far:
        f = d / dist
        gx = min(max((sx + dx * f + off) * scale, 0.0), n)
        gz = min(max((sz + dz * f + off) * scale, 0.0), n)
        x0 = min(int(gx), n - 1)
        z0 = min(int(gz), n - 1)
        fx, fz = gx - x0, gz - z0
        i = z0 * r + x0
        ground = (h[i] * (1 - fx) + h[i + 1] * fx) * (1 - fz) + (
            h[i + r] * (1 - fx) + h[i + r + 1] * fx
        ) * fz
        if ground > src_y + dy * f:
            return False
    return True


def exposure_grid(
    terrain: Terrain, radar: Point, radar_y: float, agl: float, centre: Point, radius: float
) -> list[list[bool]]:
    """GRID_N² cells: True where a contact at `agl` over the cell centre is in view.

    Cells farther than `radius` from `centre` are not evaluated (left True); the
    masked router never enters them. Cached per preset, radar, height and area.
    """
    key = (terrain.meta.name, radar, round(radar_y, 1), agl, centre, round(radius))
    if key in _grids:
        return _grids[key]
    cell = terrain.size_m / GRID_N
    half = terrain.size_m / 2
    out: list[list[bool]] = []
    for r in range(GRID_N):
        row: list[bool] = []
        for c in range(GRID_N):
            p = (-half + (c + 0.5) * cell, -half + (r + 0.5) * cell)
            row.append(math.dist(p, centre) > radius or visible(terrain, radar, radar_y, p, agl))
        out.append(row)
    if len(_grids) >= _CACHE_MAX:
        _grids.pop(next(iter(_grids)))
    _grids[key] = out
    return out


def coverage(
    terrain: Terrain, radar: Point, radar_y: float, rings: tuple[float, ...], agl: float
) -> float:
    """Share of ring points (every 15°) around the radar that are in view at `agl`."""
    pts = [
        (radar[0] + d * math.sin(math.radians(b)), radar[1] + d * math.cos(math.radians(b)))
        for d in rings
        for b in range(0, 360, 15)
    ]
    half = terrain.size_m / 2
    pts = [p for p in pts if abs(p[0]) < half and abs(p[1]) < half]
    seen = sum(visible(terrain, radar, radar_y, p, agl, FINE_STEP_M) for p in pts)
    return seen / max(len(pts), 1)
