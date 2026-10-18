import { buildingTopAt, cellTopAt, type BuildingIndex } from './buildings.ts';
import type { Vec3 } from './coords.ts';
import { sampleHeight, type Heightmap } from './terrain.ts';
import type { World } from './world.ts';

// Line of sight (SPEC §5): sample the straight segment sensor → contact at a
// fixed ~10 m horizontal step (integer step count, endpoints excluded) and test
// each sample against the terrain and the building footprints in its grid cell
// (skipped when the sample is above the cell's highest roof).
//
// Coarse early-out (Phase 3b): the samples are walked in chunks of
// LOS_CHUNK_SAMPLES, and a chunk whose lowest sample is above the obstacle
// ceiling of every 100 m tile it touches skips the per-sample tests. The
// ceiling is at least every terrain vertex and roof a sample in the tile can
// read, and sample positions are monotonic in the step index, so the skip
// cannot change a result.

export const LOS_STEP_M = 10;
/** A sample this close above an obstacle still counts as clear (DEM noise). */
export const LOS_TOLERANCE_M = 0.5;
/** Buildings within this horizontal distance of the sensor are ignored (its own compound). */
export const LOS_OWN_SITE_M = 20;

/** Side of an obstacle-ceiling tile, metres. */
export const LOS_TILE_M = 100;
/** Samples per early-out chunk (80 m at the 10 m step). */
export const LOS_CHUNK_SAMPLES = 8;

/** Per-tile upper bound of everything a LOS sample in the tile can hit. */
export interface ObstacleCeiling {
  readonly tileM: number;
  readonly cols: number;
  readonly half: number;
  /** tile key → ceiling (scenario-frame y). */
  readonly top: Float64Array;
}

export function createObstacleCeiling(
  terrain: Heightmap,
  buildings: BuildingIndex,
  tileM = LOS_TILE_M,
): ObstacleCeiling {
  const half = terrain.sizeM / 2;
  const cols = Math.max(1, Math.ceil(terrain.sizeM / tileM));
  const top = new Float64Array(cols * cols).fill(-Infinity);
  const n = terrain.resolution - 1;
  const r = terrain.resolution;
  const vPerM = n / terrain.sizeM;
  const cPerM = 1 / buildings.cellM;
  // One vertex / cell of margin on each side absorbs rounding at tile edges.
  const span = (lo: number, hi: number, perM: number, max: number) =>
    [Math.max(0, Math.floor(lo * perM) - 1), Math.min(max, Math.floor(hi * perM) + 2)] as const;
  for (let tz = 0; tz < cols; tz++) {
    const [vz0, vz1] = span(tz * tileM, (tz + 1) * tileM, vPerM, n);
    const [cz0, cz1] = span(tz * tileM, (tz + 1) * tileM, cPerM, buildings.cols - 1);
    for (let tx = 0; tx < cols; tx++) {
      const [vx0, vx1] = span(tx * tileM, (tx + 1) * tileM, vPerM, n);
      const [cx0, cx1] = span(tx * tileM, (tx + 1) * tileM, cPerM, buildings.cols - 1);
      let m = -Infinity;
      for (let vz = vz0; vz <= vz1; vz++) {
        for (let vx = vx0; vx <= vx1; vx++) m = Math.max(m, terrain.heights[vz * r + vx] ?? m);
      }
      for (let cz = cz0; cz <= cz1; cz++) {
        for (let cx = cx0; cx <= cx1; cx++) {
          m = Math.max(m, buildings.cellTop[cz * buildings.cols + cx] ?? m);
        }
      }
      // Margin for float rounding in the bilinear blend.
      top[tz * cols + tx] = m + 0.01;
    }
  }
  return { tileM, cols, half, top };
}

function tileOf(c: ObstacleCeiling, v: number): number {
  const clamped = Math.min(Math.max(v, -c.half), c.half);
  return Math.min(Math.max(Math.floor((clamped + c.half) / c.tileM), 0), c.cols - 1);
}

/** Highest ceiling over the tiles touching the box [x0, x1] × [z0, z1]. */
function ceilingOver(c: ObstacleCeiling, x0: number, x1: number, z0: number, z1: number): number {
  const ax = tileOf(c, x0);
  const bx = tileOf(c, x1);
  const bz = tileOf(c, z1);
  let m = -Infinity;
  for (let tz = tileOf(c, z0); tz <= bz; tz++) {
    for (let tx = ax; tx <= bx; tx++) m = Math.max(m, c.top[tz * c.cols + tx] ?? Infinity);
  }
  return m;
}

export function hasLineOfSight(world: World, from: Readonly<Vec3>, to: Readonly<Vec3>): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(horiz / LOS_STEP_M));
  const checkBuildings = world.buildings.buildings.length > 0;
  for (let i0 = 1; i0 < n; i0 += LOS_CHUNK_SAMPLES) {
    const i1 = Math.min(i0 + LOS_CHUNK_SAMPLES - 1, n - 1);
    const ta = i0 / n;
    const tb = i1 / n;
    const xa = from.x + dx * ta;
    const xb = from.x + dx * tb;
    const za = from.z + dz * ta;
    const zb = from.z + dz * tb;
    const yLow = Math.min(from.y + dy * ta, from.y + dy * tb);
    const ceiling = ceilingOver(
      world.ceiling,
      Math.min(xa, xb),
      Math.max(xa, xb),
      Math.min(za, zb),
      Math.max(za, zb),
    );
    if (yLow + LOS_TOLERANCE_M >= ceiling) continue;
    for (let i = i0; i <= i1; i++) {
      const t = i / n;
      const x = from.x + dx * t;
      const y = from.y + dy * t;
      const z = from.z + dz * t;
      if (y + LOS_TOLERANCE_M < sampleHeight(world.heightmap, x, z)) return false;
      if (
        checkBuildings &&
        horiz * t > LOS_OWN_SITE_M &&
        y + LOS_TOLERANCE_M < cellTopAt(world.buildings, x, z)
      ) {
        const top = buildingTopAt(world.buildings, x, z);
        if (top !== null && y + LOS_TOLERANCE_M < top) return false;
      }
    }
  }
  return true;
}

/**
 * LOS results cached per (sensor, contact) for one tick (SPEC §5). The cache
 * empties itself when asked about a different tick. Pure: caching never
 * changes a result.
 */
export interface LosCache {
  visible(tick: number, sensorId: string, from: Vec3, contactId: string, to: Vec3): boolean;
}

export function createLosCache(world: World): LosCache {
  let cachedTick = -1;
  const results = new Map<string, boolean>();
  return {
    visible(tick, sensorId, from, contactId, to) {
      if (tick !== cachedTick) {
        results.clear();
        cachedTick = tick;
      }
      const key = `${sensorId}\u0000${contactId}`;
      let v = results.get(key);
      if (v === undefined) {
        v = hasLineOfSight(world, from, to);
        results.set(key, v);
      }
      return v;
    },
  };
}
