'use client';

import { Sky, Stars } from '@react-three/drei';
import type { SimEnvironment } from '@vyuh/sim-core';
import { useMemo } from 'react';
import { environmentLook, type EnvironmentVariant } from '@/lib/sim/environment-look';

const SUN_DISTANCE = 20_000;

const IR_SKY = '#050505';

/** Lights, sky and fog for a view. In IR mode the sky is cold (black) and no sky dome is drawn. */
export function Environment({
  env,
  variant,
  ir = false,
}: {
  env: SimEnvironment;
  variant: EnvironmentVariant;
  ir?: boolean;
}) {
  const look = useMemo(() => environmentLook(env, variant), [env, variant]);
  const [x, y, z] = look.sunDir;
  const background = ir ? IR_SKY : look.background;
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, look.fogNear, look.fogFar]} />
      {!ir &&
        (look.showSky ? (
          <Sky
            distance={45_000}
            sunPosition={[x, y, z]}
            turbidity={look.turbidity}
            rayleigh={1.2}
          />
        ) : (
          <Stars radius={30_000} depth={5_000} count={2500} factor={400} fade />
        ))}
      <hemisphereLight args={[look.hemiSky, look.hemiGround, look.hemiIntensity]} />
      <directionalLight
        position={[x * SUN_DISTANCE, y * SUN_DISTANCE, z * SUN_DISTANCE]}
        color={look.sunColor}
        intensity={look.sunIntensity}
      />
    </>
  );
}
