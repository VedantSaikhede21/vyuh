import { readFileSync } from 'node:fs';
import { TerrainPresetMeta } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  PROCEDURAL_HILLS_META,
  TICK_S,
  buildingTopAt,
  builtinWorld,
  createContactState,
  createHeightmap,
  createLosCache,
  createWorld,
  decodeHeightmapU16,
  hasLineOfSight,
  parseBuildingsGeoJson,
  sampleHeight,
  stepContact,
  worldFromPreset,
  type BuildingFootprint,
  type Heightmap,
} from '../src/index.ts';
import { attackQuad } from './fixtures.ts';

const flat = (sizeM = 4000): Heightmap => createHeightmap(sizeM, 2, new Float32Array(4));

/** A north–south ridge of `heightM` centred on x = ridgeX (triangular, 200 m wide). */
function ridgeMap(ridgeX: number, heightM: number, sizeM = 4000, n = 401): Heightmap {
  const h = new Float32Array(n * n);
  const step = sizeM / (n - 1);
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const x = -sizeM / 2 + col * step;
      h[row * n + col] = Math.max(0, heightM * (1 - Math.abs(x - ridgeX) / 100));
    }
  }
  return createHeightmap(sizeM, n, h);
}

const square = (cx: number, cz: number, half: number, heightM: number): BuildingFootprint => ({
  ring: [
    [cx - half, cz - half],
    [cx + half, cz - half],
    [cx + half, cz + half],
    [cx - half, cz + half],
  ],
  heightM,
});

describe('heightmap sampling', () => {
  // 3×3 grid over 200 m: nodes every 100 m; row 0 = south.
  const map = createHeightmap(200, 3, Float32Array.from([0, 10, 20, 30, 40, 50, 60, 70, 80]));

  it('returns node values exactly and interpolates bilinearly between them', () => {
    expect(sampleHeight(map, -100, -100)).toBe(0); // SW corner
    expect(sampleHeight(map, 100, -100)).toBe(20); // SE corner
    expect(sampleHeight(map, -100, 100)).toBe(60); // NW corner: north is the last row
    expect(sampleHeight(map, 0, 0)).toBe(40);
    expect(sampleHeight(map, -50, -50)).toBeCloseTo(20); // mean of 0, 10, 30, 40
    expect(sampleHeight(map, 25, 50)).toBeCloseTo(57.5); // rows 30–50 and 60–80 at gx 1.25, gz 1.5
  });

  it('clamps outside the map', () => {
    expect(sampleHeight(map, -1000, -1000)).toBe(0);
    expect(sampleHeight(map, 1000, 1000)).toBe(80);
  });
});

describe('heightmap.u16 decoding', () => {
  it('reads little-endian, row 0 = south, with the meta scaling', () => {
    const bytes = new Uint8Array(8);
    const view = new DataView(bytes.buffer);
    [0, 65535, 32768, 1].forEach((v, i) => view.setUint16(i * 2, v, true));
    const map = decodeHeightmapU16(bytes, { resolution: 2, sizeM: 100, relMinM: -10, relMaxM: 90 });
    expect(sampleHeight(map, -50, -50)).toBeCloseTo(-10); // SW = first sample
    expect(sampleHeight(map, 50, -50)).toBeCloseTo(90); // SE
    expect(sampleHeight(map, -50, 50)).toBeCloseTo(-10 + (32768 * 100) / 65535, 3); // NW
  });

  it('rejects a buffer of the wrong size', () => {
    const meta = { resolution: 4, sizeM: 100, relMinM: 0, relMaxM: 1 };
    expect(() => decodeHeightmapU16(new Uint8Array(10), meta)).toThrow(RangeError);
  });
});

describe('line of sight (SPEC §5)', () => {
  it('is clear over open ground', () => {
    const world = createWorld(flat());
    expect(hasLineOfSight(world, { x: 0, y: 6, z: 0 }, { x: 1800, y: 30, z: 900 })).toBe(true);
    expect(hasLineOfSight(world, { x: 0, y: 6, z: 0 }, { x: 0, y: 6, z: 0 })).toBe(true);
  });

  it('is blocked behind a hill and clear once the contact climbs above it', () => {
    const world = createWorld(ridgeMap(1000, 100));
    const sensor = { x: 0, y: 6, z: 0 };
    expect(hasLineOfSight(world, sensor, { x: 1800, y: 40, z: 0 })).toBe(false);
    // Line passes x = 1000 at 6 + (400 − 6) × 1000/1800 ≈ 225 m > 100 m ridge.
    expect(hasLineOfSight(world, sensor, { x: 1800, y: 400, z: 0 })).toBe(true);
    // In front of the ridge is always visible.
    expect(hasLineOfSight(world, sensor, { x: 800, y: 20, z: 0 })).toBe(true);
  });

  it('is blocked behind a building, clear over it, and ignores the sensor’s own site', () => {
    const world = createWorld(flat(), [square(500, 0, 5, 20), square(8, 0, 4, 30)]);
    const sensor = { x: 0, y: 2, z: 0 };
    expect(hasLineOfSight(world, sensor, { x: 1000, y: 2, z: 0 })).toBe(false);
    // Passes the building at y ≈ 51 m > 20 m roof.
    expect(hasLineOfSight(world, sensor, { x: 1000, y: 100, z: 0 })).toBe(true);
    // Off to the side, the building is not on the line.
    expect(hasLineOfSight(world, sensor, { x: 1000, y: 2, z: 200 })).toBe(true);
  });

  it('caches per sensor per tick and refreshes on the next tick', () => {
    const world = createWorld(ridgeMap(1000, 100));
    const cache = createLosCache(world);
    const s = { x: 0, y: 6, z: 0 };
    expect(cache.visible(1, 'rad1', s, 'c01', { x: 1800, y: 40, z: 0 })).toBe(false);
    // Same tick: the cached answer is returned even if asked with a new position.
    expect(cache.visible(1, 'rad1', s, 'c01', { x: 1800, y: 400, z: 0 })).toBe(false);
    expect(cache.visible(2, 'rad1', s, 'c01', { x: 1800, y: 400, z: 0 })).toBe(true);
    expect(cache.visible(2, 'eo1', s, 'c01', { x: 1800, y: 40, z: 0 })).toBe(false);
  });
});

describe('buildings', () => {
  it('returns the highest roof covering a point, standing on the lowest corner', () => {
    const terrain = ridgeMap(0, 10, 1000, 101);
    const world = createWorld(terrain, [square(50, 0, 10, 6), square(55, 0, 3, 15)]);
    const base = sampleHeight(terrain, 60, 0); // lowest corner, downhill side
    // The small tower stands on its own lowest corner (x = 58).
    expect(buildingTopAt(world.buildings, 55, 0)).toBeCloseTo(sampleHeight(terrain, 58, 0) + 15);
    expect(buildingTopAt(world.buildings, 45, 0)).toBeCloseTo(base + 6);
    expect(buildingTopAt(world.buildings, 200, 0)).toBeNull();
  });

  it('parses buildings.geojson and rejects malformed input', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        {
          type: 'Feature',
          properties: { heightM: 6 },
          geometry: {
            type: 'Polygon',
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 0],
              ],
            ],
          },
        },
      ],
    };
    expect(parseBuildingsGeoJson(fc)).toEqual([
      {
        heightM: 6,
        ring: [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 0],
        ],
      },
    ]);
    expect(() => parseBuildingsGeoJson({ type: 'Feature' })).toThrow(TypeError);
    expect(() =>
      parseBuildingsGeoJson({ type: 'FeatureCollection', features: [{ geometry: {} }] }),
    ).toThrow(TypeError);
  });
});

describe('World', () => {
  it('provides PROCEDURAL_HILLS as a built-in preset', () => {
    const w = builtinWorld('PROCEDURAL_HILLS');
    expect(w?.meta).toEqual(PROCEDURAL_HILLS_META);
    expect(w?.heightmap.resolution).toBe(257);
    expect(builtinWorld('JK_MOUNTAIN')).toBeNull();
  });
});

describe('MSL waypoints', () => {
  it('hold a constant absolute altitude over sloping ground', () => {
    // Ground rises 0 → 100 m from south to north; origin elevation 1000 m MSL.
    const terrain = createHeightmap(4000, 2, Float32Array.from([0, 0, 100, 100]));
    const spec = attackQuad('c01', [0, -1500]);
    spec.path = [
      { x: 0, y: 1150, z: -1500, speedMps: 15, altRef: 'MSL' },
      { x: 0, y: 1150, z: 1500, speedMps: 15, altRef: 'MSL' },
    ];
    const c = createContactState(spec);
    const ctx = { terrain, originElevM: 1000, assets: [], dtS: TICK_S };
    for (let t = 0; t <= 180_000; t += 50) stepContact(c, spec, { ...ctx, tMs: t });
    expect(c.pos.z).toBeGreaterThan(1000);
    expect(c.pos.y).toBeCloseTo(150, 0); // 1150 MSL − 1000 origin
    expect(c.agl).toBeCloseTo(150 - sampleHeight(terrain, c.pos.x, c.pos.z), 0);
  });
});

describe('committed terrain presets', () => {
  const dir = (name: string) =>
    new URL(`../../../apps/web/public/terrain/${name}/`, import.meta.url);
  for (const name of ['PUNJAB_PLAINS', 'JK_MOUNTAIN']) {
    it(`${name}: meta validates and the heightmap decodes with the origin at 0`, () => {
      const meta = TerrainPresetMeta.parse(
        JSON.parse(readFileSync(new URL('meta.json', dir(name)), 'utf8')),
      );
      expect(meta.name).toBe(name);
      const world = worldFromPreset(
        meta,
        readFileSync(new URL(meta.files.heightmap, dir(name))),
        JSON.parse(readFileSync(new URL(meta.files.buildings, dir(name)), 'utf8')),
      );
      expect(Math.abs(sampleHeight(world.heightmap, 0, 0))).toBeLessThan(0.5);
      expect(world.buildings.buildings.length).toBe(meta.buildingCount);
      let min = Infinity;
      let max = -Infinity;
      for (const h of world.heightmap.heights) {
        min = Math.min(min, h);
        max = Math.max(max, h);
      }
      expect(meta.originElevM + min).toBeCloseTo(meta.minElevM, 0);
      expect(meta.originElevM + max).toBeCloseTo(meta.maxElevM, 0);
    });
  }
});
