'use client';

import { Stars } from '@react-three/drei';
import { useThree } from '@react-three/fiber';
import type { SimEnvironment } from '@vyuh/sim-core';
import { useLayoutEffect, useMemo } from 'react';
import { bindAtmosphere } from '@/lib/sim/atmosphere-fog';
import { atmosphereLook, type AtmosphereSite } from '@/lib/sim/atmosphere-look';
import { atmosEnabled } from '@/lib/sim/atmosphere-switch';
import { environmentLook, type EnvironmentVariant } from '@/lib/sim/environment-look';
import { IR, SKY } from '@/lib/theme/scene-colours';
import { SkyDome } from './sky-dome';
import { EDGE_FADE_END, EDGE_FADE_START } from './terrain-mesh';

const SUN_DISTANCE = 20_000;

const IR_SKY = SKY.ir;
/** Heat does not fade with the sun: the thermal pass never lights surfaces below this. */
const IR_MIN_AMBIENT = 0.9;
const EDGE_FADE = [EDGE_FADE_START, EDGE_FADE_END] as const;

/**
 * Lights, sky and fog for a view. The EO day sky is the haze colour the fog fades
 * into (stars at night): through a narrow camera at the horizon a real sky is a
 * near-uniform grey-blue, and drei's HDR <Sky> blew out to white (audit P1-3).
 * Both views have a dome (terrain plan §7.1); the tactical one is dimmed so it
 * stays a map (decision 167). In IR mode the sky is cold (black).
 *
 * With `site` (atmosphere step 2) the air is physical: the fog colour and the sky
 * come from the region and weather, and this view's fog values are written into
 * the shared fog uniforms right before its scene draws. `?atmos=0` keeps the old
 * linear fog. The three `Fog` stays on the scene either way, so `USE_FOG` and
 * `fogColor` are set; the physical chunk ignores its near / far.
 */
export function Environment({
  env,
  variant,
  ir = false,
  site,
}: {
  env: SimEnvironment;
  variant: EnvironmentVariant;
  ir?: boolean;
  site?: AtmosphereSite;
}) {
  const look = useMemo(() => environmentLook(env, variant), [env, variant]);
  const atmos = useMemo(
    () => (site && atmosEnabled() ? atmosphereLook(env, variant, site, EDGE_FADE) : null),
    [env, variant, site],
  );
  const scene = useThree((s) => s.scene);
  useLayoutEffect(() => {
    if (!atmos || ir) return;
    return bindAtmosphere(scene, atmos);
  }, [scene, atmos, ir]);
  const [x, y, z] = look.sunDir;
  const background = ir ? IR_SKY : (atmos?.horizon ?? look.background);
  return (
    <>
      <color attach="background" args={[background]} />
      <fog attach="fog" args={[background, look.fogNear, look.fogFar]} />
      {!ir && <SkyDome look={look} atmos={atmos} encoded={variant === 'tactical'} />}
      {!ir && look.showStars && (
        <Stars radius={30_000} depth={5_000} count={2500} factor={400} fade />
      )}
      <hemisphereLight
        args={
          ir
            ? [IR.ambient, IR.ambient, Math.max(look.hemiIntensity, IR_MIN_AMBIENT)]
            : [look.hemiSky, look.hemiGround, look.hemiIntensity]
        }
      />
      <directionalLight
        position={[x * SUN_DISTANCE, y * SUN_DISTANCE, z * SUN_DISTANCE]}
        color={look.sunColor}
        intensity={look.sunIntensity}
      />
    </>
  );
}
