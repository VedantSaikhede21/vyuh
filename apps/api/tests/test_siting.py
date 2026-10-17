"""Siting on a dense preset (decision 91): town-edge asset, capped zones, roof grid."""

import math

import pytest

from app.schemas.generated import GenerateRequest
from app.services.generator import generate
from app.services.generator.siting import (
    ASSET_RADIUS_M,
    BUILT_UP_CELL_M,
    DENSE_MIN_BUILDINGS,
    TOWN_EDGE_M,
    TOWN_MIN_CELLS,
    ZONE_ASSET_RANGE_M,
    ZONE_MAX_SIDE_M,
    _box_distance,
    dense_settlements,
    settlement_boxes,
)
from app.services.generator.visibility import visible
from app.services.terrain import Building, load_terrain

URBAN = "URBAN_GENERIC"


def side(poly: list[list[float]]) -> float:
    xs = [p[0] for p in poly]
    zs = [p[1] for p in poly]
    return max(max(xs) - min(xs), max(zs) - min(zs))


def town_distance(x: float, z: float) -> float:
    """Distance from (x, z) to the nearest built-up town cell centre."""
    c = BUILT_UP_CELL_M
    return min(
        math.hypot((i + 0.5) * c - x, (j + 0.5) * c - z)
        for i, j in dense_settlements(load_terrain(URBAN)).town_cells
    )


@pytest.fixture(scope="module")
def urban() -> list[dict]:
    return [
        generate(GenerateRequest(terrainPreset=URBAN, difficulty=d, seed=s))
        for d in (1, 2, 3, 4, 5)
        for s in (11, 12, 13)
    ]


def test_villages_only_dense_preset_has_no_town() -> None:
    punjab = load_terrain("PUNJAB_PLAINS")
    assert len(punjab.buildings) >= DENSE_MIN_BUILDINGS
    dense = dense_settlements(punjab)
    # Real villages, none of them a town (TOWN_MIN_CELLS): the asset stays near the centre.
    assert dense.town_cells == frozenset()
    assert dense.zones and {name for _, name in dense.zones} == {"village"}
    for d in (1, 3):
        a = generate(GenerateRequest(terrainPreset="PUNJAB_PLAINS", difficulty=d, seed=5))[
            "assets"
        ][0]
        assert math.hypot(a["x"], a["z"]) <= ASSET_RADIUS_M
    assert len(dense_settlements(load_terrain(URBAN)).town_cells) >= TOWN_MIN_CELLS


def test_the_town_is_one_built_up_area_with_villages_apart() -> None:
    dense = dense_settlements(load_terrain(URBAN))
    c = BUILT_UP_CELL_M
    xs = [i for i, _ in dense.town_cells]
    zs = [j for _, j in dense.town_cells]
    # Kaithal's built-up area is ~5-6 km across around the map centre.
    assert 4000 <= (max(xs) - min(xs) + 1) * c <= 7000
    assert 4000 <= (max(zs) - min(zs) + 1) * c <= 7000
    assert any(name == "village" for _, name in dense.zones)
    assert all(side([list(p) for p in box]) <= ZONE_MAX_SIDE_M for box, _ in dense.zones)


def test_asset_at_the_town_edge(urban: list[dict]) -> None:
    near_m, far_m = TOWN_EDGE_M
    for s in urban:
        a = s["assets"][0]
        # Cell centres are up to half a diagonal from the nearest built-up point.
        d = town_distance(a["x"], a["z"])
        assert near_m - BUILT_UP_CELL_M <= d <= far_m + BUILT_UP_CELL_M, (s["id"], d)


def test_zones_capped_named_and_near_the_asset(urban: list[dict]) -> None:
    for s in urban:
        a = s["assets"][0]
        zones = [z for z in s["zones"] if z["kind"] == "NO_KINETIC"]
        if s["difficulty"] == 1:
            assert zones == []
            continue
        assert zones, s["id"]
        names = {z["name"] for z in zones}
        assert "town" in names and names <= {"town", "village"}
        for z in zones:
            box = [tuple(p) for p in z["polygon"]]
            assert side(z["polygon"]) <= ZONE_MAX_SIDE_M + 1e-6
            assert _box_distance(box, a["x"], a["z"]) <= ZONE_ASSET_RANGE_M
            # Never on the asset (ASSET_ZONE_CLEARANCE_M).
            assert _box_distance(box, a["x"], a["z"]) > 0


def test_grid_clustering_matches_every_pair() -> None:
    def square(x: float, z: float) -> Building:
        return Building(ring=((x, z), (x + 10, z), (x + 10, z + 10), (x, z + 10)), height_m=6)

    # A chain linked only through cell neighbours, a far pair, and a lone building.
    buildings = (
        square(0, 0),
        square(290, 0),
        square(580, 0),
        square(2000, 2000),
        square(2100, 2050),
        square(-3000, 0),
    )
    boxes = settlement_boxes(buildings, (0.0, 0.0))
    assert len(boxes) == 2
    chain = boxes[0]
    assert chain[0][0] == pytest.approx(-80) and chain[1][0] == pytest.approx(670)


def test_roof_grid_blocks_low_rays_through_the_town() -> None:
    terrain = load_terrain(URBAN)
    roofs = terrain.roof_grid()
    assert roofs is not None
    assert any(t > -math.inf for t in roofs.tops)
    # A ray skimming 2 m above the ground across the old town is blocked by roofs...
    src = (-3000.0, 250.0)
    dst = (2000.0, 250.0)
    src_y = terrain.height_at(*src) + 2
    assert not visible(terrain, src, src_y, dst, 2)
    # ...and passes 60 m up.
    assert visible(terrain, src, terrain.height_at(*src) + 60, dst, 60)
