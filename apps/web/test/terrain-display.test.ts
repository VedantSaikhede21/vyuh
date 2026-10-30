import { describe, expect, it } from 'vitest';
import { normalBytes } from '@/lib/terrain/normals';
import { sunShadowMask } from '@/lib/terrain/shadow';

const N = 64;
const SIZE = 6300; // 100 m cells

function terrain(f: (row: number, col: number) => number): Float32Array {
  const h = new Float32Array(N * N);
  for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) h[r * N + c] = f(r, c);
  return h;
}

const lowEast = { x: 0.9, y: 0.2, z: 0 };

describe('sun shadow mask (terrain plan §7.3)', () => {
  it('a plane is fully lit', () => {
    const mask = sunShadowMask({
      heights: terrain(() => 0),
      resolution: N,
      sizeM: SIZE,
      sun: lowEast,
      outPx: N,
    });
    expect(mask.every((v) => v === 255)).toBe(true);
  });

  it('a ridge shadows the ground on its far side from a low sun', () => {
    const heights = terrain((_, c) => (c === 40 ? 500 : 0));
    const mask = sunShadowMask({ heights, resolution: N, sizeM: SIZE, sun: lowEast, outPx: N });
    expect(mask[32 * N + 38]).toBeLessThan(40); // just west of the ridge, sun in the east
    expect(mask[32 * N + 50]).toBe(255); // sunward side
  });

  it('nothing is shadowed at noon or with the sun down', () => {
    const heights = terrain((_, c) => (c === 40 ? 500 : 0));
    const noon = sunShadowMask({
      heights,
      resolution: N,
      sizeM: SIZE,
      sun: { x: 0, y: 1, z: 0 },
      outPx: N,
    });
    const night = sunShadowMask({
      heights,
      resolution: N,
      sizeM: SIZE,
      sun: { x: 0.7, y: -0.7, z: 0 },
      outPx: N,
    });
    expect(noon.every((v) => v === 255)).toBe(true);
    expect(night.every((v) => v === 255)).toBe(true);
  });
});

describe('terrain normals', () => {
  it('points up on a plane', () => {
    const out = normalBytes(
      terrain(() => 10),
      N,
      SIZE,
    );
    expect([out[0], out[1], out[2]]).toEqual([128, 255, 128]);
  });

  it('leans away from a slope rising to the east and to the north', () => {
    const east = normalBytes(
      terrain((_, c) => c * 50),
      N,
      SIZE,
    );
    expect(east[(32 * N + 32) * 4]!).toBeLessThan(128); // normal leans west
    const north = normalBytes(
      terrain((r) => r * 50),
      N,
      SIZE,
    );
    // Rising north leans the normal south, which is +z in Three.js.
    expect(north[(32 * N + 32) * 4 + 2]!).toBeGreaterThan(128);
  });
});
