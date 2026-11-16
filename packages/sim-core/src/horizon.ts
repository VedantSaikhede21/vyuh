import type { Vec3 } from './coords.ts';
import { datan2, dcos, dsin } from './dmath.ts';
import { sampleHeight } from './terrain.ts';
import type { World } from './world.ts';

// What is behind a contact seen from the EO camera: the sky, or terrain / a building
// at some distance (eo-haze plan §2.3, [C3]). Built once per camera from the world
// alone, so it is static: never part of a snapshot, identical in every replay.
//
// Each bearing bin keeps a "staircase": walking outwards from the camera, the
// points where the steepest slope seen so far, (height − camera height) ÷ distance,
// rises. Slopes stand in for elevation angles (same order, no atan per sample).
// A contact at slope s is skylined if no step reaches s; otherwise the first step
// at or above s is the terrain its line of sight meets behind it (LOS already
// guarantees nothing in front of the contact reaches s). Trees are display only
// (decision 170), so they are not in it.

/** Bearing bins per full circle (0.5° each). */
export const SKYLINE_BINS = 720;
/** Terrain sample spacing along each bearing, metres (the heightmaps are ~27 m). */
export const SKYLINE_STEP_M = 20;

export interface Skyline {
  readonly origin: Readonly<Vec3>;
  /** Per bin: [slope₀, distance₀, slope₁, distance₁, …], slopes strictly rising. */
  readonly bins: readonly Float64Array[];
}

const BIN_DEG = 360 / SKYLINE_BINS;

function binOf(dx: number, dz: number): number {
  const az = (datan2(dx, dz) * 180) / Math.PI;
  const a = az < 0 ? az + 360 : az;
  return Math.min(Math.floor(a / BIN_DEG), SKYLINE_BINS - 1);
}

/**
 * Building roofs per bin as [distance, slope] pairs, sorted by distance (then
 * slope). Footprints are 10–30 m against 0.5° bins, so each building counts as its
 * bounding box: the bins between its corner bearings get its roof at the box's
 * nearest distance (a few metres conservative).
 */
function buildingSamples(world: World, origin: Readonly<Vec3>): number[][] {
  const per: number[][] = Array.from({ length: SKYLINE_BINS }, () => []);
  for (const b of world.buildings.buildings) {
    const nx = Math.min(Math.max(origin.x, b.minX), b.maxX) - origin.x;
    const nz = Math.min(Math.max(origin.z, b.minZ), b.maxZ) - origin.z;
    const d = Math.hypot(nx, nz);
    if (d < SKYLINE_STEP_M) continue; // the camera's own site
    const slope = (b.topY - origin.y) / d;
    // Arc of bins covered by the corners, relative to the first corner's bin.
    const first = binOf(b.minX - origin.x, b.minZ - origin.z);
    let lo = 0;
    let hi = 0;
    for (const [x, z] of [
      [b.maxX, b.minZ],
      [b.maxX, b.maxZ],
      [b.minX, b.maxZ],
    ] as const) {
      let off = binOf(x - origin.x, z - origin.z) - first;
      if (off > SKYLINE_BINS / 2) off -= SKYLINE_BINS;
      if (off < -SKYLINE_BINS / 2) off += SKYLINE_BINS;
      lo = Math.min(lo, off);
      hi = Math.max(hi, off);
    }
    for (let k = lo; k <= hi; k++) {
      per[(((first + k) % SKYLINE_BINS) + SKYLINE_BINS) % SKYLINE_BINS]?.push(d, slope);
    }
  }
  return per.map((flat) => {
    const pairs: [number, number][] = [];
    for (let i = 0; i < flat.length; i += 2) pairs.push([flat[i] ?? 0, flat[i + 1] ?? 0]);
    pairs.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    return pairs.flat();
  });
}

export function buildSkyline(world: World, origin: Readonly<Vec3>): Skyline {
  const map = world.heightmap;
  const half = map.sizeM / 2;
  const fromBuildings = buildingSamples(world, origin);
  const bins: Float64Array[] = [];
  for (let b = 0; b < SKYLINE_BINS; b++) {
    const az = ((b + 0.5) * BIN_DEG * Math.PI) / 180;
    const ex = dsin(az);
    const ez = dcos(az);
    const extra = fromBuildings[b] ?? [];
    const steps: number[] = [];
    let best = -Infinity;
    let j = 0;
    const take = (d: number, slope: number) => {
      if (slope > best) {
        best = slope;
        steps.push(slope, d);
      }
    };
    for (let d = SKYLINE_STEP_M; ; d += SKYLINE_STEP_M) {
      const x = origin.x + ex * d;
      const z = origin.z + ez * d;
      if (Math.abs(x) > half || Math.abs(z) > half) break;
      // Building points nearer than this terrain sample come first.
      while (j < extra.length && (extra[j] ?? Infinity) <= d) {
        take(extra[j] ?? 0, extra[j + 1] ?? -Infinity);
        j += 2;
      }
      take(d, (sampleHeight(map, x, z) - origin.y) / d);
    }
    while (j < extra.length) {
      take(extra[j] ?? 0, extra[j + 1] ?? -Infinity);
      j += 2;
    }
    bins.push(Float64Array.from(steps));
  }
  return { origin, bins };
}

const cache = new WeakMap<World, Map<string, Skyline>>();

/**
 * buildSkyline, cached per world and camera position (a pure function of both, so
 * every sim, replay and keyframe of one scenario shares one profile).
 */
export function skylineFor(world: World, origin: Readonly<Vec3>): Skyline {
  let byOrigin = cache.get(world);
  if (byOrigin === undefined) {
    byOrigin = new Map();
    cache.set(world, byOrigin);
  }
  const key = `${origin.x},${origin.y},${origin.z}`;
  let sky = byOrigin.get(key);
  if (sky === undefined) {
    sky = buildSkyline(world, { x: origin.x, y: origin.y, z: origin.z });
    byOrigin.set(key, sky);
  }
  return sky;
}

/**
 * Distance from the camera to the terrain or building behind `to` along the line
 * of sight, or null when `to` is seen against the sky.
 */
export function backgroundDistanceM(sky: Skyline, to: Readonly<Vec3>): number | null {
  const dx = to.x - sky.origin.x;
  const dz = to.z - sky.origin.z;
  const r = Math.hypot(dx, dz);
  if (r < 1e-6) return null;
  const slope = (to.y - sky.origin.y) / r;
  const steps = sky.bins[binOf(dx, dz)];
  if (steps === undefined || steps.length === 0) return null;
  // First step with slope ≥ the contact's (slopes rise): binary search.
  let lo = 0;
  let hi = steps.length / 2;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((steps[mid * 2] ?? Infinity) >= slope) hi = mid;
    else lo = mid + 1;
  }
  return lo < steps.length / 2 ? (steps[lo * 2 + 1] ?? null) : null;
}
