// Sun shadows on terrain, baked per view instead of a shadow map (terrain plan
// §7.3): no per-frame cost on integrated GPUs. Pure, so it runs in a worker and
// in tests. Display only: the sim's line of sight never reads this.

export interface ShadowInput {
  /** Relative heights, resolution², row 0 = south, column 0 = west. */
  heights: Float32Array;
  resolution: number;
  sizeM: number;
  /** Unit vector toward the sun: x east, y up, z north. */
  sun: { x: number; y: number; z: number };
  outPx: number;
}

const MAX_STEPS = 96;
const SOFT_M = 40;

function sample(h: Float32Array, n: number, r: number, c: number): number {
  const r0 = Math.max(0, Math.min(n - 2, Math.floor(r)));
  const c0 = Math.max(0, Math.min(n - 2, Math.floor(c)));
  const fr = Math.max(0, Math.min(1, r - r0));
  const fc = Math.max(0, Math.min(1, c - c0));
  const a = h[r0 * n + c0]! * (1 - fc) + h[r0 * n + c0 + 1]! * fc;
  const b = h[(r0 + 1) * n + c0]! * (1 - fc) + h[(r0 + 1) * n + c0 + 1]! * fc;
  return a * (1 - fr) + b * fr;
}

/** uint8 mask, outPx², row 0 = south: 255 sunlit, 0 in full shadow. */
export function sunShadowMask({ heights, resolution, sizeM, sun, outPx }: ShadowInput): Uint8Array {
  const out = new Uint8Array(outPx * outPx).fill(255);
  const horiz = Math.hypot(sun.x, sun.z);
  if (sun.y <= 0 || horiz < 1e-4) return out;
  const n = resolution;
  const nodes = (n - 1) / (outPx - 1);
  const cell = sizeM / (n - 1);
  // March in grid cells: the ray rises `rise` metres per cell toward the sun.
  const stepC = sun.x / horiz;
  const stepR = sun.z / horiz;
  const rise = (sun.y / horiz) * cell;
  let top = -Infinity;
  for (const v of heights) top = Math.max(top, v);
  for (let oy = 0; oy < outPx; oy++) {
    for (let ox = 0; ox < outPx; ox++) {
      const r0 = oy * nodes;
      const c0 = ox * nodes;
      const h0 = sample(heights, n, r0, c0) + 2;
      let block = 0;
      for (let i = 0, s = 1; i < MAX_STEPS; i++, s += 1 + (i >> 4)) {
        const ray = h0 + s * rise;
        if (ray > top) break;
        const c = c0 + s * stepC;
        const r = r0 + s * stepR;
        if (c < 0 || r < 0 || c > n - 1 || r > n - 1) break;
        const over = sample(heights, n, r, c) - ray;
        if (over > 0) block = Math.max(block, Math.min(over / SOFT_M, 1));
        if (block >= 1) break;
      }
      out[oy * outPx + ox] = Math.round((1 - block) * 255);
    }
  }
  return out;
}
