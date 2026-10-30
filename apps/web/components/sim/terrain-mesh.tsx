'use client';

import type { Heightmap, World } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useState } from 'react';
import { BufferAttribute, BufferGeometry, Color, LOD, Mesh, MeshLambertMaterial } from 'three';
import { QUALITY_FEATURES, type GraphicsQuality } from '@/lib/gpu-tier';
import { useShadowMask } from '@/lib/terrain/use-shadow-mask';
import { terrainTextures, type TerrainTextures } from '@/lib/terrain/display';
import { irTerrainMaterial, terrainMaterial } from '@/lib/terrain/terrain-material';
import { IR_MATERIALS } from '@/lib/sim/ir-materials';
import type { EnvironmentLook } from '@/lib/sim/environment-look';
import { GROUND } from '@/lib/theme/scene-colours';

// Chunked terrain with LOD (SPEC §16): CHUNKS × CHUNKS tiles, each with levels
// sampling every 1/2/4/8 grid nodes, plus skirts that hide cracks where
// neighbouring tiles use different levels. three's LOD picks the level per
// rendering camera (distance ÷ camera.zoom), so the zoomed EO view gets finer
// tiles than the tactical view. Geometry is cached per heightmap and shared by
// both views.

export const CHUNKS = 4;
const LEVEL_STEPS = [1, 2, 4, 8] as const;
/** LOD switch distances as fractions of the map size. */
const LEVEL_DISTANCE_FRACTIONS = [0, 0.2, 0.4, 0.7] as const;

const FIELD_LOW = new Color(GROUND.fieldLow);
const FIELD_HIGH = new Color(GROUND.fieldHigh);
const ROCK = new Color(GROUND.rock);
const SNOW = new Color(GROUND.snow);
/** Snow above this absolute elevation (m MSL), representative for the western Himalaya. */
const SNOW_LINE_M = 4300;

interface TerrainTile {
  readonly centre: [number, number, number];
  /** Geometry per LOD level, positions relative to the tile centre. */
  readonly levels: BufferGeometry[];
}

function vertexColour(
  out: Color,
  relH: number,
  absH: number,
  slope: number,
  minRel: number,
  span: number,
): Color {
  out.copy(FIELD_LOW).lerp(FIELD_HIGH, Math.min(Math.max((relH - minRel) / span, 0), 1));
  out.lerp(ROCK, Math.min(Math.max((slope - 0.35) / 0.4, 0), 1));
  if (absH > SNOW_LINE_M)
    out.lerp(SNOW, Math.min((absH - SNOW_LINE_M) / 300, 1) * (slope < 0.9 ? 1 : 0.5));
  return out;
}

/** Grid-node indices from a to b (inclusive) every `step`, always including b. */
function nodeRange(a: number, b: number, step: number): number[] {
  const out: number[] = [];
  for (let i = a; i < b; i += step) out.push(i);
  out.push(b);
  return out;
}

function buildTileLevel(
  map: Heightmap,
  originElevM: number,
  r0: number,
  r1: number,
  c0: number,
  c1: number,
  step: number,
  centre: [number, number, number],
  skirtM: number,
  stats: { minRel: number; span: number },
): BufferGeometry {
  const n = map.resolution;
  const cell = map.sizeM / (n - 1);
  const half = map.sizeM / 2;
  const rows = nodeRange(r0, r1, step);
  const cols = nodeRange(c0, c1, step);
  const R = rows.length;
  const C = cols.length;
  const h = (row: number, col: number) => map.heights[row * n + col] ?? 0;

  // Main grid + one skirt ring (4 edges) appended after it.
  const skirtCount = 2 * (R + C);
  const positions = new Float32Array((R * C + skirtCount) * 3);
  const colors = new Float32Array((R * C + skirtCount) * 3);
  const c = new Color();
  const put = (i: number, row: number, col: number, dy: number) => {
    const y = h(row, col);
    const p = toThree({ x: -half + col * cell, y: y + dy, z: -half + row * cell });
    positions.set([p.x - centre[0], p.y - centre[1], p.z - centre[2]], i * 3);
    const rN = Math.min(row + 1, n - 1);
    const rS = Math.max(row - 1, 0);
    const cE = Math.min(col + 1, n - 1);
    const cW = Math.max(col - 1, 0);
    const gx = (h(row, cE) - h(row, cW)) / ((cE - cW) * cell);
    const gz = (h(rN, col) - h(rS, col)) / ((rN - rS) * cell);
    vertexColour(c, y, y + originElevM, Math.hypot(gx, gz), stats.minRel, stats.span);
    colors.set([c.r, c.g, c.b], i * 3);
  };
  rows.forEach((row, ri) => cols.forEach((col, ci) => put(ri * C + ci, row, col, 0)));

  const indices: number[] = [];
  for (let ri = 0; ri < R - 1; ri++) {
    for (let ci = 0; ci < C - 1; ci++) {
      const a = ri * C + ci;
      const b = a + 1;
      const d = a + C;
      // Rows run south → north (−z in Three.js); this winding faces up.
      indices.push(a, b, d, b, d + 1, d);
    }
  }

  // Skirts: each edge's vertices duplicated skirtM lower, stitched to the edge.
  let s = R * C;
  const edge = (gridIdx: number[], nodes: [number, number][]) => {
    const start = s;
    nodes.forEach(([row, col]) => put(s++, row, col, -skirtM));
    for (let k = 0; k < gridIdx.length - 1; k++) {
      const top0 = gridIdx[k]!;
      const top1 = gridIdx[k + 1]!;
      const bot0 = start + k;
      const bot1 = start + k + 1;
      // Double-sided via both windings: skirts are seen from either side.
      indices.push(top0, bot0, top1, top1, bot0, bot1, top0, top1, bot0, top1, bot1, bot0);
    }
  };
  edge(
    cols.map((_, ci) => ci),
    cols.map((col) => [rows[0]!, col]),
  );
  edge(
    cols.map((_, ci) => (R - 1) * C + ci),
    cols.map((col) => [rows[R - 1]!, col]),
  );
  edge(
    rows.map((_, ri) => ri * C),
    rows.map((row) => [row, cols[0]!]),
  );
  edge(
    rows.map((_, ri) => ri * C + C - 1),
    rows.map((row) => [row, cols[C - 1]!]),
  );

  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

const tileCache = new WeakMap<Heightmap, TerrainTile[]>();

/** Tiles for a heightmap (built once, shared by every view). */
export function terrainTiles(map: Heightmap, originElevM = 0): TerrainTile[] {
  const cached = tileCache.get(map);
  if (cached) return cached;
  const n = map.resolution;
  const cell = map.sizeM / (n - 1);
  const half = map.sizeM / 2;
  let minRel = Infinity;
  let maxRel = -Infinity;
  for (const v of map.heights) {
    minRel = Math.min(minRel, v);
    maxRel = Math.max(maxRel, v);
  }
  const stats = { minRel, span: Math.max(maxRel - minRel, 1) };
  const skirtM = Math.max(5, stats.span * 0.02);
  const bounds = Array.from({ length: CHUNKS + 1 }, (_, i) => Math.floor((i * (n - 1)) / CHUNKS));
  const tiles: TerrainTile[] = [];
  for (let tr = 0; tr < CHUNKS; tr++) {
    for (let tc = 0; tc < CHUNKS; tc++) {
      const r0 = bounds[tr]!;
      const r1 = bounds[tr + 1]!;
      const c0 = bounds[tc]!;
      const c1 = bounds[tc + 1]!;
      const mid = map.heights[Math.round((r0 + r1) / 2) * n + Math.round((c0 + c1) / 2)] ?? 0;
      const p = toThree({
        x: -half + ((c0 + c1) / 2) * cell,
        y: mid,
        z: -half + ((r0 + r1) / 2) * cell,
      });
      const centre: [number, number, number] = [p.x, p.y, p.z];
      tiles.push({
        centre,
        levels: LEVEL_STEPS.map((step) =>
          buildTileLevel(map, originElevM, r0, r1, c0, c1, step, centre, skirtM, stats),
        ),
      });
    }
  }
  tileCache.set(map, tiles);
  return tiles;
}

const PLAIN_MATERIAL = new MeshLambertMaterial({ vertexColors: true });

/**
 * The tactical map fades into the sky between these fractions of the half-width,
 * radially. Perspective squeezes the far edge into a few pixels, so the fade has
 * to start well inside the map to read as a fade.
 */
export const EDGE_FADE_START = 0.55;
export const EDGE_FADE_END = 0.97;

const BLEND_PER_S = 1 / 0.4;

/**
 * Terrain for a view. It draws at once with vertex colours; the satellite look
 * cross-fades in when its textures arrive, and a failed texture simply leaves
 * less of it (terrain plan §13). `look` drives haze and shadows.
 */
export function TerrainMesh({
  world,
  look,
  quality,
  edgeFade = false,
  encoded,
}: {
  world: World;
  look: EnvironmentLook;
  quality: GraphicsQuality;
  edgeFade?: boolean;
  /** Output goes straight to the screen: haze colours must be sRGB-encoded. */
  encoded: boolean;
}) {
  const map = world.heightmap;
  const features = QUALITY_FEATURES[quality];
  const [textures, setTextures] = useState<TerrainTextures | null>(null);
  useEffect(() => {
    let live = true;
    void terrainTextures(map, world.meta ?? undefined).then((t) => {
      if (live) setTextures(t);
    });
    return () => {
      live = false;
    };
  }, [map, world.meta]);

  const display = useMemo(() => {
    if (!textures) return null;
    let floorM = Infinity;
    for (const v of map.heights) floorM = Math.min(floorM, v);
    return terrainMaterial({
      textures,
      sizeM: map.sizeM,
      floorM,
      edgeFade,
      fadeRange: [EDGE_FADE_START, EDGE_FADE_END],
      detail: features.detail,
    });
  }, [textures, map, edgeFade, features.detail]);

  const shadow = useShadowMask(map, look, features.shadowPx);

  useEffect(() => {
    if (!display) return;
    const horizon = look.skyHorizon.clone();
    display.uniforms.uHorizon.value = encoded ? horizon.convertLinearToSRGB() : horizon;
    display.uniforms.uShadow.value = shadow;
    display.uniforms.uShadowOn.value = shadow ? look.shadowStrength : 0;
  }, [display, look, encoded, shadow]);

  useFrame((_, dt) => {
    if (display && display.uniforms.uBlend.value < 1) {
      display.uniforms.uBlend.value = Math.min(1, display.uniforms.uBlend.value + dt * BLEND_PER_S);
    }
  });

  const material = display?.material ?? PLAIN_MATERIAL;
  const irMaterial = useMemo(
    () => (textures?.cover ? irTerrainMaterial(textures.cover, map.sizeM) : IR_MATERIALS.terrain),
    [textures, map.sizeM],
  );
  const lods = useMemo(() => {
    const tiles = terrainTiles(map, world.meta?.originElevM ?? 0);
    return tiles.map((tile) => {
      const lod = new LOD();
      lod.position.set(...tile.centre);
      tile.levels.forEach((geo, i) => {
        const mesh = new Mesh(geo, material);
        mesh.userData.irMaterial = irMaterial;
        lod.addLevel(mesh, LEVEL_DISTANCE_FRACTIONS[i]! * map.sizeM);
      });
      return lod;
    });
  }, [map, world.meta?.originElevM, material, irMaterial]);
  // Geometry is cached per heightmap and shared by every view; the LOD wrappers are
  // garbage-collected (no cleanup that empties them: StrictMode re-runs effects).
  return (
    <>
      {lods.map((lod, i) => (
        <primitive key={i} object={lod} />
      ))}
    </>
  );
}
