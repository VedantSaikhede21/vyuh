"""Asset, sensor, effector and zone siting (requirements 3a.1).

Uses heights only (services/terrain.py); line of sight stays in sim-core.
"""

import math
import random
from dataclasses import dataclass

from app.services.generator.visibility import coverage
from app.services.terrain import Building, Terrain

Point = tuple[float, float]

#: Asset within this radius of the map centre, on ground flatter than FLAT_MAX_DH_M.
ASSET_RADIUS_M = 500.0
FLAT_PROBE_M = 60.0
FLAT_MAX_DH_M = 6.0
#: Radar on high ground within this radius of the asset (SPEC §6.1 siting).
RADAR_SEARCH_M = 800.0
RADAR_GRID_M = 50.0
#: Of the highest RADAR_CANDIDATES points (≥ RADAR_SPACING_M apart), the radar takes the
#: one that sees most of the approaches (low contacts on rings around it).
RADAR_CANDIDATES = 10
RADAR_SPACING_M = 150.0
RADAR_MAST_M = 6.0
COVERAGE_RINGS_M = (1500.0, 2500.0, 3500.0)
COVERAGE_AGL_M = 30.0
#: Settlement clusters: buildings linked within this distance; zone = box + buffer.
CLUSTER_LINK_M = 300.0
CLUSTER_MIN_BUILDINGS = 2
ZONE_BUFFER_M = 80.0
ZONE_MAX_RANGE_M = 4000.0
#: Never put the asset inside (or this close to) a no-kinetic zone.
ASSET_ZONE_CLEARANCE_M = 150.0

ASSET_NAMES = ("Post Alpha", "Relay Site", "Depot Bravo", "Pump Station", "Bridge Post")


@dataclass(frozen=True)
class Site:
    asset: dict
    sensors: list[dict]
    radar_xz: Point
    #: Radar antenna height in the scenario frame (terrain + mast).
    radar_y: float
    no_kinetic: list[list[Point]]


def _flat(terrain: Terrain, x: float, z: float) -> bool:
    h = terrain.height_at(x, z)
    probes = ((FLAT_PROBE_M, 0), (-FLAT_PROBE_M, 0), (0, FLAT_PROBE_M), (0, -FLAT_PROBE_M))
    return all(abs(terrain.height_at(x + dx, z + dz) - h) <= FLAT_MAX_DH_M for dx, dz in probes)


def settlement_boxes(buildings: tuple[Building, ...], centre: Point) -> list[list[Point]]:
    """Buffered bounding boxes of building clusters near `centre` (single-link clustering)."""
    pts = [b.centroid for b in buildings]
    parent = list(range(len(pts)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    for i in range(len(pts)):
        for j in range(i + 1, len(pts)):
            if math.dist(pts[i], pts[j]) <= CLUSTER_LINK_M:
                parent[root(i)] = root(j)
    clusters: dict[int, list[Building]] = {}
    for i, b in enumerate(buildings):
        clusters.setdefault(root(i), []).append(b)

    boxes: list[list[Point]] = []
    for members in clusters.values():
        if len(members) < CLUSTER_MIN_BUILDINGS:
            continue
        xs = [p[0] for b in members for p in b.ring]
        zs = [p[1] for b in members for p in b.ring]
        x0, x1 = min(xs) - ZONE_BUFFER_M, max(xs) + ZONE_BUFFER_M
        z0, z1 = min(zs) - ZONE_BUFFER_M, max(zs) + ZONE_BUFFER_M
        cx, cz = (x0 + x1) / 2, (z0 + z1) / 2
        if math.dist((cx, cz), centre) > ZONE_MAX_RANGE_M:
            continue
        boxes.append([(x0, z0), (x1, z0), (x1, z1), (x0, z1)])
    # Stable order: by south-west corner.
    return sorted(boxes, key=lambda b: (b[0][1], b[0][0]))


def _box_distance(box: list[Point], x: float, z: float) -> float:
    (x0, z0), _, (x1, z1), _ = box
    dx = max(x0 - x, 0.0, x - x1)
    dz = max(z0 - z, 0.0, z - z1)
    return math.hypot(dx, dz)


def pick_asset_xz(rng: random.Random, terrain: Terrain, boxes: list[list[Point]]) -> Point:
    step = 100.0
    n = int(ASSET_RADIUS_M // step)
    candidates = [
        (i * step, j * step)
        for i in range(-n, n + 1)
        for j in range(-n, n + 1)
        if math.hypot(i * step, j * step) <= ASSET_RADIUS_M
        and _flat(terrain, i * step, j * step)
        and all(_box_distance(b, i * step, j * step) > ASSET_ZONE_CLEARANCE_M for b in boxes)
    ]
    return rng.choice(candidates) if candidates else (0.0, 0.0)


_radar_sites: dict[tuple[str, Point], Point] = {}


def radar_site(terrain: Terrain, asset: Point) -> Point:
    """High ground near the asset with the best view of the approaches (decision 76).

    Cached per (preset, asset): asset sites come from a small candidate grid.
    """
    key = (terrain.meta.name, asset)
    if key not in _radar_sites:
        _radar_sites[key] = _radar_site(terrain, asset)
    return _radar_sites[key]


def _radar_site(terrain: Terrain, asset: Point) -> Point:
    n = int(RADAR_SEARCH_M // RADAR_GRID_M)
    points = sorted(
        (
            -terrain.height_at(asset[0] + i * RADAR_GRID_M, asset[1] + j * RADAR_GRID_M),
            math.hypot(i, j) * RADAR_GRID_M,
            asset[0] + i * RADAR_GRID_M,
            asset[1] + j * RADAR_GRID_M,
        )
        for i in range(-n, n + 1)
        for j in range(-n, n + 1)
        if math.hypot(i, j) * RADAR_GRID_M <= RADAR_SEARCH_M
    )
    candidates: list[Point] = []
    for _, _, x, z in points:
        if all(math.dist((x, z), c) >= RADAR_SPACING_M for c in candidates):
            candidates.append((x, z))
        if len(candidates) == RADAR_CANDIDATES:
            break
    if not candidates:
        return asset

    def score(p: Point) -> tuple[float, float]:
        y = terrain.height_at(*p) + RADAR_MAST_M
        return (coverage(terrain, p, y, COVERAGE_RINGS_M, COVERAGE_AGL_M), terrain.height_at(*p))

    return max(candidates, key=score)


def site(rng: random.Random, terrain: Terrain, difficulty: int) -> Site:
    boxes = settlement_boxes(terrain.buildings, (0.0, 0.0)) if difficulty >= 2 else []
    ax, az = pick_asset_xz(rng, terrain, boxes)
    rx, rz = radar_site(terrain, (ax, az))
    asset = {"id": "a1", "name": rng.choice(ASSET_NAMES), "x": ax, "z": az, "radiusM": 60}
    sensors = [
        {
            "id": "rad1",
            "kind": "RADAR",
            "x": rx,
            "y": 6,
            "z": rz,
            "refRangeM": 3000,
            "scanPeriodS": 2,
        },
        {
            "id": "eo1",
            "kind": "EO_IR",
            "x": rx,
            "y": 8,
            "z": rz,
            "fovDegMin": 1.5,
            "fovDegMax": 30,
            "resolution": [640, 360],
            "irResolution": [640, 512],
        },
        {"id": "rf1", "kind": "RF", "x": rx, "y": 4, "z": rz, "rangeM": 4000, "bearingErrDeg": 7},
    ]
    return Site(
        asset=asset,
        sensors=sensors,
        radar_xz=(rx, rz),
        radar_y=terrain.height_at(rx, rz) + RADAR_MAST_M,
        no_kinetic=boxes,
    )


def effectors(asset: dict, difficulty: int, ammo: int) -> list[dict]:
    """Interceptor always; jammer from D2, spoofer from D3 (representative ranges as S14)."""
    x, z = asset["x"], asset["z"]
    out = []
    if difficulty >= 2:
        out.append(
            {"id": "jam1", "kind": "EW_JAM", "x": x, "z": z, "rangeM": 2000, "cooldownS": 10}
        )
    if difficulty >= 3:
        out.append(
            {"id": "spf1", "kind": "EW_SPOOF", "x": x, "z": z, "rangeM": 2000, "cooldownS": 15}
        )
    out.append(
        {
            "id": "int1",
            "kind": "INTERCEPT",
            "x": x,
            "z": z,
            "rangeM": 1500,
            "cooldownS": 6,
            "ammo": ammo,
        }
    )
    return out
