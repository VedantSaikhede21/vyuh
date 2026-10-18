"""build_preset.py on a tiny synthetic DEM; no network (buildings are injected)."""

import gzip
import json
import math
from pathlib import Path

import geopandas as gpd
import numpy as np
import pytest
import rasterio
from rasterio.transform import from_origin
from shapely.geometry import Polygon

import build_preset as bp

LAT, LON = 30.10, 75.10
RES_DEG = 0.0005  # ~50 m
SPAN_DEG = 0.2


def elevation(lat: float, lon: float) -> float:
    """Rises 0.01 m per metre northward (≈1.1 m per 0.0001°) plus a hill 1 km east."""
    north_m = (lat - LAT) * 111_320
    east_m = (lon - LON) * 111_320 * math.cos(math.radians(LAT))
    hill = 80 * math.exp(-((east_m - 1000) ** 2 + north_m**2) / (2 * 300**2))
    return 200 + 0.01 * north_m + hill


@pytest.fixture
def dem(tmp_path: Path) -> Path:
    n = int(SPAN_DEG / RES_DEG)
    west, north = LON - SPAN_DEG / 2, LAT + SPAN_DEG / 2
    lats = north - (np.arange(n) + 0.5) * RES_DEG
    lons = west + (np.arange(n) + 0.5) * RES_DEG
    data = np.array([[elevation(la, lo) for lo in lons] for la in lats], dtype="float32")
    path = tmp_path / "dem.tif"
    with rasterio.open(
        path,
        "w",
        driver="GTiff",
        width=n,
        height=n,
        count=1,
        dtype="float32",
        crs="EPSG:4326",
        transform=from_origin(west, north, RES_DEG, RES_DEG),
    ) as dst:
        dst.write(data, 1)
    return path


GRID = bp.Grid(name="TEST_PRESET", lat=LAT, lon=LON, size_m=6000, px=33)


def local_square(grid: bp.Grid, x: float, z: float, side: float) -> Polygon:
    """A square footprint at local (x east, z north) metres, returned in lon/lat."""
    to_ll = gpd.GeoSeries(
        [Polygon([(x, z), (x + side, z), (x + side, z + side), (x, z + side)])], crs=grid.crs
    ).to_crs("EPSG:4326")
    return to_ll.iloc[0]


def fake_buildings(grid: bp.Grid) -> gpd.GeoDataFrame:
    return gpd.GeoDataFrame(
        {
            "height": ["12 m", None, None, None, None],
            "building:levels": [None, "3", None, None, None],
        },
        geometry=[
            local_square(grid, 1000, 0, 20),  # height tag → 12
            local_square(grid, -500, 500, 15),  # levels → 9
            local_square(grid, 0, -800, 10),  # default → 6
            local_square(grid, 200, 200, 2),  # 4 m² → dropped
            local_square(grid, 5000, 5000, 20),  # outside the 6 km square → dropped
        ],
        crs="EPSG:4326",
    )


def build(dem: Path, tmp_path: Path, source: bp.BuildingsSource | None) -> tuple[dict, Path]:
    meta = bp.build_preset([dem], GRID, tmp_path / "out", 330, source, sleep=lambda _s: None)
    return meta, tmp_path / "out" / GRID.name


def test_heightmap_layout_and_meta(dem: Path, tmp_path: Path) -> None:
    meta, out = build(dem, tmp_path, None)
    raw = (out / "heightmap.u16").read_bytes()
    assert len(raw) == GRID.px * GRID.px * 2
    rel = bp.decode_heights(raw, GRID.px, meta["relMinM"], meta["relMaxM"])

    # Row 0 is the south edge: the synthetic DEM rises northward (0.01 m/m * 6 km = 60 m).
    assert rel[-1].mean() - rel[0].mean() == pytest.approx(60, abs=2)
    # Heights are relative to the origin, which samples to ~0.
    assert bp.sample_bilinear(rel, GRID.size_m, 0, 0) == pytest.approx(0, abs=0.05)
    assert meta["originElevM"] == pytest.approx(elevation(LAT, LON), abs=0.5)
    # Column 0 is west: the hill 1 km east of the origin shows up east of centre.
    hill_col = round((1000 + GRID.half) / GRID.step)
    mid = GRID.px // 2
    assert rel[mid, hill_col] > rel[mid, GRID.px - 1 - hill_col] + 50

    assert meta["resolution"] == GRID.px
    assert meta["metresPerPx"] == pytest.approx(GRID.size_m / (GRID.px - 1))
    assert meta["minElevM"] == pytest.approx(meta["originElevM"] + meta["relMinM"], abs=0.01)
    assert meta["utcOffsetMin"] == 330
    assert meta["origin"] == {"lat": LAT, "lon": LON}
    assert meta["buildingsStatus"] == "EMPTY"
    assert json.loads((out / "meta.json").read_text(encoding="utf-8")) == meta
    assert (out / "heightmap.png").read_bytes()[:8] == b"\x89PNG\r\n\x1a\n"
    assert not list(out.glob("*.aux.xml"))


def test_u16_round_trip_precision() -> None:
    elev = np.linspace(1000, 4000, 64 * 64).reshape(64, 64)
    enc = bp.encode_heights(elev, 1000)
    dec = bp.decode_heights(enc.u16.tobytes(), 64, enc.rel_min_m, enc.rel_max_m)
    assert np.abs(dec - (elev - enc.origin_elev_m)).max() < 0.05


def test_buildings_projected_filtered_and_heighted(dem: Path, tmp_path: Path) -> None:
    meta, out = build(dem, tmp_path, lambda _bbox: fake_buildings(GRID))
    fc = json.loads((out / "buildings.geojson").read_text(encoding="utf-8"))
    assert meta["buildingsStatus"] == "OK"
    assert meta["buildingCount"] == 3 == len(fc["features"])
    assert any("OpenStreetMap" in a for a in meta["attribution"])

    by_height = {f["properties"]["heightM"]: f for f in fc["features"]}
    assert set(by_height) == {12.0, 9.0, 6.0}
    # Local metres: the 12 m building's corner is at (1000, 0).
    ring = by_height[12.0]["geometry"]["coordinates"][0]
    xs, zs = [p[0] for p in ring], [p[1] for p in ring]
    assert min(xs) == pytest.approx(1000, abs=2)
    assert min(zs) == pytest.approx(0, abs=2)
    assert max(xs) - min(xs) == pytest.approx(20, abs=1)


@pytest.mark.parametrize(
    ("tags", "expected"),
    [
        ({"height": "7.5"}, 7.5),
        ({"height": "10 m", "building:levels": "5"}, 10.0),
        ({"height": None, "building:levels": "4"}, 12.0),
        ({"height": "abc", "building:levels": None}, 6.0),
        ({}, 6.0),
        ({"height": float("nan"), "building:levels": float("nan")}, 6.0),
    ],
)
def test_building_height_rules(tags: dict, expected: float) -> None:
    assert bp.building_height_m(tags) == expected


def test_no_buildings_writes_empty_collection(dem: Path, tmp_path: Path) -> None:
    meta, out = build(dem, tmp_path, None)
    assert json.loads((out / "buildings.geojson").read_text(encoding="utf-8")) == {
        "type": "FeatureCollection",
        "features": [],
    }
    assert meta["buildingCount"] == 0


def test_overpass_failure_retries_then_unavailable(
    dem: Path, tmp_path: Path, capsys: pytest.CaptureFixture[str]
) -> None:
    calls: list[int] = []
    sleeps: list[float] = []

    def failing(_bbox: tuple) -> gpd.GeoDataFrame:
        calls.append(1)
        raise ConnectionError("504 Gateway Timeout")

    gdf, status = bp.fetch_with_retry(failing, (0, 0, 1, 1), base_delay_s=5, sleep=sleeps.append)
    assert (gdf, status) == (None, "UNAVAILABLE")
    assert len(calls) == 3
    assert sleeps == [5, 10]
    assert "UNAVAILABLE" in capsys.readouterr().err

    meta, out = build(dem, tmp_path, failing)
    assert meta["buildingsStatus"] == "UNAVAILABLE"
    assert (out / "heightmap.u16").exists()


def test_overpass_empty_reply_is_not_retried() -> None:
    calls: list[int] = []

    def empty(_bbox: tuple) -> gpd.GeoDataFrame:
        calls.append(1)
        raise bp.EmptyReplyError("no features")

    assert bp.fetch_with_retry(empty, (0, 0, 1, 1), sleep=lambda _s: None) == (None, "EMPTY")
    assert len(calls) == 1


def test_overpass_recovers_after_one_failure() -> None:
    attempts = iter([ConnectionError("timeout"), None])
    frame = gpd.GeoDataFrame({"height": ["5"]}, geometry=[Polygon([(0, 0), (1, 0), (1, 1)])])

    def flaky(_bbox: tuple) -> gpd.GeoDataFrame:
        err = next(attempts)
        if err:
            raise err
        return frame

    gdf, status = bp.fetch_with_retry(flaky, (0, 0, 1, 1), sleep=lambda _s: None)
    assert status == "OK"
    assert gdf is frame


def test_size_budget_enforced(dem: Path, tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bp, "MAX_PRESET_BYTES", 100)
    with pytest.raises(bp.PresetError, match="budget"):
        build(dem, tmp_path, None)
    assert not (tmp_path / "out" / GRID.name).exists()


def test_dem_not_covering_box_is_a_clear_error(dem: Path, tmp_path: Path) -> None:
    big = bp.Grid(name="TOO_BIG", lat=LAT, lon=LON, size_m=40_000, px=17)
    with pytest.raises(bp.PresetError, match="does not cover"):
        bp.build_preset([dem], big, tmp_path / "out", 330, None)


def write_tile(path: Path, squares: list[tuple[float, float, float, float]]) -> Path:
    """A GeoJSONL footprint tile (Microsoft format; gzipped if .gz): (x, z, side, height)."""
    lines = []
    for x, z, side, height in squares:
        ll = local_square(GRID, x, z, side)
        feature = {
            "type": "Feature",
            "properties": {"height": height, "confidence": -1.0},
            "geometry": {"type": "Polygon", "coordinates": [list(ll.exterior.coords)]},
        }
        lines.append(json.dumps(feature) + "\n")
    data = "".join(lines).encode("utf-8")
    path.write_bytes(gzip.compress(data) if path.suffix == ".gz" else data)
    return path


def test_footprint_tiles_merge_under_osm(dem: Path, tmp_path: Path) -> None:
    tile = write_tile(
        tmp_path / "tile.csv.gz",
        [
            (1005, 5, 10, -1.0),  # overlaps the OSM 12 m building → dropped
            (2000, 0, 10, -1.0),  # two row houses 1 m apart → one 21 m block
            (2011, 0, 10, -1.0),
            (-2000, 0, 10, 9.0),  # known height → kept as is
            (-1000, -1000, 5, -1.0),  # 25 m² shed → dropped
            (9000, 9000, 10, -1.0),  # outside the box → dropped
        ],
    )
    meta = bp.build_preset(
        [dem],
        GRID,
        tmp_path / "out",
        330,
        lambda _bbox: fake_buildings(GRID),
        sleep=lambda _s: None,
        footprint_paths=[tile],
    )
    raw = (tmp_path / "out" / GRID.name / "buildings.geojson").read_text(encoding="utf-8")
    fc = json.loads(raw)
    assert meta["buildingsStatus"] == "OK"
    assert meta["buildingCount"] == 3 + 2 == len(fc["features"])
    assert any("OpenStreetMap" in a for a in meta["attribution"])
    assert any("Microsoft" in a for a in meta["attribution"])
    # One compact feature per line.
    assert len(raw.splitlines()) == 2 + len(fc["features"])

    by_x = {
        round(min(p[0] for p in f["geometry"]["coordinates"][0]), -1): f for f in fc["features"]
    }
    assert set(by_x) == {1000.0, -500.0, 0.0, 2000.0, -2000.0}
    block = by_x[2000.0]["geometry"]["coordinates"][0]
    assert max(p[0] for p in block) - min(p[0] for p in block) == pytest.approx(21, abs=1)
    assert by_x[2000.0]["properties"]["heightM"] == 6.0
    assert by_x[-2000.0]["properties"]["heightM"] == 9.0
    # Tile coordinates are whole metres.
    assert all(isinstance(v, int) for p in block for v in p)


def test_footprint_tiles_without_osm(dem: Path, tmp_path: Path) -> None:
    tile = write_tile(tmp_path / "tile.geojsonl", [(0, 0, 12, -1.0)])
    meta = bp.build_preset(
        [dem], GRID, tmp_path / "out", 330, None, sleep=lambda _s: None, footprint_paths=[tile]
    )
    assert meta["buildingsStatus"] == "OK"
    assert meta["buildingCount"] == 1
    assert meta["revision"] == 1  # always written (decision 106)
    assert not any("OpenStreetMap" in a for a in meta["attribution"])
    assert any("Microsoft" in a for a in meta["attribution"])


def test_revision_is_written_when_bumped(dem: Path, tmp_path: Path) -> None:
    meta = bp.build_preset([dem], GRID, tmp_path / "out", 330, None, revision=2)
    written = json.loads((tmp_path / "out" / GRID.name / "meta.json").read_text(encoding="utf-8"))
    assert meta["revision"] == written["revision"] == 2


def test_cli_rejects_bad_name(dem: Path) -> None:
    assert bp.main(["--dem", str(dem), "--centre", "30.1,75.1", "--name", "bad-name"]) == 2
