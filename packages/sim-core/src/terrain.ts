import { createRng } from './rng.ts';

// Heightmap terrain. Phase 1 uses a procedural preset; Phase 2 real-DEM presets
// build the same Heightmap from a PNG, so sampling code is shared.

export interface Heightmap {
  /** Side length of the square map, metres; centred on the scenario origin. */
  readonly sizeM: number;
  /** Samples per side (grid is resolution × resolution). */
  readonly resolution: number;
  /** Row-major heights in metres; row 0 is the southern edge (z = −sizeM/2). */
  readonly heights: Float32Array;
}

export function createHeightmap(
  sizeM: number,
  resolution: number,
  heights: Float32Array,
): Heightmap {
  if (resolution < 2 || heights.length !== resolution * resolution) {
    throw new RangeError(`heights must have ${resolution}² samples`);
  }
  if (!(sizeM > 0)) throw new RangeError('sizeM must be positive');
  return { sizeM, resolution, heights };
}

/** Height (m) at scenario coords (x east, z north); bilinear, clamped at the edges. */
export function sampleHeight(map: Heightmap, x: number, z: number): number {
  const n = map.resolution - 1;
  const half = map.sizeM / 2;
  const gx = Math.min(Math.max(((x + half) / map.sizeM) * n, 0), n);
  const gz = Math.min(Math.max(((z + half) / map.sizeM) * n, 0), n);
  const x0 = Math.min(Math.floor(gx), n - 1);
  const z0 = Math.min(Math.floor(gz), n - 1);
  const fx = gx - x0;
  const fz = gz - z0;
  const h = map.heights;
  const r = map.resolution;
  const h00 = h[z0 * r + x0] ?? 0;
  const h10 = h[z0 * r + x0 + 1] ?? 0;
  const h01 = h[(z0 + 1) * r + x0] ?? 0;
  const h11 = h[(z0 + 1) * r + x0 + 1] ?? 0;
  return (h00 * (1 - fx) + h10 * fx) * (1 - fz) + (h01 * (1 - fx) + h11 * fx) * fz;
}

export interface ProceduralTerrainOptions {
  sizeM?: number;
  resolution?: number;
  seed?: number;
  /** Peak-to-trough relief, metres. */
  reliefM?: number;
  /** Radius around the origin flattened for the defended position, metres. */
  flatRadiusM?: number;
}

/** Id of the Phase 1 procedural preset (scenario `terrain.preset`). */
export const PROCEDURAL_HILLS = 'PROCEDURAL_HILLS';

const smooth = (t: number): number => t * t * (3 - 2 * t);

/**
 * Gentle rolling hills from seeded value noise (3 octaves). Deterministic for a
 * given seed; the area around the origin is eased flat so the defended asset
 * sits on level ground.
 */
export function createProceduralTerrain(opts: ProceduralTerrainOptions = {}): Heightmap {
  const sizeM = opts.sizeM ?? 12_000;
  const resolution = opts.resolution ?? 257;
  const reliefM = opts.reliefM ?? 60;
  const flatRadiusM = opts.flatRadiusM ?? 400;
  const rng = createRng(opts.seed ?? 1).stream('terrain');

  const octaves = [
    { cells: 4, amp: 1 },
    { cells: 9, amp: 0.45 },
    { cells: 21, amp: 0.15 },
  ].map(({ cells, amp }) => {
    const lattice = Float32Array.from({ length: (cells + 1) * (cells + 1) }, () => rng.next());
    return { cells, amp, lattice };
  });
  const ampSum = octaves.reduce((s, o) => s + o.amp, 0);

  const heights = new Float32Array(resolution * resolution);
  const half = sizeM / 2;
  for (let row = 0; row < resolution; row++) {
    for (let col = 0; col < resolution; col++) {
      const u = col / (resolution - 1);
      const v = row / (resolution - 1);
      let h = 0;
      for (const { cells, amp, lattice } of octaves) {
        const gx = u * cells;
        const gz = v * cells;
        const x0 = Math.min(Math.floor(gx), cells - 1);
        const z0 = Math.min(Math.floor(gz), cells - 1);
        const fx = smooth(gx - x0);
        const fz = smooth(gz - z0);
        const w = cells + 1;
        const a = lattice[z0 * w + x0] ?? 0;
        const b = lattice[z0 * w + x0 + 1] ?? 0;
        const c = lattice[(z0 + 1) * w + x0] ?? 0;
        const d = lattice[(z0 + 1) * w + x0 + 1] ?? 0;
        h += amp * ((a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz);
      }
      // Ease towards the origin's level within flatRadiusM.
      const dist = Math.hypot(u * sizeM - half, v * sizeM - half);
      const blend = smooth(Math.min(dist / flatRadiusM, 1));
      heights[row * resolution + col] = (h / ampSum) * reliefM * blend;
    }
  }
  return createHeightmap(sizeM, resolution, heights);
}
