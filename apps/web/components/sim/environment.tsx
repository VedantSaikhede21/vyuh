'use client';

import { Sky, Stars } from '@react-three/drei';
import type { SimEnvironment } from '@vyuh/sim-core';
import { useMemo } from 'react';
import { environmentLook, type EnvironmentVariant } from '@/lib/sim/environment-look';

const SUN_DISTANCE = 20_000;

export function Environment({
  env,
  variant,
}: {
  env: SimEnvironment;
  variant: EnvironmentVariant;
}) {
  const look = useMemo(() => environmentLook(env, variant), [env, variant]);
  const [x, y, z] = look.sunDir;
  return (
    <>
      <color attach="background" args={[look.background]} />
      <fog attach="fog" args={[look.background, look.fogNear, look.fogFar]} />
      {look.showSky ? (
        <Sky distance={45_000} sunPosition={[x, y, z]} turbidity={look.turbidity} rayleigh={1.2} />
      ) : (
        <Stars radius={30_000} depth={5_000} count={2500} factor={400} fade />
      )}
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemiIntensity]} />
      <directionalLight
        position={[x * SUN_DISTANCE, y * SUN_DISTANCE, z * SUN_DISTANCE]}
        color={look.sunColor}
        intensity={look.sunIntensity}
      />
    </>
  );
}
