import { describe, expect, it } from 'vitest';
import {
  LOS_OWN_SITE_M,
  LOS_STEP_M,
  LOS_TOLERANCE_M,
  buildingTopAt,
  createBuildingIndex,
  hasLineOfSight,
  mulberry32,
  sampleHeight,
  type BuildingIndex,
  type Vec3,
  type World,
} from '../src/index.ts';
import { FILE_PRESETS } from './cross-fixtures.ts';
import { presetWorld } from './fixtures.ts';

// Phase 3b Step 4: the 25 m building grid with a per-cell roof early-out must
// give exactly the LOS of the Phase 2 index (100 m cells, every footprint in
// the cell tested). The reference below is the Phase 2 algorithm verbatim.

function referenceLos(world: World, index: BuildingIndex, from: Vec3, to: Vec3): boolean {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const horiz = Math.hypot(dx, dz);
  const n = Math.max(1, Math.ceil(horiz / LOS_STEP_M));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    const x = from.x + dx * t;
    const y = from.y + dy * t;
    const z = from.z + dz * t;
    if (y + LOS_TOLERANCE_M < sampleHeight(world.heightmap, x, z)) return false;
    if (horiz * t > LOS_OWN_SITE_M) {
      const top = buildingTopAt(index, x, z);
      if (top !== null && y + LOS_TOLERANCE_M < top) return false;
    }
  }
  return true;
}

describe('building LOS index (25 m cells + roof early-out)', () => {
  for (const preset of FILE_PRESETS) {
    it(`matches the Phase 2 index on 10 000 rays near buildings — ${preset}`, () => {
      const world = presetWorld(preset);
      const blds = world.buildings.buildings;
      expect(blds.length).toBeGreaterThan(0);
      const reference = createBuildingIndex(blds, world.heightmap, 100);
      const noBuildings = createBuildingIndex([], world.heightmap, 100);
      const raw = mulberry32(4242);
      const rand = () => raw() / 2 ** 32;
      const half = world.heightmap.sizeM / 2 - 50;
      const clamp = (v: number) => Math.max(-half, Math.min(half, v));
      const point = (cx: number, cz: number, spread: number, lo: number, hi: number): Vec3 => {
        const x = clamp(cx + (rand() * 2 - 1) * spread);
        const z = clamp(cz + (rand() * 2 - 1) * spread);
        return { x, y: sampleHeight(world.heightmap, x, z) + lo + rand() * (hi - lo), z };
      };
      let blocked = 0;
      let byBuilding = 0;
      for (let k = 0; k < 10_000; k++) {
        const b = blds[Math.floor(rand() * blds.length)]!;
        const cx = (b.minX + b.maxX) / 2;
        const cz = (b.minZ + b.maxZ) / 2;
        // Half long rays (sensor-like), half short low rays that buildings decide.
        const low = k % 2 === 0;
        const from = low ? point(cx, cz, 120, 1, 8) : point(cx, cz, 400, 2, 30);
        const to = low ? point(cx, cz, 500, 1, 15) : point(cx, cz, 2500, 3, 150);
        const want = referenceLos(world, reference, from, to);
        if (!want) blocked++;
        if (!want && referenceLos(world, noBuildings, from, to)) byBuilding++;
        expect(hasLineOfSight(world, from, to), `ray ${k}`).toBe(want);
      }
      // The sample must exercise clear rays and rays only a building blocks.
      expect(byBuilding).toBeGreaterThan(25);
      expect(blocked).toBeLessThan(9_900);
    });
  }
});
