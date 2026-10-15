"""Server-side terrain reader (decision 73): heights match sim-core, presets resolve."""

import json
from pathlib import Path

import pytest

from app.core.config import DEFAULT_TERRAIN_DIR, Settings
from app.core.errors import ApiError
from app.schemas.generated import ErrorCode
from app.services.terrain import _load, available_presets, load_terrain

CROSSCHECK = Path(__file__).resolve().parent / "fixtures" / "crosscheck"
HEIGHTS = json.loads((CROSSCHECK / "terrain_heights.json").read_text(encoding="utf-8"))


@pytest.mark.parametrize("preset", sorted(HEIGHTS))
def test_heights_match_sim_core(preset: str) -> None:
    terrain = load_terrain(preset)
    for x, z, expected in HEIGHTS[preset]:
        # sim-core stores heights as float32; Python keeps doubles.
        assert terrain.height_at(x, z) == pytest.approx(expected, abs=1e-3), (x, z)


def test_presets_and_buildings() -> None:
    assert available_presets() == ["JK_MOUNTAIN", "PUNJAB_PLAINS"]
    punjab = load_terrain("PUNJAB_PLAINS")
    assert len(punjab.buildings) == punjab.meta.building_count == 41
    assert all(b.height_m > 0 and len(b.ring) >= 4 for b in punjab.buildings)
    assert load_terrain("JK_MOUNTAIN").buildings == ()


def test_coarse_grid_samples_cell_centres() -> None:
    terrain = load_terrain("JK_MOUNTAIN")
    grid = terrain.coarse_grid(16)
    assert grid.n == 16 and len(grid.heights) == 16
    x, z = grid.centre(3, 11)
    assert grid.heights[3][11] == terrain.height_at(x, z)
    assert grid.cell_of(x, z) == (3, 11)
    assert grid.cell_of(1e9, -1e9) == (0, 15)


@pytest.mark.parametrize("preset", ["NOWHERE", "../JK_MOUNTAIN", ""])
def test_unknown_preset_is_a_validation_error(preset: str) -> None:
    with pytest.raises(ApiError) as err:
        load_terrain(preset)
    assert err.value.code == ErrorCode.VALIDATION_ERROR


def test_terrain_dir_setting(tmp_path: Path) -> None:
    secret = "x" * 32
    assert Settings(local_jwt_secret=secret, terrain_dir="").terrain_dir == DEFAULT_TERRAIN_DIR
    assert Settings(local_jwt_secret=secret, terrain_dir=str(tmp_path)).terrain_dir == tmp_path
    with pytest.raises(ApiError):
        _load(tmp_path, "JK_MOUNTAIN")
