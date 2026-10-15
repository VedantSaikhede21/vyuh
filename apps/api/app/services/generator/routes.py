"""Approach axes and low, terrain-masked routes (requirements 3a.1).

The masking heuristic is a cheap visibility proxy on the coarse height grid
(a ray from the radar sampled once per cell), used only to bias routes into
valleys. It is not a line-of-sight model: sim-core decides what is detected,
and the validator checks the warning time.
"""

import heapq
import math
import random

from app.services.terrain import CoarseGrid

Point = tuple[float, float]

#: Waypoints stay this far inside the map edge.
MAP_MARGIN_M = 250.0
#: Extra cost per metre flown in a cell the radar can see.
EXPOSURE_WEIGHT = 3.0
#: Routes stay within this multiple of the spawn distance from the asset.
ROUTE_RADIUS_FACTOR = 1.3
#: Keep every n-th cell of a grid route as a waypoint.
ROUTE_STRIDE = 3
MIN_AXIS_SEPARATION_DEG = 60.0


def bearing_point(origin: Point, bearing_deg: float, dist: float) -> Point:
    """Point `dist` metres from `origin` on a compass bearing (0 = north, x east, z north)."""
    b = math.radians(bearing_deg)
    return (origin[0] + dist * math.sin(b), origin[1] + dist * math.cos(b))


def bearing_of(origin: Point, to: Point) -> float:
    return math.degrees(math.atan2(to[0] - origin[0], to[1] - origin[1])) % 360


def inside(p: Point, half: float, margin: float = MAP_MARGIN_M) -> bool:
    return abs(p[0]) <= half - margin and abs(p[1]) <= half - margin


def fit_bearing(asset: Point, bearing: float, dist: float, half: float) -> float:
    """Rotate in 5° steps until the point at `dist` lies inside the map."""
    for k in range(72):
        b = (bearing + 5 * k) % 360
        if inside(bearing_point(asset, b, dist), half):
            return b
    raise ValueError("No approach bearing fits inside the map")


def pick_axes(rng: random.Random, n: int) -> list[float]:
    """n approach bearings at least MIN_AXIS_SEPARATION_DEG apart."""
    first = rng.uniform(0, 360)
    axes = [first]
    while len(axes) < n:
        cand = rng.uniform(0, 360)
        if all(abs((cand - a + 180) % 360 - 180) >= MIN_AXIS_SEPARATION_DEG for a in axes):
            axes.append(cand)
    return axes


def exposure_grid(grid: CoarseGrid, radar: Point, radar_y: float, agl: float) -> list[list[bool]]:
    """True where a contact at `agl` over a cell centre is visible from the radar (proxy)."""
    rr, rc = grid.cell_of(*radar)
    out: list[list[bool]] = []
    for r in range(grid.n):
        row: list[bool] = []
        for c in range(grid.n):
            target_y = grid.heights[r][c] + agl
            steps = max(abs(r - rr), abs(c - rc))
            visible = True
            for k in range(1, steps):
                f = k / steps
                sr = round(rr + (r - rr) * f)
                sc = round(rc + (c - rc) * f)
                if grid.heights[sr][sc] > radar_y + (target_y - radar_y) * f:
                    visible = False
                    break
            row.append(visible)
        out.append(row)
    return out


def masked_route(
    grid: CoarseGrid, exposed: list[list[bool]], start: Point, goal: Point, radius: float
) -> list[Point]:
    """Least-exposure 8-connected grid path from start to goal; interior waypoints only."""
    s, g = grid.cell_of(*start), grid.cell_of(*goal)
    centre = goal

    def ok(cell: tuple[int, int]) -> bool:
        return math.dist(grid.centre(*cell), centre) <= radius

    dist: dict[tuple[int, int], float] = {s: 0.0}
    prev: dict[tuple[int, int], tuple[int, int]] = {}
    heap: list[tuple[float, tuple[int, int]]] = [(0.0, s)]
    while heap:
        d, cell = heapq.heappop(heap)
        if cell == g:
            break
        if d > dist.get(cell, math.inf):
            continue
        r, c = cell
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                nxt = (r + dr, c + dc)
                if (dr, dc) == (0, 0) or not (0 <= nxt[0] < grid.n and 0 <= nxt[1] < grid.n):
                    continue
                if nxt != g and not ok(nxt):
                    continue
                step = grid.cell_m * math.hypot(dr, dc)
                cost = step * (1 + EXPOSURE_WEIGHT * exposed[nxt[0]][nxt[1]])
                nd = d + cost
                if nd < dist.get(nxt, math.inf):
                    dist[nxt] = nd
                    prev[nxt] = cell
                    heapq.heappush(heap, (nd, nxt))
    if g not in prev and g != s:
        return []
    cells = [g]
    while cells[-1] != s:
        cells.append(prev[cells[-1]])
    cells.reverse()
    interior = cells[1:-1][::ROUTE_STRIDE]
    return _simplify([grid.centre(*c) for c in interior], start, goal)


def _simplify(points: list[Point], start: Point, goal: Point) -> list[Point]:
    """Drop interior points that deviate < 1 cell-ish (60 m) from the line between neighbours."""
    out: list[Point] = []
    prev = start
    for i, p in enumerate(points):
        nxt = points[i + 1] if i + 1 < len(points) else goal
        if _deviation(prev, p, nxt) >= 60.0:
            out.append(p)
            prev = p
    return out


def _deviation(a: Point, p: Point, b: Point) -> float:
    ax, az = b[0] - a[0], b[1] - a[1]
    length = math.hypot(ax, az)
    if length < 1e-9:
        return math.dist(a, p)
    return abs(ax * (a[1] - p[1]) - az * (a[0] - p[0])) / length
