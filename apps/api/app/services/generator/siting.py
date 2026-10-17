"""Asset, sensor, effector and zone siting (requirements 3a.1, Phase 3b towns).

Uses heights, footprints and the coarse roof grid (services/terrain.py); line of
sight stays in sim-core.
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
#: Sparse presets: buildings linked within this distance form a settlement; zone = box +
#: buffer, if its centre is within ZONE_MAX_RANGE_M of the map centre.
CLUSTER_LINK_M = 300.0
CLUSTER_MIN_BUILDINGS = 2
ZONE_BUFFER_M = 80.0
ZONE_MAX_RANGE_M = 4000.0
#: Dense presets (ML footprints, decision 91): single links would chain farmhouses into one
#: map-wide cluster, so settlements are 8-connected built-up cells (footprint area at least
#: BUILT_UP_SHARE of the cell); the largest is the town.
DENSE_MIN_BUILDINGS = 2000
BUILT_UP_CELL_M = 100.0
BUILT_UP_SHARE = 0.2
SETTLEMENT_MIN_CELLS = 3
#: The largest settlement is a town only from this many built-up cells (3 km²); a
#: villages-only preset keeps the asset near the centre (decision 93).
TOWN_MIN_CELLS = 300
#: Dense presets: zones at most this side (larger settlements are tiled), kept only within
#: ZONE_ASSET_RANGE_M of the asset (beyond interceptor reach a zone constrains nothing).
ZONE_MAX_SIDE_M = 1200.0
ZONE_ASSET_RANGE_M = 2000.0
#: Dense presets: the asset sits TOWN_EDGE_M from the town's built-up edge, within
#: TOWN_ASSET_SEARCH_M of the map centre.
TOWN_EDGE_M = (200.0, 800.0)
TOWN_ASSET_SEARCH_M = 4000.0
#: Footprint occupancy cells for keeping the asset clear of buildings.
OCCUPANCY_CELL_M = 50.0
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
    #: Zone name per no_kinetic box ("village" or "town").
    no_kinetic_names: list[str]


def _flat(terrain: Terrain, x: float, z: float) -> bool:
    h = terrain.height_at(x, z)
    probes = ((FLAT_PROBE_M, 0), (-FLAT_PROBE_M, 0), (0, FLAT_PROBE_M), (0, -FLAT_PROBE_M))
    return all(abs(terrain.height_at(x + dx, z + dz) - h) <= FLAT_MAX_DH_M for dx, dz in probes)


def settlement_boxes(buildings: tuple[Building, ...], centre: Point) -> list[list[Point]]:
    """Buffered bounding boxes of building clusters near `centre` (single-link clustering).

    A grid of CLUSTER_LINK_M cells limits the pair tests to neighbouring cells; the
    clusters are the same as testing every pair.
    """
    pts = [b.centroid for b in buildings]
    parent = list(range(len(pts)))

    def root(i: int) -> int:
        while parent[i] != i:
            parent[i] = parent[parent[i]]
            i = parent[i]
        return i

    cells: dict[tuple[int, int], list[int]] = {}
    for i, (x, z) in enumerate(pts):
        key = (math.floor(x / CLUSTER_LINK_M), math.floor(z / CLUSTER_LINK_M))
        cells.setdefault(key, []).append(i)
    for (cx, cz), members in cells.items():
        near = [
            j for dx in (-1, 0, 1) for dz in (-1, 0, 1) for j in cells.get((cx + dx, cz + dz), ())
        ]
        for i in members:
            for j in near:
                if j > i and math.dist(pts[i], pts[j]) <= CLUSTER_LINK_M:
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


def _ring_area(ring: tuple[Point, ...]) -> float:
    a = 0.0
    for (x1, z1), (x2, z2) in zip(ring, (*ring[1:], ring[0]), strict=True):
        a += x1 * z2 - x2 * z1
    return abs(a) / 2


Cell = tuple[int, int]


@dataclass(frozen=True)
class DenseSettlements:
    #: Built-up cells (BUILT_UP_CELL_M) of the town; empty when there is none.
    town_cells: frozenset[Cell]
    #: (box, "town" | "village"), boxes at most ZONE_MAX_SIDE_M, by south-west corner.
    zones: list[tuple[list[Point], str]]


_dense: dict[str, DenseSettlements] = {}


def dense_settlements(terrain: Terrain) -> DenseSettlements:
    """Built-up components of a dense preset (cached per preset)."""
    name = terrain.meta.name
    if name in _dense:
        return _dense[name]
    c = BUILT_UP_CELL_M
    # Each footprint's area is spread evenly over the cells its bounding box touches.
    cover: dict[Cell, float] = {}
    for b in terrain.buildings:
        xs = [p[0] for p in b.ring]
        zs = [p[1] for p in b.ring]
        i0, i1 = math.floor(min(xs) / c), math.floor(max(xs) / c)
        j0, j1 = math.floor(min(zs) / c), math.floor(max(zs) / c)
        share = _ring_area(b.ring) / ((i1 - i0 + 1) * (j1 - j0 + 1))
        for i in range(i0, i1 + 1):
            for j in range(j0, j1 + 1):
                cover[(i, j)] = cover.get((i, j), 0.0) + share
    built = {k for k, a in cover.items() if a >= BUILT_UP_SHARE * c * c}
    seen: set[Cell] = set()
    components: list[list[Cell]] = []
    for start in sorted(built):
        if start in seen:
            continue
        seen.add(start)
        stack, comp = [start], []
        while stack:
            i, j = stack.pop()
            comp.append((i, j))
            for di in (-1, 0, 1):
                for dj in (-1, 0, 1):
                    n = (i + di, j + dj)
                    if n in built and n not in seen:
                        seen.add(n)
                        stack.append(n)
        if len(comp) >= SETTLEMENT_MIN_CELLS:
            components.append(sorted(comp))
    # Largest first; ties by south-west cell, so the order never depends on set iteration.
    components.sort(key=lambda comp: (-len(comp), comp[0]))
    tile = int(ZONE_MAX_SIDE_M // c)
    zones: list[tuple[list[Point], str]] = []
    for k, comp in enumerate(components):
        label = "town" if k == 0 and len(comp) >= TOWN_MIN_CELLS else "village"
        i0 = min(i for i, _ in comp)
        j0 = min(j for _, j in comp)
        tiles: dict[Cell, list[Cell]] = {}
        for i, j in comp:
            tiles.setdefault(((i - i0) // tile, (j - j0) // tile), []).append((i, j))
        for part in tiles.values():
            if len(part) < SETTLEMENT_MIN_CELLS:
                continue
            x0 = min(i for i, _ in part) * c
            x1 = (max(i for i, _ in part) + 1) * c
            z0 = min(j for _, j in part) * c
            z1 = (max(j for _, j in part) + 1) * c
            zones.append(([(x0, z0), (x1, z0), (x1, z1), (x0, z1)], label))
    zones.sort(key=lambda zn: (zn[0][0][1], zn[0][0][0]))
    has_town = bool(components) and len(components[0]) >= TOWN_MIN_CELLS
    out = DenseSettlements(frozenset(components[0]) if has_town else frozenset(), zones)
    _dense[name] = out
    return out


def _box_distance(box: list[Point], x: float, z: float) -> float:
    (x0, z0), _, (x1, z1), _ = box
    dx = max(x0 - x, 0.0, x - x1)
    dz = max(z0 - z, 0.0, z - z1)
    return math.hypot(dx, dz)


def _occupied(buildings: tuple[Building, ...]) -> set[Cell]:
    """OCCUPANCY_CELL_M cells touched by the footprints' bounding boxes."""
    c = OCCUPANCY_CELL_M
    out: set[Cell] = set()
    for b in buildings:
        xs = [p[0] for p in b.ring]
        zs = [p[1] for p in b.ring]
        for i in range(math.floor(min(xs) / c), math.floor(max(xs) / c) + 1):
            for j in range(math.floor(min(zs) / c), math.floor(max(zs) / c) + 1):
                out.add((i, j))
    return out


def _disc(radius_m: float, cell_m: float) -> list[Cell]:
    n = math.ceil(radius_m / cell_m)
    return [
        (i, j)
        for i in range(-n, n + 1)
        for j in range(-n, n + 1)
        if math.hypot(i, j) * cell_m <= radius_m
    ]


_town_sites: dict[tuple[str, bool], list[Point]] = {}


def town_asset_candidates(
    terrain: Terrain, dense: DenseSettlements, boxes: list[list[Point]]
) -> list[Point]:
    """Flat 100 m grid points TOWN_EDGE_M from the town, clear of buildings and zones.

    Cached per (preset, zones placed): nothing else changes the result.
    """
    key = (terrain.meta.name, bool(boxes))
    if key in _town_sites:
        return _town_sites[key]
    near_m, far_m = TOWN_EDGE_M
    c = BUILT_UP_CELL_M
    town = dense.town_cells
    inner, outer = _disc(near_m, c), _disc(far_m, c)
    occupied = _occupied(terrain.buildings)
    clear = _disc(ASSET_ZONE_CLEARANCE_M, OCCUPANCY_CELL_M)
    step = 100.0
    n = int(TOWN_ASSET_SEARCH_M // step)
    out: list[Point] = []
    for i in range(-n, n + 1):
        for j in range(-n, n + 1):
            x, z = i * step, j * step
            if math.hypot(x, z) > TOWN_ASSET_SEARCH_M:
                continue
            ci, cj = math.floor(x / c), math.floor(z / c)
            if any((ci + di, cj + dj) in town for di, dj in inner):
                continue
            if not any((ci + di, cj + dj) in town for di, dj in outer):
                continue
            oi, oj = math.floor(x / OCCUPANCY_CELL_M), math.floor(z / OCCUPANCY_CELL_M)
            if any((oi + di, oj + dj) in occupied for di, dj in clear):
                continue
            if not _flat(terrain, x, z):
                continue
            if any(_box_distance(b, x, z) <= ASSET_ZONE_CLEARANCE_M for b in boxes):
                continue
            out.append((x, z))
    _town_sites[key] = out
    return out


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
    named: list[tuple[list[Point], str]]
    if len(terrain.buildings) >= DENSE_MIN_BUILDINGS:
        dense = dense_settlements(terrain)
        all_boxes = [b for b, _ in dense.zones] if difficulty >= 2 else []
        sites = town_asset_candidates(terrain, dense, all_boxes) if dense.town_cells else []
        ax, az = rng.choice(sites) if sites else pick_asset_xz(rng, terrain, all_boxes)
        named = (
            [zn for zn in dense.zones if _box_distance(zn[0], ax, az) <= ZONE_ASSET_RANGE_M]
            if difficulty >= 2
            else []
        )
    else:
        boxes = settlement_boxes(terrain.buildings, (0.0, 0.0)) if difficulty >= 2 else []
        ax, az = pick_asset_xz(rng, terrain, boxes)
        named = [(b, "village") for b in boxes]
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
        no_kinetic=[b for b, _ in named],
        no_kinetic_names=[name for _, name in named],
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
