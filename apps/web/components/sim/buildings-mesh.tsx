'use client';

import type { Building, BuildingIndex } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  LOD,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  ShapeUtils,
  Vector2,
} from 'three';
import { IR_MATERIALS } from '@/lib/sim/ir-materials';
import { GROUND } from '@/lib/theme/scene-colours';
import { CHUNKS } from './terrain-mesh';

// Building footprints merged per terrain tile (SPEC §16): the map's CHUNKS ×
// CHUNKS tiles each get one indexed geometry (walls from the footprint ring, a
// triangulated roof) standing on the base height sim-core uses for LOS. Each
// tile is an LOD, so tiles outside the camera frustum are culled and, far away,
// a tile switches to a copy without the small buildings that would cover under
// ~2 px. Display only: sim-core's LOS always uses every building.

/**
 * Projected size in px of a 1 m object at 1 m distance at zoom 1: tactical view
 * 1080 px / (2 tan 25°) ≈ 1158; EO view ~640 px / (2 tan 15°) ≈ 1194. three's
 * LOD divides distance by camera.zoom, so the EO zoom keeps the rule.
 */
const PX_PER_RAD = 1200;
/** Buildings below this many pixels are dropped. */
const MIN_PX = 2;
/** Buildings smaller than this (largest of width, depth, height) drop at distance. */
export const SMALL_BUILDING_M = 15;

export interface BuildingTile {
  /** Three.js position of the tile centre; geometry positions are relative to it. */
  readonly centre: [number, number, number];
  /** Every building in the tile. */
  readonly all: BufferGeometry;
  /** Buildings of at least SMALL_BUILDING_M only (null if none). */
  readonly large: BufferGeometry | null;
  /** Camera distance (÷ zoom) from which `large` is shown instead of `all`. */
  readonly largeFromM: number;
}

function sizeOf(b: Building): number {
  return Math.max(b.maxX - b.minX, b.maxZ - b.minZ, b.heightM);
}

/** One indexed geometry: 4 vertices per wall quad, the ring once more for the roof. */
function buildGeometry(
  buildings: readonly Building[],
  centre: [number, number, number],
): BufferGeometry | null {
  const positions: number[] = [];
  const indices: number[] = [];
  const v = (x: number, y: number, z: number) => {
    const p = toThree({ x, y, z });
    positions.push(p.x - centre[0], p.y - centre[1], p.z - centre[2]);
    return positions.length / 3 - 1;
  };
  for (const b of buildings) {
    // Open ring, counter-clockwise in (x, z).
    let ring = b.ring.map(([x, z]) => new Vector2(x, z));
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (ring.length > 3 && first.equals(last)) ring = ring.slice(0, -1);
    if (ring.length < 3) continue;
    if (ShapeUtils.isClockWise(ring)) ring.reverse();
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const c = ring[(i + 1) % ring.length]!;
      // Unshared per wall, so computeVertexNormals gives the flat wall normal.
      const a0 = v(a.x, b.baseY, a.y);
      const c0 = v(c.x, b.baseY, c.y);
      const c1 = v(c.x, b.topY, c.y);
      const a1 = v(a.x, b.topY, a.y);
      indices.push(a0, c0, c1, a0, c1, a1);
    }
    const roof = ring.map((p) => v(p.x, b.topY, p.y));
    for (const [i, j, k] of ShapeUtils.triangulateShape(ring, [])) {
      indices.push(roof[i!]!, roof[j!]!, roof[k!]!);
    }
  }
  if (indices.length === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const tileCache = new WeakMap<BuildingIndex, BuildingTile[]>();

/** Building tiles for an index (built once, shared by every view). */
export function buildingTiles(index: BuildingIndex): BuildingTile[] {
  const cached = tileCache.get(index);
  if (cached) return cached;
  const size = index.half * 2;
  const tileM = size / CHUNKS;
  // The nearest building in a tile can be this much closer than the tile centre.
  const tileRadius = (tileM / 2) * Math.SQRT2;
  const buckets = Array.from({ length: CHUNKS * CHUNKS }, () => [] as Building[]);
  for (const b of index.buildings) {
    const col = Math.min(
      Math.max(Math.floor(((b.minX + b.maxX) / 2 + index.half) / tileM), 0),
      CHUNKS - 1,
    );
    const row = Math.min(
      Math.max(Math.floor(((b.minZ + b.maxZ) / 2 + index.half) / tileM), 0),
      CHUNKS - 1,
    );
    buckets[row * CHUNKS + col]!.push(b);
  }
  const tiles: BuildingTile[] = [];
  buckets.forEach((list, i) => {
    if (list.length === 0) return;
    const row = Math.floor(i / CHUNKS);
    const col = i % CHUNKS;
    const baseY = Math.min(...list.map((b) => b.baseY));
    const p = toThree({
      x: -index.half + (col + 0.5) * tileM,
      y: baseY,
      z: -index.half + (row + 0.5) * tileM,
    });
    const centre: [number, number, number] = [p.x, p.y, p.z];
    const all = buildGeometry(list, centre);
    if (!all) return;
    const largeList = list.filter((b) => sizeOf(b) >= SMALL_BUILDING_M);
    tiles.push({
      centre,
      all,
      large: largeList.length === list.length ? all : buildGeometry(largeList, centre),
      largeFromM: (SMALL_BUILDING_M * PX_PER_RAD) / MIN_PX + tileRadius,
    });
  });
  tileCache.set(index, tiles);
  return tiles;
}

const DAY_MATERIAL = new MeshLambertMaterial({ color: GROUND.buildings, side: 2 });

function tileMesh(geo: BufferGeometry): Mesh {
  const m = new Mesh(geo, DAY_MATERIAL);
  m.userData.irMaterial = IR_MATERIALS.buildings;
  return m;
}

export function BuildingsMesh({ index }: { index: BuildingIndex }) {
  const lods = useMemo(
    () =>
      buildingTiles(index).map((tile) => {
        const lod = new LOD();
        lod.position.set(...tile.centre);
        lod.addLevel(tileMesh(tile.all), 0);
        if (tile.large !== tile.all) {
          lod.addLevel(tile.large ? tileMesh(tile.large) : new Object3D(), tile.largeFromM);
        }
        return lod;
      }),
    [index],
  );
  // Geometry is cached per index and shared by every view (see TerrainMesh).
  return (
    <>
      {lods.map((lod, i) => (
        <primitive key={i} object={lod} />
      ))}
    </>
  );
}
