'use client';

import type { BuildingIndex } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { useMemo } from 'react';
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshLambertMaterial,
  ShapeUtils,
  Vector2,
} from 'three';
import { IR_MATERIALS } from '@/lib/sim/ir-materials';

// All building footprints merged into ONE geometry (one draw call, SPEC §16):
// walls from the footprint ring, roof from a triangulated ring, standing on the
// same base height sim-core uses for LOS.

const geometryCache = new WeakMap<BuildingIndex, BufferGeometry | null>();

export function buildBuildingsGeometry(index: BuildingIndex): BufferGeometry | null {
  if (geometryCache.has(index)) return geometryCache.get(index) ?? null;
  const positions: number[] = [];
  const v = (x: number, y: number, z: number) => {
    const p = toThree({ x, y, z });
    positions.push(p.x, p.y, p.z);
  };
  for (const b of index.buildings) {
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
      v(a.x, b.baseY, a.y);
      v(c.x, b.baseY, c.y);
      v(c.x, b.topY, c.y);
      v(a.x, b.baseY, a.y);
      v(c.x, b.topY, c.y);
      v(a.x, b.topY, a.y);
    }
    for (const [i, j, k] of ShapeUtils.triangulateShape(ring, [])) {
      for (const idx of [i, j, k] as const) v(ring[idx!]!.x, b.topY, ring[idx!]!.y);
    }
  }
  if (positions.length === 0) {
    geometryCache.set(index, null);
    return null;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(new Float32Array(positions), 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  geometryCache.set(index, geo);
  return geo;
}

const DAY_MATERIAL = new MeshLambertMaterial({ color: '#9a9284', side: 2 });

export function BuildingsMesh({ index }: { index: BuildingIndex }) {
  const mesh = useMemo(() => {
    const geo = buildBuildingsGeometry(index);
    if (!geo) return null;
    const m = new Mesh(geo, DAY_MATERIAL);
    m.userData.irMaterial = IR_MATERIALS.buildings;
    return m;
  }, [index]);
  return mesh ? <primitive object={mesh} /> : null;
}
