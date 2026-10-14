'use client';

import { Line } from '@react-three/drei';
import { toThree } from '@vyuh/sim-core';
import { useMemo } from 'react';
import { useSimRuntime } from './sim-context';

/** A ring that follows the terrain, `liftM` above ground. */
function GroundRing({
  x,
  z,
  radiusM,
  color,
  liftM = 4,
  dashed = false,
}: {
  x: number;
  z: number;
  radiusM: number;
  color: string;
  liftM?: number;
  dashed?: boolean;
}) {
  const rt = useSimRuntime();
  const points = useMemo(() => {
    const segments = 96;
    return Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      const px = x + Math.sin(a) * radiusM;
      const pz = z + Math.cos(a) * radiusM;
      const p = toThree({ x: px, y: rt.groundHeight(px, pz) + liftM, z: pz });
      return [p.x, p.y, p.z] as [number, number, number];
    });
  }, [rt, x, z, radiusM, liftM]);
  return (
    <Line
      points={points}
      color={color}
      lineWidth={1.5}
      dashed={dashed}
      dashSize={40}
      gapSize={25}
    />
  );
}

export function SiteMarkers() {
  const rt = useSimRuntime();
  const { assets, effectors, sensors } = rt.scenario;
  return (
    <>
      {assets.map((a) => {
        const p = toThree({ x: a.x, y: rt.groundHeight(a.x, a.z), z: a.z });
        return (
          <group key={a.id}>
            <mesh position={[p.x, p.y + 4, p.z]}>
              <boxGeometry args={[18, 8, 12]} />
              <meshLambertMaterial color="#8a8f7a" />
            </mesh>
            <GroundRing x={a.x} z={a.z} radiusM={a.radiusM} color="#3fd6c0" />
          </group>
        );
      })}
      {effectors.map((e) => (
        <GroundRing key={e.id} x={e.x} z={e.z} radiusM={e.rangeM} color="#ffb347" dashed />
      ))}
      {sensors.map((s) => {
        const p = toThree({ x: s.x, y: rt.groundHeight(s.x, s.z), z: s.z });
        return (
          <mesh key={s.id} position={[p.x + (s.kind === 'RADAR' ? 14 : -14), p.y + s.y / 2, p.z]}>
            <cylinderGeometry args={[0.6, 0.9, s.y, 8]} />
            <meshLambertMaterial color="#c9ced3" />
          </mesh>
        );
      })}
    </>
  );
}
