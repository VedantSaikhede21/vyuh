import { buildingTopAt, cellTopAt } from './buildings.ts';
import type { Vec3 } from './coords.ts';
import { sampleHeight } from './terrain.ts';
import type { World } from './world.ts';

// Line of sight (SPEC §5): sample the straight segment sensor → contact at a
// fixed ~10 m horizontal step (integer step count, endpoints excluded) and test
// each sample against the terrain and the building footprints in its grid cell
// (skipped when the sample is above the cell's highest roof).

export const LOS_STEP_M = 10;
/** A sample this close above an obstacle still counts as clear (DEM noise). */
export const LOS_TOLERANCE_M = 0.5;
/** Buildings within this horizontal distance of the sensor are ignored (its own compound). */
export const LOS_OWN_SITE_M = 20;

export function hasLineOfSight(world: World, from: Readonly<Vec3>, to: Readonly<Vec3>): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(horiz / LOS_STEP_M));
  const checkBuildings = world.buildings.buildings.length > 0;
  for (let i = 1; i < n; i++) {
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
