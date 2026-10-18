import type { TerrainPresetMeta } from '@vyuh/shared';
import {
  createBuildingIndex,
  parseBuildingsGeoJson,
  type BuildingFootprint,
  type BuildingIndex,
} from './buildings.ts';
import { createObstacleCeiling, type ObstacleCeiling } from './los.ts';
import {
  PROCEDURAL_HILLS,
  createHeightmap,
  createProceduralTerrain,
  type Heightmap,
} from './terrain.ts';

// The sim's world (SPEC §5): heightmap (heights relative to the preset origin
// elevation) + building footprints + the preset meta. Decoding a real preset is
// a pure function of its file contents; fetching them is the caller's job.

export interface World {
  readonly heightmap: Heightmap;
  readonly buildings: BuildingIndex;
  /** LOS early-out ceilings (terrain + roofs per 100 m tile). */
  readonly ceiling: ObstacleCeiling;
  /** null when a bare Heightmap was supplied (tests, legacy callers). */
  readonly meta: TerrainPresetMeta | null;
}

export function createWorld(
  heightmap: Heightmap,
  footprints: readonly BuildingFootprint[] = [],
  meta: TerrainPresetMeta | null = null,
): World {
  const buildings = createBuildingIndex(footprints, heightmap);
  return { heightmap, buildings, ceiling: createObstacleCeiling(heightmap, buildings), meta };
}

export function isWorld(t: Heightmap | World): t is World {
  return 'heightmap' in t;
}

/** Decode heightmap.u16 (little-endian, row 0 = south) using the meta's scaling. */
export function decodeHeightmapU16(
  data: ArrayBuffer | Uint8Array,
  meta: Pick<TerrainPresetMeta, 'resolution' | 'sizeM' | 'relMinM' | 'relMaxM'>,
): Heightmap {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  const n = meta.resolution * meta.resolution;
  if (bytes.byteLength !== n * 2) {
    throw new RangeError(`heightmap.u16 has ${bytes.byteLength} bytes, expected ${n * 2}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scale = (meta.relMaxM - meta.relMinM) / 65535;
  const heights = new Float32Array(n);
  for (let i = 0; i < n; i++) heights[i] = meta.relMinM + view.getUint16(i * 2, true) * scale;
  return createHeightmap(meta.sizeM, meta.resolution, heights);
}

export function worldFromPreset(
  meta: TerrainPresetMeta,
  heightmapU16: ArrayBuffer | Uint8Array,
  buildingsJson: unknown,
): World {
  const heightmap = decodeHeightmapU16(heightmapU16, meta);
  return createWorld(heightmap, parseBuildingsGeoJson(buildingsJson), meta);
}

/** Meta of the built-in procedural preset (fictional location; no external data). */
export const PROCEDURAL_HILLS_META: TerrainPresetMeta = {
  name: PROCEDURAL_HILLS,
  origin: { lat: 27, lon: 74 },
  utcOffsetMin: 330,
  sizeM: 12_000,
  resolution: 257,
  metresPerPx: 12_000 / 256,
  originElevM: 0,
  relMinM: 0,
  relMaxM: 60,
  minElevM: 0,
  maxElevM: 60,
  buildingsStatus: 'EMPTY',
  buildingCount: 0,
  files: { heightmap: 'builtin', buildings: 'builtin' },
  source: 'Procedural value noise generated in packages/sim-core (no external data)',
  attribution: ['Procedural terrain generated in code'],
};

/** Built-in presets that need no files; null for file-based presets. */
export function builtinWorld(preset: string): World | null {
  if (preset !== PROCEDURAL_HILLS) return null;
  return createWorld(createProceduralTerrain(), [], PROCEDURAL_HILLS_META);
}
