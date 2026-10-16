import type { Scenario, TerrainPresetMeta, TimeBand, Weather } from '@vyuh/shared';
import {
  NIGHT_SUN_EL_DEG,
  timeBandForElevation,
  timeBandLabel,
  type TimeBandLabel,
} from '@vyuh/shared';
import SunCalc from 'suncalc';

// Sun and night (SPEC §5, §14): suncalc at the preset origin. The instant is
// built from the scenario's local date/time and the preset's explicit UTC
// offset — never the machine's timezone — so it is identical everywhere.

/** Civil twilight: night when the sun is more than 6° below the horizon (packages/shared). */
export { NIGHT_SUN_EL_DEG };
/** Fallback when a bare Heightmap (no preset meta) is used: IST. */
export const DEFAULT_UTC_OFFSET_MIN = 330;

/** UTC epoch ms of a local "YYYY-MM-DD" + "HH:mm" at the given offset. */
export function localInstantMs(date: string, time: string, utcOffsetMin: number): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const t = /^(\d{2}):(\d{2})$/.exec(time);
  if (m === null || t === null) throw new RangeError(`Bad date/time ${date} ${time}`);
  const [, y, mo, d] = m.map(Number) as [number, number, number, number];
  const [, h, mi] = t.map(Number) as [number, number, number];
  return Date.UTC(y, mo - 1, d, h, mi) - utcOffsetMin * 60_000;
}

export interface SunAzElDeg {
  /** Compass bearing, 0 = north, clockwise. */
  readonly azDeg: number;
  /** Elevation above the horizon. */
  readonly elDeg: number;
}

export function sunPosition(lat: number, lon: number, instantMs: number): SunAzElDeg {
  // suncalc only calls valueOf() on its date argument; an instant adapter keeps
  // Date construction (and any wall-clock risk) out of sim-core.
  const instant = { valueOf: () => instantMs } as unknown as Date;
  const p = SunCalc.getPosition(instant, lat, lon);
  // suncalc azimuth: radians from south, positive towards west.
  const az = ((p.azimuth * 180) / Math.PI + 180) % 360;
  return { azDeg: az < 0 ? az + 360 : az, elDeg: (p.altitude * 180) / Math.PI };
}

export interface SimEnvironment {
  readonly date: string;
  readonly time: string;
  readonly sun: SunAzElDeg;
  /** Computed (sun elevation < −6°); overrides the scenario's stored flag. */
  readonly isNight: boolean;
  readonly weather: Weather;
}

/** Computed night flag for a local date/time at a preset (same rule as computeEnvironment). */
export function isNightAt(
  date: string,
  time: string,
  meta: Pick<TerrainPresetMeta, 'origin' | 'utcOffsetMin'>,
): boolean {
  const { lat, lon } = meta.origin;
  return (
    sunPosition(lat, lon, localInstantMs(date, time, meta.utcOffsetMin)).elDeg < NIGHT_SUN_EL_DEG
  );
}

export interface TimeOfDay {
  readonly band: TimeBand;
  /** "Dawn" for the DUSK band while the sun is rising. */
  readonly label: TimeBandLabel;
  readonly sunElDeg: number;
  readonly sunRising: boolean;
}

/** Look-ahead used to tell a rising sun from a setting one. */
const RISING_LOOKAHEAD_MS = 10 * 60_000;

/** Time-of-day band and label for a local date/time at a preset (shared rule, decision 74). */
export function timeOfDayAt(
  date: string,
  time: string,
  meta: Pick<TerrainPresetMeta, 'origin' | 'utcOffsetMin'>,
): TimeOfDay {
  const { lat, lon } = meta.origin;
  const instant = localInstantMs(date, time, meta.utcOffsetMin);
  const sunElDeg = sunPosition(lat, lon, instant).elDeg;
  const sunRising = sunPosition(lat, lon, instant + RISING_LOOKAHEAD_MS).elDeg > sunElDeg;
  const band = timeBandForElevation(sunElDeg);
  return { band, label: timeBandLabel(band, sunRising), sunElDeg, sunRising };
}

export function computeEnvironment(
  scenario: Pick<Scenario, 'environment' | 'terrain'>,
  meta: Pick<TerrainPresetMeta, 'origin' | 'utcOffsetMin'> | null,
): SimEnvironment {
  const { date, time, weather } = scenario.environment;
  const origin = meta?.origin ?? scenario.terrain.origin;
  const offset = meta?.utcOffsetMin ?? DEFAULT_UTC_OFFSET_MIN;
  const sun = sunPosition(origin.lat, origin.lon, localInstantMs(date, time, offset));
  return { date, time, sun, isNight: sun.elDeg < NIGHT_SUN_EL_DEG, weather };
}
