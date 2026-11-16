import { describe, expect, it } from 'vitest';
import { SKYLINE_BINS, SKYLINE_STEP_M, backgroundDistanceM, buildSkyline } from '../src/horizon.ts';
import { createHeightmap } from '../src/terrain.ts';
import { createWorld } from '../src/world.ts';
import { presetWorld } from './fixtures.ts';

const SIZE = 8000;
const RES = 201;

function flat(heightAt: (x: number, z: number) => number = () => 0) {
  const h = new Float32Array(RES * RES);
  for (let r = 0; r < RES; r++) {
    for (let c = 0; c < RES; c++) {
      h[r * RES + c] = heightAt((c / (RES - 1) - 0.5) * SIZE, (r / (RES - 1) - 0.5) * SIZE);
    }
  }
  return createHeightmap(SIZE, RES, h);
}

const cam = { x: 0, y: 8, z: 0 };

describe('skyline background', () => {
  it('puts a contact above the horizon against the sky', () => {
    const sky = buildSkyline(createWorld(flat()), cam);
    expect(sky.bins).toHaveLength(SKYLINE_BINS);
    expect(backgroundDistanceM(sky, { x: 0, y: 10, z: 1000 })).toBeNull();
    expect(backgroundDistanceM(sky, { x: 700, y: 50, z: -700 })).toBeNull();
  });

  it('finds where the line of sight meets flat ground behind a low contact', () => {
    const sky = buildSkyline(createWorld(flat()), cam);
    // From 8 m through a contact 2 m up at 1 km the line meets the ground at 8 / 0.006 = 1,333 m.
    const d = backgroundDistanceM(sky, { x: 0, y: 2, z: 1000 });
    expect(d).not.toBeNull();
    expect(Math.abs((d ?? 0) - 4000 / 3)).toBeLessThanOrEqual(SKYLINE_STEP_M);
  });

  it('raises the skyline only on the bearings of a hill', () => {
    // A 300 m hill 3 km east.
    const hill = (x: number, z: number) => 300 * Math.exp(-((x - 3000) ** 2 + z ** 2) / 400 ** 2);
    const sky = buildSkyline(createWorld(flat(hill)), cam);
    // 100 m up at 2 km east: slope 0.046 < the hill's ~0.097 → the hill is behind it.
    const d = backgroundDistanceM(sky, { x: 2000, y: 100, z: 0 });
    expect(d).toBeGreaterThan(2000);
    expect(d).toBeLessThan(3200);
    // The same contact north: skylined.
    expect(backgroundDistanceM(sky, { x: 0, y: 100, z: 2000 })).toBeNull();
    // Above the hilltop's slope: skylined even to the east.
    expect(backgroundDistanceM(sky, { x: 2000, y: 400, z: 0 })).toBeNull();
  });

  it('counts a building as background', () => {
    // 30 m block 300 m north of the camera.
    const ring: [number, number][] = [
      [-20, 290],
      [20, 290],
      [20, 310],
      [-20, 310],
    ];
    const sky = buildSkyline(createWorld(flat(), [{ ring, heightM: 30 }]), cam);
    // 15 m up at 200 m north: slope 0.035 < the roof's 0.073 → the building is behind it.
    const d = backgroundDistanceM(sky, { x: 0, y: 15, z: 200 });
    expect(d).toBeGreaterThanOrEqual(289);
    expect(d).toBeLessThanOrEqual(311);
    // Over the roof line: skylined.
    expect(backgroundDistanceM(sky, { x: 0, y: 60, z: 200 })).toBeNull();
  });

  it('is a pure function of the world and the camera', () => {
    const world = presetWorld('JK_MOUNTAIN');
    const at = { x: 150, y: 600, z: -950 };
    const a = buildSkyline(world, at);
    const b = buildSkyline(world, at);
    expect(a.bins.map((x) => Array.from(x))).toEqual(b.bins.map((x) => Array.from(x)));
    // Slopes rise strictly within every bin.
    for (const steps of a.bins) {
      for (let i = 2; i < steps.length; i += 2) {
        expect(steps[i]).toBeGreaterThan(steps[i - 2] ?? -Infinity);
      }
    }
  });
});
