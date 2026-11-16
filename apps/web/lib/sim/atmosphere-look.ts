import type { SimEnvironment, World } from '@vyuh/sim-core';
import { toThree } from '@vyuh/sim-core';
import { Color } from 'three';
import { ATMOSPHERE, SKY } from '@/lib/theme/scene-colours';
import {
  daylight,
  smoothstep,
  TACTICAL_SKY_DIM,
  type EnvironmentVariant,
} from './environment-look';

// Physical air for the 3D views (atmosphere step 2, docs/plans/atmosphere-plan.md
// and atmosphere-step2-direction.md). Render only: the sim's sensors never read
// any of this. The fog's thickness is the scenario's own visibility (Koschmieder);
// the region and weather preset only choose colours and how the haze is spread
// with height. `transmittance` is a TypeScript copy of the shader maths in
// atmosphere-fog.ts, so the shader's behaviour can be unit-tested.

type Weather = SimEnvironment['weather'];

/**
 * Koschmieder: visibility V = 3.912 / β, from a 2% contrast threshold. The WMO's
 * meteorological optical range uses 5% (2.996 / V); 2% is kept so a contact fades
 * to the limit of sight exactly where the sim's EO sensor drops it (decision 178).
 */
export const KOSCHMIEDER = 3.912;

export type AtmosRegion = keyof typeof ATMOSPHERE;
export type AtmosPreset = 'CLEAR' | 'HAZE' | 'FOG' | 'RAIN' | 'DUST';

/** IMD counts fog at a visibility of 1,000 m or less. */
export const FOG_MAX_VISIBILITY_M = 1000;
/**
 * Haze at or below this visibility: under the 10 km line above which aviation
 * reports call the air clear (user 2026-11-16, decision 180). Keeps the
 * generator's HAZE preset (6 km) drawn as haze.
 */
export const HAZE_MAX_VISIBILITY_M = 10_000;

/** Weather preset from the scenario's numbers (scenarios store no preset). Never DUST. */
export function presetFor(w: Weather): AtmosPreset {
  if (w.rainMmph > 0) return 'RAIN';
  if (w.visibilityM <= FOG_MAX_VISIBILITY_M) return 'FOG';
  if (w.visibilityM <= HAZE_MAX_VISIBILITY_M) return 'HAZE';
  return 'CLEAR';
}

/** Region whose air a terrain preset uses; PROCEDURAL_HILLS borrows the plains. */
export function regionFor(terrainPreset: string): AtmosRegion {
  return terrainPreset === 'JK_MOUNTAIN' || terrainPreset === 'URBAN_GENERIC'
    ? terrainPreset
    : 'PUNJAB_PLAINS';
}

/** Haze layer: even up to `baseM` above the map's lowest ground, then thinning with e-folding height `falloffM`. */
export interface Layer {
  readonly baseM: number;
  readonly falloffM: number;
}

export type Season = 'WINTER' | 'PRE_MONSOON' | 'MONSOON';

export function seasonOf(month: number): Season {
  if (month >= 3 && month <= 6) return 'PRE_MONSOON';
  if (month >= 7 && month <= 10) return 'MONSOON';
  return 'WINTER';
}

/**
 * Plains haze depth by season (representative): the IGP mixing layer is deep
 * before the monsoon and packed low in winter (decision 180).
 */
const PLAINS_SEASON: Readonly<Record<Season, Layer>> = {
  WINTER: { baseM: 150, falloffM: 400 },
  PRE_MONSOON: { baseM: 600, falloffM: 1200 },
  MONSOON: { baseM: 400, falloffM: 900 },
};
/** URBAN: the plains layer, lower (smog trapped nearer the ground). Representative. */
const URBAN_LAYER_SCALE = 0.8;

/** Layers that do not follow the season; null = by season (plains CLEAR and HAZE). */
const FIXED_LAYER: Readonly<Record<AtmosRegion, Readonly<Record<AtmosPreset, Layer | null>>>> = {
  PUNJAB_PLAINS: {
    CLEAR: null,
    HAZE: null,
    FOG: { baseM: 50, falloffM: 100 },
    RAIN: { baseM: 0, falloffM: 1500 },
    DUST: { baseM: 500, falloffM: 1500 },
  },
  URBAN_GENERIC: {
    CLEAR: null,
    HAZE: null,
    FOG: { baseM: 50, falloffM: 100 },
    RAIN: { baseM: 0, falloffM: 1500 },
    DUST: { baseM: 500, falloffM: 1500 },
  },
  // J&K haze sits in the valleys whatever the season.
  JK_MOUNTAIN: {
    CLEAR: { baseM: 0, falloffM: 300 },
    HAZE: { baseM: 100, falloffM: 500 },
    FOG: { baseM: 100, falloffM: 150 },
    RAIN: { baseM: 0, falloffM: 800 },
    DUST: { baseM: 0, falloffM: 1000 },
  },
};

export function layerFor(preset: AtmosPreset, region: AtmosRegion, month: number): Layer {
  const fixed = FIXED_LAYER[region][preset];
  if (fixed) return fixed;
  const s = PLAINS_SEASON[seasonOf(month)];
  return region === 'URBAN_GENERIC'
    ? { baseM: s.baseM * URBAN_LAYER_SCALE, falloffM: s.falloffM * URBAN_LAYER_SCALE }
    : s;
}

/** Extinction at the ground (per metre) for a visibility. */
export function betaFor(visibilityM: number): number {
  return KOSCHMIEDER / Math.max(visibilityM, 1);
}

/** The tactical map sees at least this multiple of the real visibility… */
export const TACTICAL_VIS_FACTOR = 2.5;
/** …and never less than this, so it stays readable as a map (decision 178). */
export const TACTICAL_MIN_VIS_M = 20_000;

/** Visibility a view draws with: the truth in the EO camera, a readable floor on the map. */
export function viewVisibilityM(visibilityM: number, variant: EnvironmentVariant): number {
  return variant === 'eo'
    ? visibilityM
    : Math.max(visibilityM * TACTICAL_VIS_FACTOR, TACTICAL_MIN_VIS_M);
}

/** Standard 8 km scale height of the molecular atmosphere. */
const RAYLEIGH_SCALE_HEIGHT_M = 8000;
/** Sea-level molecular extinction at 550 nm, per metre (Koschmieder's clear-air limit). */
const RAYLEIGH_EXTINCTION_SEA_M = 13.2e-6;
const LAMBDA_UM = 0.55;

/** Molecular (Rayleigh) optical depth at 550 nm above an altitude: Hansen–Travis, scaled by pressure. */
export function rayleighOpticalDepth(altitudeM: number): number {
  const l2 = LAMBDA_UM ** -2;
  const l4 = l2 * l2;
  const seaLevel = 0.008569 * l4 * (1 + 0.0113 * l2 + 0.00013 * l4);
  return seaLevel * Math.exp(-altitudeM / RAYLEIGH_SCALE_HEIGHT_M);
}

/** Preetham turbidity is unreliable below about 1.3; the sky uses this range. */
export const TURBIDITY_RANGE = [1.7, 20] as const;

/**
 * Preetham turbidity T = (t_m + t_h) / t_m, derived from the visibility so the
 * sky can never be milkier or clearer than the ground haze (decision 179).
 * The haze column of the layer shape is exactly β_haze × (base + falloff).
 */
export function turbidityFor(visibilityM: number, layer: Layer, altitudeM: number): number {
  const molecular = RAYLEIGH_EXTINCTION_SEA_M * Math.exp(-altitudeM / RAYLEIGH_SCALE_HEIGHT_M);
  const betaHaze = Math.max(betaFor(visibilityM) - molecular, 0);
  const t = 1 + (betaHaze * (layer.baseM + layer.falloffM)) / rayleighOpticalDepth(altitudeM);
  return Math.min(Math.max(t, TURBIDITY_RANGE[0]), TURBIDITY_RANGE[1]);
}

/**
 * Mean of exp(−max(y, 0) / H) along a straight path between heights a and b,
 * measured from the top of the even layer. Same maths as the shader.
 */
export function meanDensity(a: number, b: number, h: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi <= 0) return 1;
  const span = hi - lo;
  if (span < 1) return Math.exp(-Math.max(0.5 * (a + b), 0) / h);
  const l0 = Math.max(lo, 0);
  const above = h * (Math.exp(-l0 / h) - Math.exp(-hi / h));
  return (Math.max(-lo, 0) + above) / span;
}

export interface FogParams {
  /** Extinction at the ground for this view, per metre. */
  readonly beta: number;
  /** World y where the even haze ends (map floor + base). */
  readonly topY: number;
  readonly falloffM: number;
}

/** Fraction of a point's contrast that survives the air between it and the camera (Beer–Lambert). */
export function transmittance(
  distanceM: number,
  camY: number,
  pointY: number,
  p: FogParams,
): number {
  const mean = meanDensity(camY - p.topY, pointY - p.topY, p.falloffM);
  return Math.exp(-p.beta * mean * distanceM);
}

/**
 * Transmittance floor for contacts in the EO view (decision 181): 0.5, so a drone
 * at ~0.4 own contrast against fog still shows at about 20 % on screen.
 */
export const CONTACT_FLOOR = 0.5;

/**
 * A contact's transmittance with the floor: never below `floor` until 0.9 of the
 * view's visibility, fading to the plain physical value at the visibility, where
 * the sim drops the contact.
 */
export function contactTransmittance(
  distanceM: number,
  camY: number,
  pointY: number,
  p: FogParams,
  floor = CONTACT_FLOOR,
): number {
  const rangeFrac = (distanceM * p.beta) / KOSCHMIEDER;
  return Math.max(
    transmittance(distanceM, camY, pointY, p),
    floor * (1 - smoothstep(0.9, 1, rangeFrac)),
  );
}

/** Where a scenario is: what the air needs from the terrain. */
export interface AtmosphereSite {
  readonly terrainPreset: string;
  /** World y of the map's lowest ground. */
  readonly floorY: number;
  /** Altitude of that ground above sea level (m), for the molecular part. */
  readonly floorAltM: number;
  readonly sizeM: number;
}

const floorCache = new WeakMap<object, number>();

export function atmosphereSite(terrainPreset: string, world: World): AtmosphereSite {
  const map = world.heightmap;
  let floorY = floorCache.get(map);
  if (floorY === undefined) {
    floorY = Infinity;
    for (const v of map.heights) floorY = Math.min(floorY, v);
    if (!Number.isFinite(floorY)) floorY = 0;
    floorCache.set(map, floorY);
  }
  return {
    terrainPreset,
    floorY,
    floorAltM: (world.meta?.originElevM ?? 0) + floorY,
    sizeM: map.sizeM,
  };
}

const SKY_NIGHT = new Color(SKY.night);
const SKY_DUSK = new Color(SKY.dusk);
const ZENITH_NIGHT = new Color(SKY.zenithNight);
const ZENITH_DUSK = new Color(SKY.zenithDusk);
/** Quilez's sun-glow weight; a starting point to tune from stills. */
const GLOW_WEIGHT = 0.5;

export interface AtmosphereLook {
  readonly preset: AtmosPreset;
  readonly region: AtmosRegion;
  readonly layer: Layer;
  /** Derived Preetham turbidity (step 3's sky reads it). */
  readonly turbidity: number;
  readonly beta: number;
  readonly topY: number;
  readonly falloffM: number;
  /** Fog colour = sky at the horizon (linear). */
  readonly horizon: Color;
  readonly zenith: Color;
  /** Colour the air brightens towards near the sun (linear). */
  readonly sunTint: Color;
  readonly glow: number;
  readonly sunDir: [number, number, number];
  readonly contactFloor: number;
  /** Tactical map edge fade, radius start / end in metres; [0, 0] = none. */
  readonly edge: [number, number];
}

/** Pure mapping from the sim environment and the site to the air of one view. */
export function atmosphereLook(
  env: SimEnvironment,
  variant: EnvironmentVariant,
  site: AtmosphereSite,
  edgeFade?: readonly [number, number],
): AtmosphereLook {
  const { azDeg, elDeg } = env.sun;
  const { day, dusk } = daylight(elDeg);
  const preset = presetFor(env.weather);
  const region = regionFor(site.terrainPreset);
  const month = Number(env.date.slice(5, 7)) || 1;
  const layer = layerFor(preset, region, month);
  const colours = ATMOSPHERE[region][preset];
  const dim = variant === 'tactical' ? TACTICAL_SKY_DIM : 1;
  const sunUp = smoothstep(-2, 6, elDeg);
  const cloud = env.weather.cloudPct / 100;
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const d = toThree({
    x: Math.sin(az) * Math.cos(el),
    y: Math.sin(el),
    z: Math.cos(az) * Math.cos(el),
  });
  const half = site.sizeM / 2;
  return {
    preset,
    region,
    layer,
    turbidity: turbidityFor(env.weather.visibilityM, layer, site.floorAltM),
    beta: betaFor(viewVisibilityM(env.weather.visibilityM, variant)),
    topY: site.floorY + layer.baseM,
    falloffM: layer.falloffM,
    horizon: SKY_NIGHT.clone()
      .lerp(new Color(colours.haze), day)
      .lerp(SKY_DUSK, dusk * 0.5)
      .multiplyScalar(dim),
    zenith: ZENITH_NIGHT.clone()
      .lerp(new Color(colours.zenith), day)
      .lerp(ZENITH_DUSK, dusk * 0.4)
      .multiplyScalar(dim),
    sunTint: new Color(colours.sunTint).multiplyScalar(dim * sunUp),
    glow: GLOW_WEIGHT * sunUp * (1 - 0.6 * cloud),
    sunDir: [d.x, d.y, d.z],
    contactFloor: variant === 'eo' ? CONTACT_FLOOR : 0,
    edge: variant === 'tactical' && edgeFade ? [half * edgeFade[0], half * edgeFade[1]] : [0, 0],
  };
}
