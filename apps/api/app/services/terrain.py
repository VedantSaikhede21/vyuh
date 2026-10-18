"""Terrain presets on the server (decision 73): heights and building footprints only.

Reads `<TERRAIN_DIR>/<PRESET>/meta.json`, `heightmap.u16` and `buildings.geojson`
with the stdlib. The generator uses this for terrain clearance, siting and a
coarse routing heuristic; it is never a second LOS or sensor model (sim-core is
the judge of playability). Sampling mirrors `sampleHeight` in
packages/sim-core/src/terrain.ts (cross-checked by a fixture test).
"""

import json
import math
import sys
from array import array
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.core.config import get_settings
from app.core.errors import ApiError
from app.schemas.generated import ErrorCode, TerrainPresetMeta

Point = tuple[float, float]

#: Roof grid cell (decision 91): highest roof per cell, for the generator's ray heuristic.
ROOF_CELL_M = 50.0


@dataclass(frozen=True)
class Building:
    #: Outer ring [x, z] in local metres (as stored, decision 31).
    ring: tuple[Point, ...]
    height_m: float

    @property
    def centroid(self) -> Point:
        n = len(self.ring)
        return (sum(p[0] for p in self.ring) / n, sum(p[1] for p in self.ring) / n)


@dataclass(frozen=True)
class CoarseGrid:
    """n-by-n cell-centre heights; row 0 = south, column 0 = west."""

    n: int
    cell_m: float
    size_m: float
    heights: tuple[tuple[float, ...], ...]

    def centre(self, row: int, col: int) -> Point:
        half = self.size_m / 2
        return (-half + (col + 0.5) * self.cell_m, -half + (row + 0.5) * self.cell_m)

    def cell_of(self, x: float, z: float) -> tuple[int, int]:
        half = self.size_m / 2
        col = min(max(int((x + half) / self.cell_m), 0), self.n - 1)
        row = min(max(int((z + half) / self.cell_m), 0), self.n - 1)
        return row, col


@dataclass(frozen=True)
class RoofGrid:
    """n-by-n cells of ROOF_CELL_M from the south-west corner: highest roof top in each
    (scenario-frame y, building base = lowest terrain under its corners, as sim-core);
    -inf where there is no building."""

    n: int
    cell_m: float
    tops: array


@dataclass(frozen=True)
class Terrain:
    meta: TerrainPresetMeta
    #: Row-major heights (m, relative to the origin elevation); row 0 = south.
    heights: array
    buildings: tuple[Building, ...]

    @property
    def size_m(self) -> float:
        return self.meta.size_m

    @property
    def half(self) -> float:
        return self.meta.size_m / 2

    def height_at(self, x: float, z: float) -> float:
        """Bilinear height at scenario coords (x east, z north), clamped at the edges."""
        r = self.meta.resolution
        n = r - 1
        size = self.meta.size_m
        gx = min(max((x + size / 2) / size * n, 0.0), float(n))
        gz = min(max((z + size / 2) / size * n, 0.0), float(n))
        x0 = min(math.floor(gx), n - 1)
        z0 = min(math.floor(gz), n - 1)
        fx, fz = gx - x0, gz - z0
        h = self.heights
        h00, h10 = h[z0 * r + x0], h[z0 * r + x0 + 1]
        h01, h11 = h[(z0 + 1) * r + x0], h[(z0 + 1) * r + x0 + 1]
        return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz

    def roof_grid(self) -> RoofGrid | None:
        """The preset's roof grid (cached), or None without buildings."""
        name = self.meta.name
        if name not in _roofs:
            _roofs[name] = _build_roof_grid(self) if self.buildings else None
        return _roofs[name]

    def coarse_grid(self, n: int = 64) -> CoarseGrid:
        cell = self.meta.size_m / n
        half = self.meta.size_m / 2
        rows = tuple(
            tuple(
                self.height_at(-half + (c + 0.5) * cell, -half + (r + 0.5) * cell) for c in range(n)
            )
            for r in range(n)
        )
        return CoarseGrid(n=n, cell_m=cell, size_m=self.meta.size_m, heights=rows)


_roofs: dict[str, RoofGrid | None] = {}


def _build_roof_grid(terrain: Terrain) -> RoofGrid:
    c = ROOF_CELL_M
    n = math.ceil(terrain.size_m / c)
    half = terrain.half
    tops = array("d", [-math.inf]) * (n * n)
    for b in terrain.buildings:
        top = min(terrain.height_at(x, z) for x, z in b.ring) + b.height_m
        xs = [p[0] for p in b.ring]
        zs = [p[1] for p in b.ring]
        i0 = max(int((min(xs) + half) // c), 0)
        i1 = min(int((max(xs) + half) // c), n - 1)
        j0 = max(int((min(zs) + half) // c), 0)
        j1 = min(int((max(zs) + half) // c), n - 1)
        for j in range(j0, j1 + 1):
            for i in range(i0, i1 + 1):
                k = j * n + i
                if top > tops[k]:
                    tops[k] = top
    return RoofGrid(n=n, cell_m=c, tops=tops)


def _decode_u16(data: bytes, meta: TerrainPresetMeta) -> array:
    n = meta.resolution * meta.resolution
    if len(data) != n * 2:
        raise ValueError(f"heightmap.u16 has {len(data)} bytes, expected {n * 2}")
    raw = array("H")
    raw.frombytes(data)
    if sys.byteorder != "little":
        raw.byteswap()
    scale = (meta.rel_max_m - meta.rel_min_m) / 65535
    return array("d", (meta.rel_min_m + v * scale for v in raw))


def _parse_buildings(doc: dict) -> tuple[Building, ...]:
    out: list[Building] = []
    for feature in doc.get("features", []):
        geom = feature.get("geometry") or {}
        if geom.get("type") != "Polygon" or not geom.get("coordinates"):
            continue
        ring = tuple((float(p[0]), float(p[1])) for p in geom["coordinates"][0])
        height = float((feature.get("properties") or {}).get("heightM", 6.0))
        out.append(Building(ring=ring, height_m=height))
    return tuple(out)


def terrain_dir() -> Path:
    return Path(get_settings().terrain_dir)


@lru_cache(maxsize=8)
def _load(root: Path, preset: str) -> Terrain:
    folder = root / preset
    if not preset.replace("_", "").isalnum() or not (folder / "meta.json").is_file():
        raise ApiError(
            ErrorCode.VALIDATION_ERROR,
            f"Unknown terrain preset {preset!r}",
            {"terrainPreset": preset},
        )
    meta = TerrainPresetMeta.model_validate_json((folder / "meta.json").read_text("utf-8"))
    heights = _decode_u16((folder / meta.files.heightmap).read_bytes(), meta)
    buildings_file = folder / meta.files.buildings
    buildings = (
        _parse_buildings(json.loads(buildings_file.read_text("utf-8")))
        if buildings_file.is_file()
        else ()
    )
    return Terrain(meta=meta, heights=heights, buildings=buildings)


def preset_revision(preset: str) -> int:
    """A preset's content revision (`meta.revision`, absent = 1). Presets without
    files (the built-in PROCEDURAL_HILLS) are revision 1."""
    path = terrain_dir() / preset / "meta.json"
    if not preset.replace("_", "").isalnum() or not path.is_file():
        return 1
    meta = TerrainPresetMeta.model_validate_json(path.read_text("utf-8"))
    return meta.revision or 1


def load_terrain(preset: str) -> Terrain:
    """The preset's terrain (cached). Unknown preset → VALIDATION_ERROR."""
    return _load(terrain_dir(), preset)


def available_presets() -> list[str]:
    root = terrain_dir()
    return sorted(p.name for p in root.iterdir() if (p / "meta.json").is_file())
