import type { TimeBand } from './enums.ts';

// Time of day from the sun's elevation (SPEC §7.1, decision 74). One source for
// the sim's night rule, the generator's band windows (Python reads them from
// apps/api/app/seed/generated/time_bands.json, written by `pnpm gen:schemas`)
// and every time-of-day label in the UI.

/** Civil twilight: night when the sun is more than 6° below the horizon (the sim's rule). */
export const NIGHT_SUN_EL_DEG = -6;
/** At or above this elevation it is day; between the night rule and this, dawn or dusk. */
export const DAY_MIN_EL_DEG = 15;

/**
 * Elevations the generator picks times from, per band. Each window sits inside
 * its label band and ≥ 2° clear of the night rule, so a small difference
 * between the generator's NOAA sun and suncalc never flips `isNight`.
 * DUSK and NIGHT are evening times only.
 */
export const GENERATOR_BAND_WINDOWS_DEG: Readonly<
  Record<TimeBand, readonly [number | null, number | null]>
> = {
  DAY: [DAY_MIN_EL_DEG, null],
  DUSK: [-4, 6],
  NIGHT: [null, -12],
};

/** Band for a sun elevation: NIGHT < −6°, DUSK −6° to < 15°, DAY ≥ 15°. */
export function timeBandForElevation(elDeg: number): TimeBand {
  if (elDeg < NIGHT_SUN_EL_DEG) return 'NIGHT';
  if (elDeg < DAY_MIN_EL_DEG) return 'DUSK';
  return 'DAY';
}

export type TimeBandLabel = 'Day' | 'Dawn' | 'Dusk' | 'Night';

/** UI label: the DUSK band reads "Dawn" while the sun is rising (morning). */
export function timeBandLabel(band: TimeBand, sunRising: boolean): TimeBandLabel {
  if (band === 'DAY') return 'Day';
  if (band === 'NIGHT') return 'Night';
  return sunRising ? 'Dawn' : 'Dusk';
}
