import type { ContactCategory, Weather } from '@vyuh/shared';
import { dexp } from './dmath.ts';

// The air between the EO camera and a contact (eo-haze plan §2). One haze layer for
// the sim and the picture: the render's fog (atmosphere step 2, decisions 178–180)
// reads these same functions, so a contact fades on screen where the sensor model
// says it fades. All values are representative (docs/realism-sources.md).

/**
 * Koschmieder: visibility V = 3.912 / β, from a 2 % contrast threshold. The WMO's
 * meteorological optical range uses 5 % (2.996 / V); 2 % is kept so the sim's
 * threshold and the render's fog meet at the same distance (decision 178).
 */
export const KOSCHMIEDER = 3.912;

/** IMD counts fog at a visibility of 1,000 m or less. */
export const FOG_MAX_VISIBILITY_M = 1000;
/** Haze at or below this visibility (decision 180: under the 10 km "clear" line). */
export const HAZE_MAX_VISIBILITY_M = 10_000;

export type AtmosRegion = 'PUNJAB_PLAINS' | 'URBAN_GENERIC' | 'JK_MOUNTAIN';
export type AtmosPreset = 'CLEAR' | 'HAZE' | 'FOG' | 'RAIN' | 'DUST';

/** Weather preset from the scenario's numbers (scenarios store no preset). Never DUST. */
export function presetFor(w: Pick<Weather, 'visibilityM' | 'rainMmph'>): AtmosPreset {
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

/** Month (1–12) of an ISO date; January if it cannot be read. */
export function monthOf(isoDate: string): number {
  const m = Number(isoDate.slice(5, 7));
  return m >= 1 && m <= 12 ? m : 1;
}

/** Extinction at the bottom of the haze layer (per metre) for a visibility. */
export function betaFor(visibilityM: number): number {
  return KOSCHMIEDER / Math.max(visibilityM, 1);
}

/**
 * Mean of exp(−max(y, 0) / H) along a straight path between heights a and b,
 * measured from the top of the even layer: 1 inside it, thinning above it. The
 * exact integral of the layer shape; same maths as the render's fog shader.
 */
export function meanDensity(a: number, b: number, h: number): number {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  if (hi <= 0) return 1;
  const span = hi - lo;
  if (span < 1) return dexp(-Math.max(0.5 * (a + b), 0) / h);
  const l0 = Math.max(lo, 0);
  const above = h * (dexp(-l0 / h) - dexp(-hi / h));
  return (Math.max(-lo, 0) + above) / span;
}

/** The haze of one scenario: extinction at the bottom, and the layer in scenario-frame y. */
export interface HazeLayer {
  readonly beta: number;
  /** y where the even haze ends: the map's lowest ground + base. */
  readonly topY: number;
  readonly falloffM: number;
}

export function hazeLayer(
  terrainPreset: string,
  date: string,
  weather: Pick<Weather, 'visibilityM' | 'rainMmph'>,
  floorY: number,
): HazeLayer {
  const layer = layerFor(presetFor(weather), regionFor(terrainPreset), monthOf(date));
  return {
    beta: betaFor(weather.visibilityM),
    topY: floorY + layer.baseM,
    falloffM: layer.falloffM,
  };
}

/** Lowest height of a heightmap (the map's floor, where the haze layer starts). */
export function floorOf(heights: ArrayLike<number>): number {
  let floor = Infinity;
  for (let i = 0; i < heights.length; i++) floor = Math.min(floor, heights[i] ?? Infinity);
  return Number.isFinite(floor) ? floor : 0;
}

/** Mean haze density (0–1) on the straight path between two heights. */
export function pathHaze(layer: HazeLayer, fromY: number, toY: number): number {
  return meanDensity(fromY - layer.topY, toY - layer.topY, layer.falloffM);
}

/**
 * Sky-to-ground ratio S = horizon-sky luminance / background luminance (Duntley;
 * Gordon 1980 Eq. 29–30: S = R_sky / R_background). Horizon sky taken as an
 * equivalent reflectance of 0.25 under a clear sky; backgrounds from Gordon's
 * sample reflectances: growing crops 0.10 → 2.5; mixed roofs and roads ≈ 0.15 →
 * 1.7; conifer and rock slopes ≈ 0.06 → 4. Representative; cloud cover is not
 * modelled (eo-haze plan Q2).
 */
export const SKY_GROUND_RATIO: Readonly<Record<AtmosRegion, number>> = {
  PUNJAB_PLAINS: 2.5,
  URBAN_GENERIC: 1.7,
  JK_MOUNTAIN: 4,
};

/**
 * Inherent luminance contrast |C₀| against the horizon sky and against the ground,
 * by class category. Representative. The drone sky value of 0.5 is ABOVE the only
 * measured range found: Volpe (2019) measured a white small UAS against a bright
 * sky at 0.03–0.33. It is chosen for dark, backlit airframes, which read as
 * silhouettes (a black object is ≈ −1, Gordon 1980), and to match the render's
 * dark day tone (decision 177). A white drone against a bright sky would be harder
 * to see than the sim makes it.
 */
export const INHERENT_CONTRAST: Readonly<
  Record<ContactCategory, { readonly sky: number; readonly ground: number }>
> = {
  DRONE: { sky: 0.5, ground: 0.3 },
  BIRD: { sky: 0.8, ground: 0.2 },
  MANNED_AIRCRAFT: { sky: 0.8, ground: 0.3 },
};
