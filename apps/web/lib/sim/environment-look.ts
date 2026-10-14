import type { SimEnvironment } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { Color } from 'three';

// One environment for every view (SPEC §14): sun direction / colour / intensity
// from the sim's computed sun, sky by day and stars by night, fog from
// weather.visibilityM. The EO view gets the true visibility and darkness; the
// tactical view (a C2 map display) keeps a light floor and a softer fog so it
// stays usable as a map. Pure mapping, unit-tested.

export type EnvironmentVariant = 'tactical' | 'eo';

const SKY_DAY = new Color('#9fb4c4');
const SKY_NIGHT = new Color('#0b1020');
const SKY_DUSK = new Color('#b4876a');
const HAZE = new Color('#a9adb0');
const HEMI_SKY_DAY = new Color('#dfe9f0');
const HEMI_SKY_NIGHT = new Color('#27324d');
const HEMI_GROUND_DAY = new Color('#3a3a2a');
const HEMI_GROUND_NIGHT = new Color('#0a0a0c');
const SUN_LOW = new Color('#ffb26b');
const SUN_HIGH = new Color('#fff6e8');
/** Visibility at or beyond which the air counts as clear, metres. */
const CLEAR_VIS_M = 20_000;

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(Math.max((x - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

export interface EnvironmentLook {
  sunDir: [number, number, number];
  sunColor: Color;
  sunIntensity: number;
  hemiSky: Color;
  hemiGround: Color;
  hemiIntensity: number;
  background: Color;
  fogNear: number;
  fogFar: number;
  showSky: boolean;
  turbidity: number;
}

/** Pure mapping from the sim environment to render parameters (unit-testable). */
export function environmentLook(env: SimEnvironment, variant: EnvironmentVariant): EnvironmentLook {
  const { azDeg, elDeg } = env.sun;
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const d = toThree({
    x: Math.sin(az) * Math.cos(el),
    y: Math.sin(el),
    z: Math.cos(az) * Math.cos(el),
  });
  const day = smoothstep(-6, 10, elDeg);
  const dusk = smoothstep(-6, 0, elDeg) * (1 - smoothstep(2, 12, elDeg));
  const vis = env.weather.visibilityM;
  const haze = 1 - Math.min(vis / CLEAR_VIS_M, 1);
  const cloud = env.weather.cloudPct / 100;

  const background = SKY_NIGHT.clone()
    .lerp(SKY_DAY, day)
    .lerp(SKY_DUSK, dusk * 0.5);
  background.lerp(HAZE, haze * day * 0.7);
  const floor = variant === 'tactical' ? 0.35 : 0.04;
  return {
    sunDir: [d.x, d.y, d.z],
    sunColor: SUN_LOW.clone().lerp(SUN_HIGH, smoothstep(0, 30, elDeg)),
    sunIntensity: 1.8 * smoothstep(-2, 15, elDeg) * (1 - 0.6 * cloud),
    hemiSky: HEMI_SKY_NIGHT.clone().lerp(HEMI_SKY_DAY, day),
    hemiGround: HEMI_GROUND_NIGHT.clone().lerp(HEMI_GROUND_DAY, day),
    hemiIntensity: Math.max(floor, 0.9 * day),
    background,
    fogNear: variant === 'eo' ? vis * 0.05 : Math.max(vis, 4000) * 0.6,
    fogFar: variant === 'eo' ? Math.max(vis, 50) : Math.max(vis * 2.5, 9000),
    showSky: elDeg > -6,
    turbidity: 2 + 10 * haze,
  };
}
