"""Build a VYUH terrain preset from a DEM + OSM buildings (SPEC §14).

Outputs into <out>/<NAME>/:
  heightmap.u16      raw little-endian uint16, resolution², row 0 = south, col 0 = west.
                     height relative to the origin = relMinM + v * (relMaxM - relMinM) / 65535
  heightmap.png      16-bit north-up preview (humans only; nothing loads it)
  meta.json          TerrainPresetMeta (packages/shared/src/terrain.ts)
  buildings.geojson  footprints in local metres [x east, z north], property heightM,
                     one compact feature per line

Buildings come from OSM and, optionally, offline footprint tiles (--footprints:
Microsoft Global ML Building Footprints GeoJSONL, ODbL, kept in git-ignored raw/).
OSM wins where the two overlap. Tile footprints without a height are merged where
they touch (--footprint-merge-gap-m): they share the 2-level default height, so LOS
sees the same solid block.

The DEM is reprojected (bilinear) onto a square local azimuthal-equidistant grid
centred on the origin, whose nodes span sizeM edge to edge (metresPerPx =
sizeM / (resolution - 1)), matching sim-core's Heightmap sampling.

Example:
  uv run python build_preset.py --dem raw/Copernicus_DSM_COG_10_N30_00_E075_00_DEM.tif \
      --centre 30.52,75.70 --size-km 14 --name PUNJAB_PLAINS
  uv run python build_preset.py --dem raw/Copernicus_DSM_COG_10_N29_00_E076_00_DEM.tif \
      --centre 29.7997,76.3990 --size-km 14 --name URBAN_GENERIC \
      --footprints raw/msbuildings/india-123121122.csv.gz
"""

from __future__ import annotations

import argparse
import gzip
import json
import logging
import math
import re
import sys
import time
import warnings
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.crs import CRS
from rasterio.enums import Resampling
from rasterio.errors import NotGeoreferencedWarning
from rasterio.merge import merge
from rasterio.transform import from_origin
from rasterio.warp import reproject, transform_bounds

log = logging.getLogger("build_preset")

HERE = Path(__file__).resolve().parent
REPO_ROOT = HERE.parent.parent
DEFAULT_OUT = REPO_ROOT / "apps" / "web" / "public" / "terrain"
DEFAULT_CACHE = HERE / "raw" / "osm_cache"

U16_MAX = 65535
NODATA = -32767.0
LEVEL_HEIGHT_M = 3.0
DEFAULT_LEVELS = 2
MIN_BUILDING_AREA_M2 = 10.0
SIMPLIFY_TOLERANCE_M = 1.0
MAX_PRESET_BYTES = 10 * 1024 * 1024
OVERPASS_ATTEMPTS = 3
OVERPASS_BASE_DELAY_S = 5.0

GLO30_ATTRIBUTION = (
    "Copernicus DEM GLO-30: © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH "
    "2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved"
)
OSM_ATTRIBUTION = "Building footprints © OpenStreetMap contributors, ODbL 1.0"
MS_ATTRIBUTION = (
    "Building footprints © Microsoft, Global ML Building Footprints "
    "(github.com/microsoft/GlobalMLBuildingFootprints), ODbL 1.0"
)

# Footprint tiles (decision 89): merge where closer than 2 * gap, simplify, drop sheds.
FOOTPRINT_MERGE_GAP_M = 1.0
FOOTPRINT_SIMPLIFY_M = 2.0
FOOTPRINT_MIN_AREA_M2 = 40.0

BuildingsSource = Callable[[tuple[float, float, float, float]], Any]


class EmptyReplyError(Exception):
    """OSM answered, but there are no building footprints in the box."""


class PresetError(Exception):
    """A clear, user-facing build failure."""


@dataclass(frozen=True)
class Grid:
    name: str
    lat: float
    lon: float
    size_m: float
    px: int

    @property
    def step(self) -> float:
        return self.size_m / (self.px - 1)

    @property
    def half(self) -> float:
        return self.size_m / 2

    @property
    def crs(self) -> CRS:
        return CRS.from_proj4(
            f"+proj=aeqd +lat_0={self.lat} +lon_0={self.lon} +datum=WGS84 +units=m +no_defs"
        )

    def lonlat_bounds(self, margin_m: float = 0.0) -> tuple[float, float, float, float]:
        """(west, south, east, north) of the square, densified, in EPSG:4326."""
        h = self.half + margin_m
        return transform_bounds(self.crs, "EPSG:4326", -h, -h, h, h, densify_pts=64)


# ---- heights --------------------------------------------------------------


def reproject_dem(dem_paths: Sequence[Path], grid: Grid) -> np.ndarray:
    """Elevations (m) on the grid nodes, row 0 = SOUTH. Raises PresetError on gaps."""
    bounds = grid.lonlat_bounds(margin_m=4 * grid.step)
    sources = [rasterio.open(p) for p in dem_paths]
    try:
        mosaic, transform = merge(sources, bounds=bounds, nodata=NODATA, dtype="float32")
        src_crs = sources[0].crs
    finally:
        for s in sources:
            s.close()

    # Pixel centres sit on the grid nodes; row 0 of the raster is the north edge.
    dst_transform = from_origin(
        -grid.half - grid.step / 2, grid.half + grid.step / 2, grid.step, grid.step
    )
    north_up = np.full((grid.px, grid.px), np.nan, dtype="float64")
    reproject(
        source=mosaic[0],
        destination=north_up,
        src_transform=transform,
        src_crs=src_crs,
        src_nodata=NODATA,
        dst_transform=dst_transform,
        dst_crs=grid.crs,
        dst_nodata=np.nan,
        resampling=Resampling.bilinear,
    )
    if np.isnan(north_up).any():
        missing = int(np.isnan(north_up).sum())
        raise PresetError(
            f"DEM does not cover the whole box ({missing} of {grid.px**2} samples missing). "
            "Pass every tile the box touches with --dem."
        )
    return north_up[::-1].copy()


def sample_bilinear(heights_south_first: np.ndarray, size_m: float, x: float, z: float) -> float:
    """Mirror of sim-core sampleHeight: bilinear, clamped, row 0 = south."""
    n = heights_south_first.shape[0] - 1
    half = size_m / 2
    gx = min(max((x + half) / size_m * n, 0.0), n)
    gz = min(max((z + half) / size_m * n, 0.0), n)
    x0 = min(math.floor(gx), n - 1)
    z0 = min(math.floor(gz), n - 1)
    fx, fz = gx - x0, gz - z0
    h = heights_south_first
    return float(
        (h[z0, x0] * (1 - fx) + h[z0, x0 + 1] * fx) * (1 - fz)
        + (h[z0 + 1, x0] * (1 - fx) + h[z0 + 1, x0 + 1] * fx) * fz
    )


@dataclass(frozen=True)
class EncodedHeights:
    u16: np.ndarray  # south-first
    origin_elev_m: float
    rel_min_m: float
    rel_max_m: float


def encode_heights(elev_south_first: np.ndarray, size_m: float) -> EncodedHeights:
    origin = round(sample_bilinear(elev_south_first, size_m, 0.0, 0.0), 2)
    rel = elev_south_first - origin
    rel_min = math.floor(float(rel.min()) * 1000) / 1000
    rel_max = math.ceil(float(rel.max()) * 1000) / 1000
    if rel_max - rel_min < 1.0:  # flat input: keep a non-zero scale
        rel_max = rel_min + 1.0
    scaled = np.rint((rel - rel_min) / (rel_max - rel_min) * U16_MAX)
    return EncodedHeights(
        u16=np.clip(scaled, 0, U16_MAX).astype("<u2"),
        origin_elev_m=origin,
        rel_min_m=rel_min,
        rel_max_m=rel_max,
    )


def decode_heights(raw: bytes, px: int, rel_min_m: float, rel_max_m: float) -> np.ndarray:
    """Inverse of the u16 encoding (used by tests); row 0 = south."""
    v = np.frombuffer(raw, dtype="<u2").reshape(px, px).astype("float64")
    return rel_min_m + v * (rel_max_m - rel_min_m) / U16_MAX


def png_preview_bytes(u16_south_first: np.ndarray) -> bytes:
    north_up = np.ascontiguousarray(u16_south_first[::-1]).astype("uint16")
    with (
        rasterio.Env(GDAL_PAM_ENABLED="NO"),
        warnings.catch_warnings(),
        rasterio.MemoryFile() as mem,
    ):
        warnings.simplefilter("ignore", NotGeoreferencedWarning)
        with mem.open(
            driver="PNG",
            width=north_up.shape[1],
            height=north_up.shape[0],
            count=1,
            dtype="uint16",
        ) as dst:
            dst.write(north_up, 1)
        return mem.read()


# ---- buildings ------------------------------------------------------------

_NUMBER = re.compile(r"^\s*([0-9]+(?:\.[0-9]+)?)")


def _number(value: object) -> float | None:
    if value is None or (isinstance(value, float) and math.isnan(value)):
        return None
    m = _NUMBER.match(str(value))
    return float(m.group(1)) if m else None


def building_height_m(tags: dict[str, object]) -> float:
    """`height` (m), else `building:levels` * 3 m, else 2 levels (decision 31)."""
    h = _number(tags.get("height"))
    if h is not None and h > 0:
        return h
    levels = _number(tags.get("building:levels"))
    if levels is not None and levels > 0:
        return levels * LEVEL_HEIGHT_M
    return DEFAULT_LEVELS * LEVEL_HEIGHT_M


def osmnx_source(cache_dir: Path) -> BuildingsSource:
    """Live OSM fetch through osmnx; replies are cached in cache_dir (offline rebuilds)."""

    def fetch(bbox: tuple[float, float, float, float]) -> Any:
        import osmnx as ox
        from osmnx._errors import InsufficientResponseError

        ox.settings.use_cache = True
        ox.settings.cache_folder = str(cache_dir)
        ox.settings.requests_timeout = 180
        try:
            gdf = ox.features.features_from_bbox(bbox, tags={"building": True})
        except InsufficientResponseError as exc:
            raise EmptyReplyError(str(exc)) from exc
        if gdf is None:
            raise RuntimeError("Overpass returned no data (None)")
        return gdf

    return fetch


def fetch_with_retry(
    source: BuildingsSource,
    bbox: tuple[float, float, float, float],
    attempts: int = OVERPASS_ATTEMPTS,
    base_delay_s: float = OVERPASS_BASE_DELAY_S,
    sleep: Callable[[float], None] = time.sleep,
) -> tuple[Any, str]:
    """Returns (GeoDataFrame | None, status ∈ OK / EMPTY / UNAVAILABLE). Never raises."""
    for attempt in range(1, attempts + 1):
        try:
            gdf = source(bbox)
        except EmptyReplyError:
            log.info("OSM has no building footprints in this box")
            return None, "EMPTY"
        except Exception as exc:
            log.warning("Overpass attempt %d/%d failed: %s", attempt, attempts, exc)
            if attempt < attempts:
                sleep(base_delay_s * 2 ** (attempt - 1))
            continue
        if len(gdf) == 0:
            return None, "EMPTY"
        return gdf, "OK"
    banner = "!" * 72
    print(
        f"\n{banner}\n  WARNING: OSM buildings UNAVAILABLE after {attempts} attempts.\n"
        f"  The preset is built WITHOUT buildings (buildingsStatus = UNAVAILABLE).\n"
        f"  Re-run later to add them.\n{banner}\n",
        file=sys.stderr,
    )
    return None, "UNAVAILABLE"


@dataclass(frozen=True)
class Footprint:
    polygon: Any  # shapely Polygon in local metres, no holes
    height_m: float
    digits: int | None  # coordinate rounding: decimals, None = whole metres


def _parts_in_square(geom: Any, grid: Grid, tolerance_m: float, min_area_m2: float) -> list[Any]:
    """Clip to the square, simplify, drop holes and slivers."""
    from shapely.geometry import MultiPolygon, Polygon, box

    square = box(-grid.half, -grid.half, grid.half, grid.half)
    clipped = geom.intersection(square)
    parts = clipped.geoms if isinstance(clipped, MultiPolygon) else [clipped]
    out = []
    for part in parts:
        if not isinstance(part, Polygon) or part.is_empty:
            continue
        simple = part.simplify(tolerance_m, preserve_topology=True)
        # Holes (courtyards) are dropped: LOS treats a footprint as solid.
        if isinstance(simple, Polygon) and simple.area >= min_area_m2:
            out.append(Polygon(simple.exterior))
    return out


def osm_footprints(gdf: Any, grid: Grid) -> list[Footprint]:
    """Project OSM buildings, clip, simplify, filter and attach heights."""
    gdf = gdf[gdf.geometry.geom_type.isin(["Polygon", "MultiPolygon"])]
    if len(gdf) == 0:
        return []
    projected = gdf.to_crs(grid.crs)
    out: list[Footprint] = []
    for geom, (_, row) in zip(projected.geometry, projected.iterrows(), strict=True):
        tags = {k: row.get(k) for k in ("height", "building:levels")}
        height = building_height_m(tags)
        for part in _parts_in_square(geom, grid, SIMPLIFY_TOLERANCE_M, MIN_BUILDING_AREA_M2):
            out.append(Footprint(part, height, 1))
    return out


def read_footprint_tiles(paths: Sequence[Path], grid: Grid) -> list[tuple[Any, float]]:
    """(local-metre polygon, height or -1) for each tile footprint near the box, file order.

    Input: GeoJSONL, optionally gzipped, one lon/lat Polygon Feature per line with property
    `height` (m, -1 = unknown): the Microsoft Global ML Building Footprints tile format.
    """
    from pyproj import Transformer
    from shapely.geometry import Polygon

    to_local = Transformer.from_crs("EPSG:4326", grid.crs, always_xy=True)
    west, south, east, north = grid.lonlat_bounds(margin_m=100)
    out: list[tuple[Any, float]] = []
    for path in paths:
        with (
            gzip.open(path, "rt", encoding="utf-8")
            if path.suffix == ".gz"
            else path.open(encoding="utf-8")
        ) as fh:
            for line in fh:
                if not line.strip():
                    continue
                feature = json.loads(line)
                geometry = feature.get("geometry") or {}
                if geometry.get("type") != "Polygon":
                    continue
                ring = geometry["coordinates"][0]
                lons = [p[0] for p in ring]
                lats = [p[1] for p in ring]
                if max(lons) < west or min(lons) > east or max(lats) < south or min(lats) > north:
                    continue
                xs, zs = to_local.transform(lons, lats)
                height = _number((feature.get("properties") or {}).get("height"))
                out.append((Polygon(zip(xs, zs, strict=True)), height or -1.0))
    return out


def tile_footprints(
    tiles: Sequence[tuple[Any, float]],
    grid: Grid,
    taken: Sequence[Footprint],
    merge_gap_m: float = FOOTPRINT_MERGE_GAP_M,
    tolerance_m: float = FOOTPRINT_SIMPLIFY_M,
    min_area_m2: float = FOOTPRINT_MIN_AREA_M2,
) -> list[Footprint]:
    """Tile footprints that do not overlap a `taken` (OSM) one.

    A footprint with a known height stays separate. The rest get the 2-level default
    (decision 31) and are merged where closer than 2 * merge_gap_m, so a row of
    terraced houses becomes one block.
    """
    from shapely import STRtree
    from shapely.geometry import MultiPolygon
    from shapely.ops import unary_union

    taken_tree = STRtree([f.polygon for f in taken]) if taken else None
    known: list[Footprint] = []
    unknown: list[Any] = []
    for poly, height in tiles:
        geom = poly if poly.is_valid else poly.buffer(0)
        if geom.is_empty:
            continue
        if taken_tree is not None and len(taken_tree.query(geom, predicate="intersects")):
            continue
        if height > 0:
            known.extend(
                Footprint(p, height, None)
                for p in _parts_in_square(geom, grid, tolerance_m, min_area_m2)
            )
        else:
            unknown.append(geom)
    if unknown and merge_gap_m > 0:
        merged = unary_union([g.buffer(merge_gap_m, join_style="mitre") for g in unknown])
        merged = merged.buffer(-merge_gap_m, join_style="mitre")
        unknown = list(merged.geoms) if isinstance(merged, MultiPolygon) else [merged]
    default_h = DEFAULT_LEVELS * LEVEL_HEIGHT_M
    blocks = [
        Footprint(p, default_h, None)
        for g in unknown
        for p in _parts_in_square(g, grid, tolerance_m, min_area_m2)
    ]
    return known + blocks


def footprints_to_features(footprints: Sequence[Footprint]) -> list[dict[str, Any]]:
    """GeoJSON features sorted by centroid (north, then east): deterministic order."""

    def rnd(v: float, digits: int | None) -> float | int:
        return round(v) if digits is None else round(v, digits)

    keyed: list[tuple[float, float, dict[str, Any]]] = []
    for f in footprints:
        ring = [[rnd(x, f.digits), rnd(z, f.digits)] for x, z in f.polygon.exterior.coords]
        c = f.polygon.centroid
        keyed.append(
            (
                round(c.y, 1),
                round(c.x, 1),
                {
                    "type": "Feature",
                    "properties": {"heightM": round(f.height_m, 1)},
                    "geometry": {"type": "Polygon", "coordinates": [ring]},
                },
            )
        )
    keyed.sort(key=lambda f: (f[0], f[1]))
    return [f[2] for f in keyed]


def buildings_to_features(gdf: Any, grid: Grid) -> list[dict[str, Any]]:
    """OSM buildings only: project, clip, simplify, filter and attach heightM."""
    return footprints_to_features(osm_footprints(gdf, grid))


# ---- build ----------------------------------------------------------------


def _json_bytes(obj: object) -> bytes:
    return (json.dumps(obj, indent=2, ensure_ascii=False) + "\n").encode("utf-8")


def _feature_collection_bytes(features: Sequence[dict[str, Any]]) -> bytes:
    """Compact GeoJSON, one feature per line: small for a dense town, still diff-friendly."""
    if not features:
        return b'{"type":"FeatureCollection","features":[]}\n'
    lines = ",\n".join(json.dumps(f, separators=(",", ":")) for f in features)
    return ('{"type":"FeatureCollection","features":[\n' + lines + "\n]}\n").encode("utf-8")


def build_preset(
    dem_paths: Sequence[Path],
    grid: Grid,
    out_root: Path,
    utc_offset_min: int,
    buildings_source: BuildingsSource | None,
    sleep: Callable[[float], None] = time.sleep,
    footprint_paths: Sequence[Path] = (),
    revision: int = 1,
) -> dict[str, Any]:
    """Build and write one preset; returns the meta dict.

    buildings_source=None skips OSM (--no-buildings); footprint_paths adds offline tiles.
    """
    if grid.px < 2:
        raise PresetError("--px must be at least 2")
    elev = reproject_dem(dem_paths, grid)
    enc = encode_heights(elev, grid.size_m)

    if buildings_source is None:
        gdf, status = None, "EMPTY"
    else:
        gdf, status = fetch_with_retry(buildings_source, grid.lonlat_bounds(), sleep=sleep)
    osm = osm_footprints(gdf, grid) if gdf is not None else []
    tiles = (
        tile_footprints(read_footprint_tiles(footprint_paths, grid), grid, osm)
        if footprint_paths
        else []
    )
    features = footprints_to_features([*osm, *tiles])
    if status == "OK" and not osm:
        status = "EMPTY"
    if tiles:
        status = "OK"  # real footprints present (an OSM outage still printed its banner)

    attribution = [GLO30_ATTRIBUTION]
    if osm:
        attribution.append(OSM_ATTRIBUTION)
    if tiles:
        attribution.append(MS_ATTRIBUTION)
    dem_tiles = ", ".join(Path(p).stem for p in dem_paths)
    meta: dict[str, Any] = {
        "name": grid.name,
        "origin": {"lat": grid.lat, "lon": grid.lon},
        "utcOffsetMin": utc_offset_min,
        "sizeM": grid.size_m,
        "resolution": grid.px,
        "metresPerPx": grid.step,
        "originElevM": enc.origin_elev_m,
        "relMinM": enc.rel_min_m,
        "relMaxM": enc.rel_max_m,
        "minElevM": round(enc.origin_elev_m + enc.rel_min_m, 2),
        "maxElevM": round(enc.origin_elev_m + enc.rel_max_m, 2),
        "buildingsStatus": status,
        "buildingCount": len(features),
        "files": {
            "heightmap": "heightmap.u16",
            "preview": "heightmap.png",
            "buildings": "buildings.geojson",
        },
        "source": f"Copernicus DEM GLO-30 ({dem_tiles}); local AEQD grid, bilinear",
        "attribution": attribution,
    }
    if revision > 1:
        meta["revision"] = revision
    files = {
        "heightmap.u16": enc.u16.tobytes(),
        "heightmap.png": png_preview_bytes(enc.u16),
        "buildings.geojson": _feature_collection_bytes(features),
        "meta.json": _json_bytes(meta),
    }
    total = sum(len(b) for b in files.values())
    if total > MAX_PRESET_BYTES:
        raise PresetError(
            f"Preset is {total / 1e6:.1f} MB, over the {MAX_PRESET_BYTES / 1e6:.1f} MB budget "
            "(CLAUDE.md §12). Reduce --px or the box size."
        )
    out_dir = out_root / grid.name
    out_dir.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        (out_dir / name).write_bytes(data)
    log.info(
        "Wrote %s: %dx%d, %.1f m/px, elev %.0f..%.0f m, %d buildings (%d OSM, %d tile; %s), "
        "buildings %.2f MB, preset %.2f MB",
        out_dir,
        grid.px,
        grid.px,
        grid.step,
        meta["minElevM"],
        meta["maxElevM"],
        len(features),
        len(osm),
        len(tiles),
        status,
        len(files["buildings.geojson"]) / 1e6,
        total / 1e6,
    )
    return meta


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawTextHelpFormatter)
    p.add_argument("--dem", nargs="+", required=True, type=Path, help="DEM GeoTIFF(s)")
    where = p.add_mutually_exclusive_group(required=True)
    where.add_argument("--centre", help="lat,lon of the origin")
    where.add_argument("--bbox", help="minlon,minlat,maxlon,maxlat (square around its centre)")
    p.add_argument("--size-km", type=float, default=14.0, help="square side (with --centre)")
    p.add_argument("--px", type=int, default=512, help="samples per side")
    p.add_argument("--name", required=True, help="preset name, e.g. PUNJAB_PLAINS")
    p.add_argument("--utc-offset-min", type=int, default=330, help="local time offset (IST=330)")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE, help="OSM reply cache")
    p.add_argument("--no-buildings", action="store_true", help="skip the OSM building fetch")
    p.add_argument(
        "--footprints",
        nargs="+",
        type=Path,
        default=[],
        help="offline footprint tiles, GeoJSONL[.gz] (Microsoft Global ML Building Footprints)",
    )
    p.add_argument(
        "--revision",
        type=int,
        default=1,
        help="preset content revision; bump when a rebuild changes heights or buildings",
    )
    return p.parse_args(argv)


def grid_from_args(args: argparse.Namespace) -> Grid:
    if args.centre:
        lat, lon = (float(v) for v in args.centre.split(","))
        size_m = args.size_km * 1000
    else:
        w, s, e, n = (float(v) for v in args.bbox.split(","))
        lat, lon = (s + n) / 2, (w + e) / 2
        height_m = (n - s) * 111_320
        width_m = (e - w) * 111_320 * math.cos(math.radians(lat))
        size_m = round(max(height_m, width_m))
    return Grid(name=args.name, lat=lat, lon=lon, size_m=size_m, px=args.px)


def main(argv: Sequence[str] | None = None) -> int:
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    args = _parse_args(argv)
    if not re.fullmatch(r"[A-Z][A-Z0-9_]*", args.name):
        print("error: --name must be UPPER_SNAKE", file=sys.stderr)
        return 2
    source = None if args.no_buildings else osmnx_source(args.cache_dir)
    try:
        build_preset(
            args.dem,
            grid_from_args(args),
            args.out,
            args.utc_offset_min,
            source,
            footprint_paths=args.footprints,
            revision=args.revision,
        )
    except PresetError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
