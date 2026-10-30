'use client';

import type { Building, BuildingIndex, World } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  LOD,
  Mesh,
  MeshLambertMaterial,
  Object3D,
  ShapeUtils,
  Vector2,
} from 'three';
import { IR_MATERIALS } from '@/lib/sim/ir-materials';
import { BUILDING_LOOK } from '@/lib/theme/scene-colours';
import { CHUNKS } from './terrain-mesh';

// Building footprints merged per terrain tile (SPEC §16): the map's CHUNKS ×
// CHUNKS tiles each get one indexed geometry (walls from the footprint ring, a
// triangulated roof) standing on the base height sim-core uses for LOS. Each
// tile is an LOD, so tiles outside the camera frustum are culled and, far away,
// a tile switches to a copy without the small buildings that would cover under
// ~2 px. Display only: sim-core's LOS always uses every building.
//
// Colour is per vertex from a stable hash of the building (terrain plan §9.2). In
// hill villages small rectangular footprints get a gable: the eaves drop and the
// ridge stays at the building's height, so the picture never exceeds the volume
// the sim uses for line of sight.

export type RoofStyle = 'TIN' | 'CONCRETE';
const GABLE_MAX_M = 30;
const GABLE_RISE = 0.28;
/** Walls are darker at the base: a cheap contact shadow. */
const WALL_BASE_SHADE = 0.62;

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

/**
 * Roof corners for a small, nearly rectangular counter-clockwise ring whose ridge
 * runs along its long side: [e0, e1, r1, r0, e2, e3] walking round the eaves,
 * with r0 and r1 the ridge ends. False for anything else (a flat roof).
 */
function gableRidge(ring: readonly Vector2[]) {
  if (ring.length !== 4) return false;
  const [a, b, c, d] = ring as [Vector2, Vector2, Vector2, Vector2];
  const ab = a.distanceTo(b);
  const bc = b.distanceTo(c);
  if (Math.max(ab, bc) > GABLE_MAX_M) return false;
  const area = Math.abs(ShapeUtils.area([a, b, c, d]));
  if (area < ab * bc * 0.85) return false;
  // Long side first, so the ridge joins the midpoints of the short sides.
  const [p, q, r, s] = ab >= bc ? [a, b, c, d] : [b, c, d, a];
  const mid = (u: Vector2, w: Vector2) => u.clone().add(w).multiplyScalar(0.5);
  return [p!, q!, mid(q!, r!), mid(s!, p!), r!, s!] as const;
}

/** One indexed geometry: 4 vertices per wall quad, the ring once more for the roof. */
function buildGeometry(
  buildings: readonly Building[],
  centre: [number, number, number],
  roofStyle: RoofStyle,
): BufferGeometry | null {
  const positions: number[] = [];
  const colours: number[] = [];
  const indices: number[] = [];
  const shade = new Color();
  const v = (x: number, y: number, z: number, c: Color, k = 1) => {
    const p = toThree({ x, y, z });
    positions.push(p.x - centre[0], p.y - centre[1], p.z - centre[2]);
    colours.push(c.r * k, c.g * k, c.b * k);
    return positions.length / 3 - 1;
  };
  const roofs = roofStyle === 'TIN' ? BUILDING_LOOK.tinRoofs : BUILDING_LOOK.concreteRoofs;
  buildings.forEach((b, n) => {
    // Open ring, counter-clockwise in (x, z).
    let ring = b.ring.map(([x, z]) => new Vector2(x, z));
    const first = ring[0]!;
    const last = ring[ring.length - 1]!;
    if (ring.length > 3 && first.equals(last)) ring = ring.slice(0, -1);
    if (ring.length < 3) return;
    if (ShapeUtils.isClockWise(ring)) ring.reverse();
    const hash = Math.imul(n + 1, 2654435761) >>> 0;
    const wall = new Color(BUILDING_LOOK.walls[hash % BUILDING_LOOK.walls.length]!);
    const roofColour = new Color(roofs[(hash >>> 8) % roofs.length]!);
    const gable = roofStyle === 'TIN' && gableRidge(ring);
    const eaves = gable ? b.topY - (b.topY - b.baseY) * GABLE_RISE : b.topY;
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]!;
      const c = ring[(i + 1) % ring.length]!;
      // Unshared per wall, so computeVertexNormals gives the flat wall normal.
      const a0 = v(a.x, b.baseY, a.y, wall, WALL_BASE_SHADE);
      const c0 = v(c.x, b.baseY, c.y, wall, WALL_BASE_SHADE);
      const c1 = v(c.x, eaves, c.y, wall);
      const a1 = v(a.x, eaves, a.y, wall);
      indices.push(a0, c0, c1, a0, c1, a1);
    }
    if (gable) {
      const [e0, e1, r1, r0, e2, e3] = gable;
      const ridge = (p: Vector2) => v(p.x, b.topY, p.y, roofColour);
      const eave = (p: Vector2) => v(p.x, eaves, p.y, roofColour);
      // Two roof planes and two wall gables, each with its own flat normal.
      const q1 = [eave(e0), eave(e1), ridge(r1), ridge(r0)] as const;
      indices.push(q1[0], q1[1], q1[2], q1[0], q1[2], q1[3]);
      const q2 = [eave(e2), eave(e3), ridge(r0), ridge(r1)] as const;
      indices.push(q2[0], q2[1], q2[2], q2[0], q2[2], q2[3]);
      const end = (p0: Vector2, p1: Vector2, top: Vector2) => {
        shade.copy(wall);
        const t = [
          v(p0.x, eaves, p0.y, shade),
          v(p1.x, eaves, p1.y, shade),
          v(top.x, b.topY, top.y, shade),
        ];
        indices.push(t[0]!, t[1]!, t[2]!);
      };
      end(e1, e2, r1);
      end(e3, e0, r0);
      return;
    }
    const roof = ring.map((p) => v(p.x, b.topY, p.y, roofColour));
    for (const [i, j, k] of ShapeUtils.triangulateShape(ring, [])) {
      indices.push(roof[i!]!, roof[j!]!, roof[k!]!);
    }
  });
  if (indices.length === 0) return null;
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.setAttribute('color', new BufferAttribute(new Float32Array(colours), 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const tileCache = new WeakMap<BuildingIndex, BuildingTile[]>();

/** Building tiles for an index (built once, shared by every view). */
export function buildingTiles(
  index: BuildingIndex,
  roofStyle: RoofStyle = 'CONCRETE',
): BuildingTile[] {
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
    const all = buildGeometry(list, centre, roofStyle);
    if (!all) return;
    const largeList = list.filter((b) => sizeOf(b) >= SMALL_BUILDING_M);
    tiles.push({
      centre,
      all,
      large: largeList.length === list.length ? all : buildGeometry(largeList, centre, roofStyle),
      largeFromM: (SMALL_BUILDING_M * PX_PER_RAD) / MIN_PX + tileRadius,
    });
  });
  tileCache.set(index, tiles);
  return tiles;
}

const DAY_MATERIAL = new MeshLambertMaterial({ vertexColors: true, side: 2 });

function tileMesh(geo: BufferGeometry): Mesh {
  const m = new Mesh(geo, DAY_MATERIAL);
  m.userData.irMaterial = IR_MATERIALS.buildings;
  return m;
}

/** Hill villages have tin roofs; the plains and towns flat concrete. */
export function roofStyleOf(world: World): RoofStyle {
  return world.meta?.name === 'JK_MOUNTAIN' ? 'TIN' : 'CONCRETE';
}

export function BuildingsMesh({
  index,
  roofStyle = 'CONCRETE',
}: {
  index: BuildingIndex;
  roofStyle?: RoofStyle;
}) {
  const lods = useMemo(
    () =>
      buildingTiles(index, roofStyle).map((tile) => {
        const lod = new LOD();
        lod.position.set(...tile.centre);
        lod.addLevel(tileMesh(tile.all), 0);
        if (tile.large !== tile.all) {
          lod.addLevel(tile.large ? tileMesh(tile.large) : new Object3D(), tile.largeFromM);
        }
        return lod;
      }),
    [index, roofStyle],
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
