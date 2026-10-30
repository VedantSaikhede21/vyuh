'use client';

import { Stars } from '@react-three/drei';
import type { SimEnvironment } from '@vyuh/sim-core';
import { useMemo } from 'react';
import { environmentLook, type EnvironmentVariant } from '@/lib/sim/environment-look';
import { SKY } from '@/lib/theme/scene-colours';
import { SkyDome } from './sky-dome';

const SUN_DISTANCE = 20_000;

const IR_SKY = SKY.ir;

/**
 * Lights, sky and fog for a view. The EO day sky is the haze colour the fog fades
 * into (stars at night): through a narrow camera at the horizon a real sky is a
 * near-uniform grey-blue, and drei's HDR <Sky> blew out to white (audit P1-3).
 * Both views have a dome (terrain plan §7.1); the tactical one is dimmed so it
 * stays a map (decision 167). In IR mode the sky is cold (black).
 */
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
      {!ir && <SkyDome look={look} encoded={variant === 'tactical'} />}
      {!ir && look.showStars && (
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
