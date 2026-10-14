import { createHeightmap, createProceduralTerrain, createWorld, toThree } from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import { buildBuildingsGeometry } from '../components/sim/buildings-mesh';
import { CHUNKS, terrainTiles } from '../components/sim/terrain-mesh';

describe('terrain tiles (SPEC §16 LOD)', () => {
  const map = createProceduralTerrain({ resolution: 65 });
  const tiles = terrainTiles(map);

  it('splits the map into CHUNKS² tiles with four LOD levels of decreasing detail', () => {
    expect(tiles).toHaveLength(CHUNKS * CHUNKS);
    for (const tile of tiles) {
      const counts = tile.levels.map((g) => g.getAttribute('position').count);
      expect(counts).toHaveLength(4);
      for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeLessThan(counts[i - 1]!);
      for (const v of tile.levels[0]!.getAttribute('position').array) {
        expect(Number.isFinite(v)).toBe(true);
      }
    }
  });

  it('is cached per heightmap and reproduces terrain heights at full detail', () => {
    expect(terrainTiles(map)).toBe(tiles);
    // Highest vertex of the finest levels equals the map's highest sample.
    let max = -Infinity;
    for (const t of tiles) {
      const pos = t.levels[0]!.getAttribute('position');
      for (let i = 0; i < pos.count; i++) max = Math.max(max, pos.getY(i) + t.centre[1]);
    }
    expect(max).toBeCloseTo(Math.max(...map.heights), 3);
  });
});

describe('merged buildings', () => {
  it('builds walls and a roof for each footprint in one geometry', () => {
    const flat = createHeightmap(1000, 2, new Float32Array(4));
    const ring: [number, number][] = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    const world = createWorld(flat, [
      { ring, heightM: 6 },
      { ring: ring.map(([x, z]) => [x + 50, z] as [number, number]), heightM: 9 },
    ]);
    const geo = buildBuildingsGeometry(world.buildings);
    // Per building: 4 walls × 6 vertices + 2 roof triangles × 3.
    expect(geo?.getAttribute('position').count).toBe(2 * (24 + 6));
    geo?.computeBoundingBox();
    expect(geo?.boundingBox?.max.y).toBeCloseTo(9);
    expect(geo?.boundingBox?.min.z).toBeCloseTo(toThree({ x: 0, y: 0, z: 10 }).z);
    expect(buildBuildingsGeometry(createWorld(flat).buildings)).toBeNull();
  });
});
