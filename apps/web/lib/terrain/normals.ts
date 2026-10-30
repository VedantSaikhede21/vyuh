/**
 * World-space normals packed as RGBA8, resolution², row 0 = south. x east, y up,
 * z = −north to match Three.js. Central differences on the heightmap: the surface
 * the sim uses, read per pixel instead of per LOD vertex.
 */
export function normalBytes(heights: Float32Array, n: number, sizeM: number): Uint8Array {
  const cell = sizeM / (n - 1);
  const out = new Uint8Array(n * n * 4);
  const h = (r: number, c: number) => heights[r * n + c]!;
  for (let r = 0; r < n; r++) {
    const rN = Math.min(r + 1, n - 1);
    const rS = Math.max(r - 1, 0);
    for (let c = 0; c < n; c++) {
      const cE = Math.min(c + 1, n - 1);
      const cW = Math.max(c - 1, 0);
      const gx = (h(r, cE) - h(r, cW)) / ((cE - cW) * cell);
      const gn = (h(rN, c) - h(rS, c)) / ((rN - rS) * cell);
      const len = Math.hypot(gx, gn, 1);
      const i = (r * n + c) * 4;
      out[i] = Math.round(((-gx / len) * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round(((1 / len) * 0.5 + 0.5) * 255);
      out[i + 2] = Math.round(((gn / len) * 0.5 + 0.5) * 255);
      out[i + 3] = 255;
    }
  }
  return out;
}
