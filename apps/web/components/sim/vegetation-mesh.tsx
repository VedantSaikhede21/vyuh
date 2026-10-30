'use client';

import type { Heightmap, World } from '@vyuh/sim-core';
import { sampleHeight, toThree } from '@vyuh/sim-core';
import { useEffect, useMemo, useState } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  ConeGeometry,
  InstancedMesh,
  LOD,
  Matrix4,
  MeshLambertMaterial,
  Object3D,
  Quaternion,
  Vector3,
} from 'three';
import { presetFileUrl } from '@/lib/terrain/load-world';
import { IR_MATERIALS } from '@/lib/sim/ir-materials';
import { GROUND } from '@/lib/theme/scene-colours';
import { CHUNKS } from './terrain-mesh';

// Conifers near the camera (terrain plan §9.1). Forest beyond that distance is
// already in the satellite colour, so each terrain tile draws its trees only
// within `viewM` (÷ zoom, so the EO view gets them around its target).
// Display only: the sim's line of sight never reads this.

const RECORD_BYTES = 6;
const TREE_HEIGHT_M = 15;
const CONE_SIDES = 6;

export interface TreeTile {
  centre: Vector3;
  matrices: Float32Array;
  count: number;
}

/** Two stacked cones, about 24 triangles, base at y = 0, 1 unit tall. */
export function coniferGeometry(): BufferGeometry {
  const lower = new ConeGeometry(0.27, 0.72, CONE_SIDES, 1, true).translate(0, 0.42, 0);
  const upper = new ConeGeometry(0.19, 0.58, CONE_SIDES, 1, true).translate(0, 0.71, 0);
  const positions = [lower, upper].flatMap((g) => {
    const flat = g.toNonIndexed();
    return Array.from(flat.getAttribute('position').array);
  });
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.computeVertexNormals();
  return geo;
}

/** Decode vegetation.bin into per-tile instance matrices. Pure. */
export function treeTiles(buffer: ArrayBuffer, map: Heightmap): TreeTile[] {
  const view = new DataView(buffer);
  const total = Math.floor(buffer.byteLength / RECORD_BYTES);
  const half = map.sizeM / 2;
  const tileM = map.sizeM / CHUNKS;
  const lists: number[][] = Array.from({ length: CHUNKS * CHUNKS }, () => []);
  for (let i = 0; i < total; i++) {
    const at = i * RECORD_BYTES;
    const x = (view.getUint16(at, true) / 65535) * map.sizeM - half;
    const z = (view.getUint16(at + 2, true) / 65535) * map.sizeM - half;
    const scale = 0.8 + (view.getUint8(at + 5) / 255) * 0.5;
    const col = Math.min(Math.floor((x + half) / tileM), CHUNKS - 1);
    const row = Math.min(Math.floor((z + half) / tileM), CHUNKS - 1);
    lists[row * CHUNKS + col]!.push(x, z, scale);
  }
  const m = new Matrix4();
  const q = new Quaternion();
  const up = new Vector3(0, 1, 0);
  const out: TreeTile[] = [];
  lists.forEach((list, i) => {
    if (list.length === 0) return;
    const row = Math.floor(i / CHUNKS);
    const col = i % CHUNKS;
    const c = toThree({
      x: -half + (col + 0.5) * tileM,
      y: sampleHeight(map, -half + (col + 0.5) * tileM, -half + (row + 0.5) * tileM),
      z: -half + (row + 0.5) * tileM,
    });
    const centre = new Vector3(c.x, c.y, c.z);
    const count = list.length / 3;
    const matrices = new Float32Array(count * 16);
    for (let k = 0; k < count; k++) {
      const x = list[k * 3]!;
      const z = list[k * 3 + 1]!;
      const s = list[k * 3 + 2]! * TREE_HEIGHT_M;
      const p = toThree({ x, y: sampleHeight(map, x, z), z });
      q.setFromAxisAngle(up, (x * 13.7 + z * 7.3) % 6.28);
      m.compose(
        new Vector3(p.x - centre.x, p.y - centre.y, p.z - centre.z),
        q,
        new Vector3(s, s, s),
      );
      m.toArray(matrices, k * 16);
    }
    out.push({ centre, matrices, count });
  });
  return out;
}

const cache = new WeakMap<Heightmap, Promise<TreeTile[]>>();

function loadTrees(world: World): Promise<TreeTile[]> {
  const meta = world.meta;
  const file = meta?.files.vegetation;
  if (!meta || !file) return Promise.resolve([]);
  const cached = cache.get(world.heightmap);
  if (cached) return cached;
  const v = meta.displayHash ? `?v=${meta.displayHash}` : '';
  const job = fetch(`${presetFileUrl(meta.name, file)}${v}`)
    .then((r) => (r.ok ? r.arrayBuffer() : new ArrayBuffer(0)))
    .then((buf) => treeTiles(buf, world.heightmap))
    .catch(() => []);
  cache.set(world.heightmap, job);
  return job;
}

const GEOMETRY = coniferGeometry();
const MATERIAL = new MeshLambertMaterial({ color: GROUND.conifer, flatShading: true });
const SHADE_LOW = new Color(GROUND.coniferDark);
const SHADE_HIGH = new Color(GROUND.conifer);

export function VegetationMesh({ world, viewM }: { world: World; viewM: number }) {
  const [tiles, setTiles] = useState<TreeTile[]>([]);
  useEffect(() => {
    let live = true;
    void loadTrees(world).then((t) => {
      if (live) setTiles(t);
    });
    return () => {
      live = false;
    };
  }, [world]);
  const lods = useMemo(
    () =>
      (viewM > 0 ? tiles : []).map((tile) => {
        const mesh = new InstancedMesh(GEOMETRY, MATERIAL, tile.count);
        mesh.instanceMatrix.array.set(tile.matrices);
        mesh.instanceMatrix.needsUpdate = true;
        const shade = new Color();
        for (let i = 0; i < tile.count; i++) {
          mesh.setColorAt(
            i,
            shade.copy(SHADE_LOW).lerp(SHADE_HIGH, ((i * 2654435761) >>> 0) / 2 ** 32),
          );
        }
        mesh.frustumCulled = false;
        mesh.userData.irMaterial = IR_MATERIALS.trees;
        const lod = new LOD();
        lod.position.copy(tile.centre);
        lod.addLevel(mesh, 0);
        lod.addLevel(new Object3D(), viewM);
        return lod;
      }),
    [tiles, viewM],
  );
  return (
    <>
      {lods.map((lod, i) => (
        <primitive key={i} object={lod} />
      ))}
    </>
  );
}
