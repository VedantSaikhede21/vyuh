'use client';

import type { Heightmap } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry, Color } from 'three';

const LOW = new Color('#2f3d27');
const HIGH = new Color('#7a7350');

/** Builds the terrain surface from the same heightmap sim-core samples. */
export function buildTerrainGeometry(map: Heightmap): BufferGeometry {
  const n = map.resolution;
  const step = map.sizeM / (n - 1);
  const half = map.sizeM / 2;
  let max = 1;
  for (const h of map.heights) max = Math.max(max, h);

  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const c = new Color();
  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      const i = row * n + col;
      const h = map.heights[i] ?? 0;
      const p = toThree({ x: -half + col * step, y: h, z: -half + row * step });
      positions.set([p.x, p.y, p.z], i * 3);
      c.copy(LOW).lerp(HIGH, h / max);
      colors.set([c.r, c.g, c.b], i * 3);
    }
  }
  // Rows run south → north, which is −z in Three.js; this winding faces up.
  const indices = new Uint32Array((n - 1) * (n - 1) * 6);
  let k = 0;
  for (let row = 0; row < n - 1; row++) {
    for (let col = 0; col < n - 1; col++) {
      const a = row * n + col;
      const b = a + 1;
      const d = a + n;
      indices.set([a, b, d, b, d + 1, d], k);
      k += 6;
    }
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new BufferAttribute(positions, 3));
  geo.setAttribute('color', new BufferAttribute(colors, 3));
  geo.setIndex(new BufferAttribute(indices, 1));
  geo.computeVertexNormals();
  return geo;
}

export function TerrainMesh({ map }: { map: Heightmap }) {
  const geometry = useMemo(() => buildTerrainGeometry(map), [map]);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return (
    <mesh geometry={geometry} receiveShadow={false}>
      <meshLambertMaterial vertexColors />
    </mesh>
  );
}
