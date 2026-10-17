import { createHeightmap, createProceduralTerrain, createWorld, toThree } from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import {
  buildingTiles,
  SMALL_BUILDING_M,
  type BuildingTile,
} from '../components/sim/buildings-mesh';
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

describe('building tiles', () => {
  const flat = createHeightmap(1000, 2, new Float32Array(4));
  const square = (x: number, z: number, side: number): [number, number][] => [
    [x, z],
    [x + side, z],
    [x + side, z + side],
    [x, z + side],
    [x, z],
  ];

  it('merges each tile into one indexed geometry: 4 vertices per wall, the ring for the roof', () => {
    const world = createWorld(flat, [
      { ring: square(10, 10, 10), heightM: 6 },
      { ring: square(60, 10, 10), heightM: 9 },
    ]);
    const tiles = buildingTiles(world.buildings);
    expect(tiles).toHaveLength(1);
    const tile = tiles[0]!;
    // Per building: 4 walls × 4 vertices + 4 roof vertices; 4 × 2 + 2 triangles.
    expect(tile.all.getAttribute('position').count).toBe(2 * (16 + 4));
    expect(tile.all.getIndex()?.count).toBe(2 * (8 + 2) * 3);
    tile.all.computeBoundingBox();
    const box = tile.all.boundingBox!;
    expect(box.max.y + tile.centre[1]).toBeCloseTo(9);
    expect(box.min.z + tile.centre[2]).toBeCloseTo(toThree({ x: 0, y: 0, z: 20 }).z);
    // Roof normals point up (DoubleSide flips them only for faces seen from below).
    const normal = tile.all.getAttribute('normal');
    expect(Math.abs(normal.getY(16))).toBeCloseTo(1);
    expect(normal.getY(0)).toBeCloseTo(0);
    expect(buildingTiles(world.buildings)).toBe(tiles);
    expect(buildingTiles(createWorld(flat).buildings)).toEqual([]);
  });

  it('buckets buildings into CHUNKS² tiles and drops only small ones far away', () => {
    const world = createWorld(flat, [
      { ring: square(-400, -400, 8), heightM: 6 }, // south-west, small
      { ring: square(-430, -430, 40), heightM: 6 }, // south-west, large
      { ring: square(300, 300, 8), heightM: 6 }, // north-east, small only
    ]);
    const tiles = buildingTiles(world.buildings);
    expect(tiles).toHaveLength(2);
    const [sw, ne] = tiles as [BuildingTile, BuildingTile];
    expect(sw.centre[0]).toBeLessThan(0);
    expect(ne.centre[0]).toBeGreaterThan(0);
    expect(sw.large).not.toBeNull();
    expect(sw.large!.getAttribute('position').count).toBeLessThan(
      sw.all.getAttribute('position').count,
    );
    expect(ne.large).toBeNull();
    // 2 px for a SMALL_BUILDING_M building, plus the tile's half-diagonal.
    const tileHalf = 1000 / CHUNKS / 2;
    expect(sw.largeFromM).toBeCloseTo((SMALL_BUILDING_M * 1200) / 2 + tileHalf * Math.SQRT2, 6);
  });
});
