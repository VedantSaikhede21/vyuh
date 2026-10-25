import type { SimEnvironment } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { Color } from 'three';
import { SKY, UI } from '@/lib/theme/scene-colours';

// One environment for every view (SPEC §14): sun direction / colour / intensity
// from the sim's computed sun, sky by day and stars by night, fog from
// weather.visibilityM. The EO view gets the true visibility and darkness; the
// tactical view (a C2 map display) keeps a light floor and a softer fog so it
// stays usable as a map. Pure mapping, unit-tested.

export type EnvironmentVariant = 'tactical' | 'eo';

const SKY_DAY = new Color(SKY.day);
const SKY_NIGHT = new Color(SKY.night);
const SKY_DUSK = new Color(SKY.dusk);
const HAZE = new Color(SKY.haze);
const HEMI_SKY_DAY = new Color(SKY.hemiSkyDay);
const HEMI_SKY_NIGHT = new Color(SKY.hemiSkyNight);
const HEMI_GROUND_DAY = new Color(SKY.hemiGroundDay);
const HEMI_GROUND_NIGHT = new Color(SKY.hemiGroundNight);
const SUN_LOW = new Color(SKY.sunLow);
const SUN_HIGH = new Color(SKY.sunHigh);
/** The tactical map is a C2 display: it sits on --bg-0 (DESIGN §3.1), with no sky dome. */
const TACTICAL_BACKGROUND = new Color(UI.bg0);
/** Intensity of the tactical map's overhead display light when the real sun is weaker. */
const TACTICAL_MAP_LIGHT = 1.2;
const MAP_LIGHT_DIR: [number, number, number] = [0.3, 0.9, 0.3];
/** Lowest daylight factor the tactical map's ambient light uses (keeps it readable at night). */
const TACTICAL_MIN_DAYLIGHT = 0.85;
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
  showStars: boolean;
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
  // The tactical map is a C2 display: its ambient light never drops below a dusk-like level.
  const ambient = variant === 'tactical' ? Math.max(day, TACTICAL_MIN_DAYLIGHT) : day;
  const sunIntensity = 1.8 * smoothstep(-2, 15, elDeg) * (1 - 0.6 * cloud);
  // When the sun is low or down, the tactical map gets a fixed overhead display light instead.
  const mapLight = variant === 'tactical' && sunIntensity < TACTICAL_MAP_LIGHT;
  return {
    sunDir: mapLight ? MAP_LIGHT_DIR : [d.x, d.y, d.z],
    sunColor: mapLight
      ? SUN_HIGH.clone()
      : SUN_LOW.clone().lerp(SUN_HIGH, smoothstep(0, 30, elDeg)),
    sunIntensity: mapLight ? TACTICAL_MAP_LIGHT : sunIntensity,
    hemiSky: HEMI_SKY_NIGHT.clone().lerp(HEMI_SKY_DAY, ambient),
    hemiGround: HEMI_GROUND_NIGHT.clone().lerp(HEMI_GROUND_DAY, ambient),
    hemiIntensity: Math.max(0.04, 0.9 * ambient),
    background: variant === 'tactical' ? TACTICAL_BACKGROUND.clone() : background,
    fogNear: variant === 'eo' ? vis * 0.05 : Math.max(vis, 4000) * 0.6,
    fogFar: variant === 'eo' ? Math.max(vis, 50) : Math.max(vis * 2.5, 9000),
    showStars: variant === 'eo' && elDeg <= -6,
  };
}
