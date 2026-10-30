"""Display-only terrain files for an existing preset (Part 6R, terrain plan T1, T2).

Never touches heightmap.u16, buildings.geojson or meta.revision, so sim results and
recorded sessions stay valid. Adds to <out>/<NAME>/:
  albedo.jpg   Sentinel-2 L2A median composite on the preset's AEQD grid, north up
  cover.png    land cover, north up: R water, G vegetation density, B bare ground, A snow
  ao.png       north up: R sky-view (ambient occlusion), G curvature (0.5 = flat)
  vegetation.bin  conifers placed from the land cover (--trees), see write_vegetation_bin
and writes <out>/_detail/detail.png, a tiling grey noise texture made here (no
third-party asset), and records the imagery and its credit in meta.json.

Imagery is read over HTTPS from the public Earth Search STAC catalogue; only the
window on the preset is fetched. Nothing is fetched by the app at runtime.

  uv run python build_display.py --name JK_MOUNTAIN --season 08-10
  uv run python build_display.py --name JK_MOUNTAIN --no-imagery      # AO only
  uv run python build_display.py --detail-only
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import urllib.request
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import numpy as np
import rasterio
from rasterio.enums import Resampling
from rasterio.transform import from_origin
from rasterio.vrt import WarpedVRT

from build_preset import DEFAULT_OUT, MAX_PRESET_BYTES, Grid, PresetError, decode_heights

STAC_URL = "https://earth-search.aws.element84.com/v1"
COLLECTION = "sentinel-2-c1-l2a"
# Scene classification classes kept: vegetation, bare, water, unclassified, snow.
SCL_VALID = (4, 5, 6, 7, 11)
# Steep terrain shadow is often classed as cloud shadow (3) in every scene, so a
# pixel with no strict sample falls back to anything that is not cloud.
SCL_CLOUD = (0, 1, 8, 9, 10)
SCL_WATER = 6
SCL_SNOW = 11
REFLECTANCE_SCALE = 0.0001
REFLECTANCE_OFFSET = -0.1
# One fixed display curve for every preset, so they share a grade.
DISPLAY_SHOULDER = 0.35
DISPLAY_GAMMA = 1.6
DISPLAY_SATURATION = 1.12
NDWI_WATER = 0.25
NDSI_SNOW = 0.4
AO_DIRECTIONS = 16
AO_STEPS = 24
AO_RANGE_M = 1500.0
DETAIL_PX = 512
# Tree placement (terrain plan §9.1). Conifer belt of the western Himalaya.
TREE_SPACING_M = 12.0
TREE_MAX_SLOPE = 0.78  # ~38°
TREE_MIN_ELEV_M = 2300.0
TREE_MAX_ELEV_M = 3450.0
TREE_MIN_COVER = 150
TREE_CAP = 50_000
TREE_RECORD = np.dtype([("x", "<u2"), ("z", "<u2"), ("kind", "u1"), ("scale", "u1")])
GDAL_ENV = {
    "AWS_NO_SIGN_REQUEST": "YES",
    "GDAL_DISABLE_READDIR_ON_OPEN": "EMPTY_DIR",
    "CPL_VSIL_CURL_ALLOWED_EXTENSIONS": ".tif",
    "GDAL_HTTP_MAX_RETRY": "4",
    "GDAL_HTTP_RETRY_DELAY": "3",
}


@dataclass(frozen=True)
class Scene:
    id: str
    date: str
    cloud: float
    assets: dict[str, str]


# ---- STAC -----------------------------------------------------------------


def parse_scenes(reply: dict[str, Any]) -> list[Scene]:
    scenes = []
    for f in reply.get("features", []):
        a = f["assets"]
        scenes.append(
            Scene(
                id=f["id"],
                date=f["properties"]["datetime"][:10],
                cloud=float(f["properties"].get("eo:cloud_cover", 100.0)),
                assets={k: a[k]["href"] for k in ("red", "green", "blue", "nir", "swir16", "scl")},
            )
        )
    return scenes


def month_windows(season: str, years: Sequence[int]) -> list[str]:
    first, last = (int(m) for m in season.split("-"))
    out = []
    for y in years:
        end_year = y if last >= first else y + 1
        out.append(f"{y}-{first:02d}-01T00:00:00Z/{end_year}-{last:02d}-28T23:59:59Z")
    return out


def stac_search(
    url: str, bbox: tuple[float, float, float, float], windows: Sequence[str], max_scenes: int
) -> list[Scene]:
    found: list[Scene] = []
    for window in windows:
        body = json.dumps(
            {
                "collections": [COLLECTION],
                "bbox": list(bbox),
                "datetime": window,
                "limit": 50,
                "query": {"eo:cloud_cover": {"lt": 20}},
            }
        ).encode()
        req = urllib.request.Request(  # noqa: S310 - fixed https catalogue URL
            f"{url}/search", data=body, headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=60) as res:  # noqa: S310
            found.extend(parse_scenes(json.load(res)))
    seen: set[str] = set()
    unique = [
        s for s in sorted(found, key=lambda s: s.cloud) if not (s.id in seen or seen.add(s.id))
    ]
    return unique[:max_scenes]


# ---- imagery --------------------------------------------------------------


def read_band(href: str, grid: Grid, px: int, nearest: bool = False) -> np.ndarray:
    """One band resampled onto the preset's grid at px², north up."""
    step = grid.size_m / px
    transform = from_origin(-grid.half, grid.half, step, step)
    kind = Resampling.nearest if nearest else Resampling.bilinear
    with (
        rasterio.open(href) as src,
        WarpedVRT(
            src, crs=grid.crs, transform=transform, width=px, height=px, resampling=kind, nodata=0
        ) as vrt,
    ):
        return vrt.read(1)


def to_reflectance(raw: np.ndarray) -> np.ndarray:
    return raw.astype("float32") * REFLECTANCE_SCALE + REFLECTANCE_OFFSET


def median_composite(
    stack: np.ndarray, valid: np.ndarray, fallback: np.ndarray | None = None
) -> np.ndarray:
    """Per-pixel median over scenes (axis 0). Pixels with no valid sample use
    `fallback` samples, then every sample; a pixel masked in all is 0."""
    chosen = valid
    if fallback is not None:
        chosen = np.where(valid.any(axis=0), valid, fallback)
    chosen = np.where(chosen.any(axis=0), chosen, fallback is not None)
    masked = np.where(chosen, stack, np.nan)
    masked[0][~chosen.any(axis=0)] = 0.0
    return np.nanmedian(masked, axis=0)


def reflectance_to_srgb(rgb: np.ndarray) -> np.ndarray:
    """Reflectance (H, W, 3) to display uint8: a shoulder keeps snow from clipping,
    then gamma and mild saturation. 0 stays 0 and reflectance 1 is white."""
    r = np.clip(rgb, 0.0, 1.0)
    v = (r * (1.0 + DISPLAY_SHOULDER) / (r + DISPLAY_SHOULDER)) ** (1.0 / DISPLAY_GAMMA)
    grey = v.mean(axis=-1, keepdims=True)
    v = np.clip(grey + (v - grey) * DISPLAY_SATURATION, 0.0, 1.0)
    return (v * 255.0 + 0.5).astype("uint8")


def cover_mask(
    red: np.ndarray,
    green: np.ndarray,
    nir: np.ndarray,
    swir: np.ndarray,
    scl_water: np.ndarray,
    scl_snow: np.ndarray,
) -> np.ndarray:
    """uint8 (H, W, 4): water, vegetation density, bare ground, snow."""
    eps = 1e-5
    ndvi = (nir - red) / (nir + red + eps)
    ndwi = (green - nir) / (green + nir + eps)
    ndsi = (green - swir) / (green + swir + eps)
    water = (ndwi > NDWI_WATER) | scl_water
    snow = ((ndsi > NDSI_SNOW) & (green > 0.2)) | scl_snow
    veg = np.clip((ndvi - 0.2) / 0.5, 0.0, 1.0) * ~water * ~snow
    bare = np.clip(1.0 - veg, 0.0, 1.0) * ~water * ~snow
    out = np.stack([water * 1.0, veg, bare, snow * 1.0], axis=-1)
    return (out * 255.0 + 0.5).astype("uint8")


# ---- relief ---------------------------------------------------------------


def _shifted(h: np.ndarray, dr: int, dc: int) -> np.ndarray:
    n_r, n_c = h.shape
    rows = np.clip(np.arange(n_r) + dr, 0, n_r - 1)
    cols = np.clip(np.arange(n_c) + dc, 0, n_c - 1)
    return h[np.ix_(rows, cols)]


def sky_view(h: np.ndarray, step_m: float, range_m: float = AO_RANGE_M) -> np.ndarray:
    """Fraction of the sky seen from each node: 1 on a plane, lower in a valley."""
    total = np.zeros_like(h, dtype="float64")
    for k in range(AO_DIRECTIONS):
        angle = 2.0 * np.pi * k / AO_DIRECTIONS
        horizon = np.zeros_like(h, dtype="float64")
        for s in range(1, AO_STEPS + 1):
            dist = range_m * (s / AO_STEPS) ** 1.5
            dr = round(np.sin(angle) * dist / step_m)
            dc = round(np.cos(angle) * dist / step_m)
            if dr == 0 and dc == 0:
                continue
            real = np.hypot(dr, dc) * step_m
            horizon = np.maximum(horizon, (_shifted(h, dr, dc) - h) / real)
        total += 1.0 / (1.0 + horizon**2)  # cos² of the horizon angle
    return total / AO_DIRECTIONS


def curvature(h: np.ndarray, step_m: float) -> np.ndarray:
    """Laplacian, m⁻¹: positive in a bowl, negative on a dome."""
    return (
        _shifted(h, 1, 0) + _shifted(h, -1, 0) + _shifted(h, 0, 1) + _shifted(h, 0, -1) - 4.0 * h
    ) / step_m**2


def ao_channels(h_south_first: np.ndarray, step_m: float) -> np.ndarray:
    """uint8 (H, W, 2), north up: sky view, curvature mapped so 0.5 is flat."""
    sv = sky_view(h_south_first, step_m)
    curv = curvature(h_south_first, step_m)
    scale = max(float(np.percentile(np.abs(curv), 98)), 1e-6)
    curv01 = np.clip(0.5 + 0.5 * curv / scale, 0.0, 1.0)
    out = np.stack([sv, curv01], axis=-1)[::-1]
    return (np.clip(out, 0.0, 1.0) * 255.0 + 0.5).astype("uint8")


def detail_noise(px: int = DETAIL_PX, seed: int = 1) -> np.ndarray:
    """Seamless grey noise (H, W, 3): fine mottling, medium patches, stretched streaks."""
    rng = np.random.default_rng(seed)

    def band(lo: int, hi: int, aspect: float = 1.0) -> np.ndarray:
        fy = np.fft.fftfreq(px)[:, None] * px
        fx = np.fft.rfftfreq(px)[None, :] * px
        f = np.hypot(fx, fy * aspect)
        gain = np.where((f >= lo) & (f <= hi), 1.0 / np.maximum(f, 1.0) ** 0.9, 0.0)
        phase = rng.uniform(0.0, 2.0 * np.pi, gain.shape)
        tile = np.fft.irfft2(gain * np.exp(1j * phase), s=(px, px))
        return 0.5 + 0.5 * np.clip(tile / (3.0 * tile.std()), -1.0, 1.0)

    out = np.stack([band(24, 200), band(6, 64), band(10, 120, 5.0)], axis=-1)
    return (out * 255.0 + 0.5).astype("uint8")


def place_vegetation(
    h_south_first: np.ndarray,
    origin_elev_m: float,
    size_m: float,
    cover_north_up: np.ndarray,
    seed: int = 1,
) -> np.ndarray:
    """Trees as a TREE_RECORD array: x, z quantised over the preset (0 = west / south),
    kind 0 = conifer, scale 0..255 = 0.8..1.3. The same seed gives the same trees."""
    rng = np.random.default_rng(seed)
    n = h_south_first.shape[0]
    count = int(size_m / TREE_SPACING_M)
    edges = (np.arange(count) + 0.5) / count
    u, v = np.meshgrid(edges, edges)  # east, north fractions
    u = np.clip(u + rng.uniform(-0.4, 0.4, u.shape) / count, 0.0, 0.9999)
    v = np.clip(v + rng.uniform(-0.4, 0.4, v.shape) / count, 0.0, 0.9999)

    cover_n = cover_north_up.shape[0]
    density = cover_north_up[((1.0 - v) * cover_n).astype(int), (u * cover_n).astype(int)]
    grid_r = (v * (n - 1)).astype(int)
    grid_c = (u * (n - 1)).astype(int)
    elev = h_south_first[grid_r, grid_c] + origin_elev_m
    step = size_m / (n - 1)
    gr, gc = np.gradient(h_south_first, step)
    slope = np.hypot(gr, gc)[grid_r, grid_c]
    keep = (
        (density >= TREE_MIN_COVER)
        & (slope <= TREE_MAX_SLOPE)
        & (elev >= TREE_MIN_ELEV_M)
        & (elev <= TREE_MAX_ELEV_M)
        & (rng.uniform(0.0, 255.0, u.shape) < density)
    )
    xs, zs = u[keep], v[keep]
    if xs.size > TREE_CAP:
        pick = rng.choice(xs.size, TREE_CAP, replace=False)
        pick.sort()
        xs, zs = xs[pick], zs[pick]
    out = np.zeros(xs.size, dtype=TREE_RECORD)
    out["x"] = (xs * 65535.0).astype("<u2")
    out["z"] = (zs * 65535.0).astype("<u2")
    out["scale"] = rng.integers(0, 256, xs.size, dtype="u1")
    return out


def write_vegetation_bin(path: Path, trees: np.ndarray) -> None:
    path.write_bytes(trees.astype(TREE_RECORD).tobytes())


# ---- files ----------------------------------------------------------------


def write_png(path: Path, bands_last: np.ndarray) -> None:
    arr = np.moveaxis(bands_last, -1, 0)
    with rasterio.open(
        path,
        "w",
        driver="PNG",
        width=arr.shape[2],
        height=arr.shape[1],
        count=arr.shape[0],
        dtype="uint8",
        ZLEVEL=9,
    ) as dst:
        dst.write(arr)


def write_jpeg(path: Path, rgb: np.ndarray, quality: int = 85) -> None:
    arr = np.moveaxis(rgb, -1, 0)
    with rasterio.open(
        path,
        "w",
        driver="JPEG",
        width=arr.shape[2],
        height=arr.shape[1],
        count=3,
        dtype="uint8",
        QUALITY=quality,
    ) as dst:
        dst.write(arr)
    for extra in path.parent.glob(path.name + ".aux.xml"):
        extra.unlink()


def imagery_credit(dates: Sequence[str]) -> str:
    years = sorted({d[:4] for d in dates})
    span = years[0] if len(years) == 1 else f"{years[0]}-{years[-1]}"
    return f"Contains modified Copernicus Sentinel data {span}, processed by VYUH"


def build_imagery(
    grid: Grid,
    folder: Path,
    season: str,
    years: Sequence[int],
    max_scenes: int,
    px: int,
    stac_url: str,
) -> dict[str, Any]:
    bbox = grid.lonlat_bounds()
    scenes = stac_search(stac_url, bbox, month_windows(season, years), max_scenes)
    if not scenes:
        raise PresetError(f"No Sentinel-2 scenes for {grid.name} in {season}")
    cover_px = px // 2
    rgb_stack, cover_bands, valid_full, soft_full, valid_half, water, snow, used = (
        [],
        [],
        [],
        [],
        [],
        [],
        [],
        [],
    )
    for scene in scenes:
        print(f"  {scene.id} cloud {scene.cloud:.1f} %", flush=True)
        scl_full = read_band(scene.assets["scl"], grid, px, nearest=True)
        scl_half = scl_full[::2, ::2][:cover_px, :cover_px]
        ok_full = np.isin(scl_full, SCL_VALID)
        if ok_full.mean() < 0.15:
            print("    skipped: no valid pixels on the preset", flush=True)
            continue
        rgb = [
            to_reflectance(read_band(scene.assets[b], grid, px)) for b in ("red", "green", "blue")
        ]
        rgb_stack.append(np.stack(rgb, axis=-1))
        valid_full.append(ok_full)
        soft_full.append(~np.isin(scl_full, SCL_CLOUD))
        halves = [
            to_reflectance(read_band(scene.assets[b], grid, cover_px))
            for b in ("red", "green", "nir", "swir16")
        ]
        cover_bands.append(np.stack(halves, axis=-1))
        valid_half.append(np.isin(scl_half, SCL_VALID))
        water.append(scl_half == SCL_WATER)
        snow.append(scl_half == SCL_SNOW)
        used.append(scene)
    if not used:
        raise PresetError(f"Every scene for {grid.name} was cloud-masked")

    stack = np.stack(rgb_stack)
    valid = np.stack(valid_full)
    soft = np.stack(soft_full)
    composite = np.stack([median_composite(stack[..., b], valid, soft) for b in range(3)], axis=-1)
    write_jpeg(folder / "albedo.jpg", reflectance_to_srgb(composite))

    half = np.stack(cover_bands)
    half_valid = np.stack(valid_half)
    red, green, nir, swir = (median_composite(half[..., b], half_valid) for b in range(4))
    majority = lambda masks: np.mean(np.stack(masks), axis=0) > 0.5  # noqa: E731
    write_png(
        folder / "cover.png", cover_mask(red, green, nir, swir, majority(water), majority(snow))
    )
    dates = sorted(s.date for s in used)
    return {
        "product": "Sentinel-2 L2A median composite",
        "scenes": [s.id for s in used],
        "dateFrom": dates[0],
        "dateTo": dates[-1],
        "processing": (
            f"Per-pixel median of {len(used)} scenes after SCL masking of cloud and shadow; "
            f"reflectance shoulder {DISPLAY_SHOULDER}, gamma {DISPLAY_GAMMA}, "
            f"saturation {DISPLAY_SATURATION}"
        ),
        "licence": "Copernicus Sentinel data terms (free, full and open; attribution required)",
        "credit": imagery_credit(dates),
    }


def display_hash(folder: Path, names: Sequence[str]) -> str:
    digest = hashlib.sha256()
    for name in sorted(names):
        digest.update((folder / name).read_bytes())
    return digest.hexdigest()[:10]


def update_meta(folder: Path, imagery: dict[str, Any] | None, trees: bool = False) -> None:
    meta_path = folder / "meta.json"
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    files = meta["files"]
    files["ao"] = "ao.png"
    if imagery:
        files["albedo"] = "albedo.jpg"
        files["cover"] = "cover.png"
        meta["imagery"] = imagery
        meta["attribution"] = [line for line in meta["attribution"] if "Sentinel" not in line] + [
            imagery["credit"]
        ]
    if trees:
        files["vegetation"] = "vegetation.bin"
    display = [files[k] for k in ("ao", "albedo", "cover", "vegetation") if k in files]
    meta["displayHash"] = display_hash(folder, display)
    meta_path.write_text(
        json.dumps(meta, indent=2, ensure_ascii=False) + "\n", encoding="utf-8", newline="\n"
    )
    total = sum(p.stat().st_size for p in folder.iterdir() if p.is_file())
    if total > MAX_PRESET_BYTES:
        raise PresetError(f"{folder.name} is {total / 1e6:.1f} MB, over the preset limit")
    print(f"{folder.name}: {total / 1e6:.1f} MB")


def _parse_args(argv: Sequence[str] | None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--name", help="preset name, e.g. JK_MOUNTAIN")
    p.add_argument("--out", type=Path, default=DEFAULT_OUT)
    p.add_argument("--season", default="08-10", help="acquisition months MM-MM")
    p.add_argument("--years", default="2023,2024,2025")
    p.add_argument("--max-scenes", type=int, default=6)
    p.add_argument("--imagery-px", type=int, default=1536)
    p.add_argument("--stac-url", default=STAC_URL)
    p.add_argument("--no-imagery", action="store_true", help="relief files only")
    p.add_argument("--trees", action="store_true", help="place vegetation.bin from cover.png")
    p.add_argument("--seed", type=int, default=1, help="tree placement seed")
    p.add_argument("--detail-only", action="store_true", help="only _detail/detail.png")
    return p.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = _parse_args(argv)
    os.environ.update(GDAL_ENV)
    detail_dir = args.out / "_detail"
    detail_dir.mkdir(parents=True, exist_ok=True)
    if args.detail_only or not (detail_dir / "detail.png").exists():
        write_png(detail_dir / "detail.png", detail_noise())
    if args.detail_only:
        return 0
    if not args.name:
        raise SystemExit("--name is required")

    folder = args.out / args.name
    meta = json.loads((folder / "meta.json").read_text(encoding="utf-8"))
    grid = Grid(
        args.name, meta["origin"]["lat"], meta["origin"]["lon"], meta["sizeM"], meta["resolution"]
    )
    raw = (folder / meta["files"]["heightmap"]).read_bytes()
    heights = decode_heights(raw, meta["resolution"], meta["relMinM"], meta["relMaxM"])
    write_png(folder / "ao.png", ao_channels(heights, grid.step))
    imagery = None
    if not args.no_imagery:
        years = [int(y) for y in args.years.split(",")]
        imagery = build_imagery(
            grid, folder, args.season, years, args.max_scenes, args.imagery_px, args.stac_url
        )
    if args.trees:
        with rasterio.open(folder / "cover.png") as src:
            density = src.read(2)
        trees = place_vegetation(heights, meta["originElevM"], meta["sizeM"], density, args.seed)
        write_vegetation_bin(folder / "vegetation.bin", trees)
        print(f"{args.name}: {trees.size} trees")
    update_meta(folder, imagery, args.trees)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
