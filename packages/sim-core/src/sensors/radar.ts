import { CLASS_PROFILES, type ContactSpec, type RadarSensor } from '@vyuh/shared';
import type { ContactState } from '../contacts.ts';
import { bearingDeg, horizontalRange, slantRange, wrapDeg, type Vec3 } from '../coords.ts';
import type { RandomStream } from '../rng.ts';

// Radar (SPEC §6.1). SNR relative to the reference point (0.01 m² at refRangeM
// ⇒ Pd 0.5) follows the radar equation, SNR ∝ RCS / R⁴, so detection range
// scales with RCS^¼. Rain is a two-way path loss on the SNR (decision 50).
// Pd = logistic(SNRdB / slope) × clutter (× 0.4 when low and close) × LOS
// (0 when the terrain or a building masks the contact).

export const REF_RCS_M2 = 0.01;
/** dB per logistic unit: Pd goes 0.5 → ~0.92 for +5 dB. */
export const PD_SLOPE_DB = 2;
export const BEARING_SIGMA_DEG = 1;
export const RANGE_SIGMA_M = 10;

/** Ground clutter (SPEC §6.1): below this AGL and inside CLUTTER_RANGE_M, Pd × CLUTTER_FACTOR. */
export const CLUTTER_AGL_M = 15;
export const CLUTTER_RANGE_M = 2000;
export const CLUTTER_FACTOR = 0.4;
/** Rain specific attenuation γ = k · R^a dB/km (representative X-band, ITU-R P.838 style). */
export const RAIN_K = 0.0101;
export const RAIN_A = 1.276;

/** Two-way rain loss in dB over a slant range: 2 · γ(R) · range_km. */
export function rainLossDb(rainMmph: number, rangeM: number): number {
  if (rainMmph <= 0) return 0;
  return 2 * RAIN_K * Math.pow(rainMmph, RAIN_A) * (Math.max(rangeM, 0) / 1000);
}

/** Pd multiplier for ground clutter: low (AGL) and close (horizontal range). */
export function clutterFactor(aglM: number, horizontalRangeM: number): number {
  return aglM < CLUTTER_AGL_M && horizontalRangeM < CLUTTER_RANGE_M ? CLUTTER_FACTOR : 1;
}

export function radarSnrDb(refRangeM: number, rcsM2: number, rangeM: number): number {
  const r = Math.max(rangeM, 1);
  return 10 * Math.log10(rcsM2 / REF_RCS_M2) - 40 * Math.log10(r / refRangeM);
}

/** Pd before clutter and LOS; `rainMmph` adds the two-way rain loss. */
export function radarPd(refRangeM: number, rcsM2: number, rangeM: number, rainMmph = 0): number {
  const snr = radarSnrDb(refRangeM, rcsM2, rangeM) - rainLossDb(rainMmph, rangeM);
  return 1 / (1 + Math.exp(-snr / PD_SLOPE_DB));
}

/** Standard normal sample (Box–Muller); always draws exactly two numbers. */
export function gaussian(stream: RandomStream): number {
  const u1 = 1 - stream.next(); // (0, 1]
  const u2 = stream.next();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export interface RadarReturn {
  readonly contactId: string;
  readonly hit: boolean;
  /** True when the contact was masked (no line of sight) on this scan. */
  readonly masked: boolean;
  /** Noisy measurement; present only when hit. */
  readonly rangeM?: number;
  readonly bearingDeg?: number;
}

/**
 * One scan over active contacts (must be sorted by id). Draws a fixed five
 * numbers per contact whether or not it is detected or masked, so one
 * contact's outcome never shifts another's random sequence.
 */
export function radarScan(
  radar: RadarSensor,
  radarPos: Readonly<Vec3>,
  contacts: readonly ContactState[],
  specs: ReadonlyMap<string, ContactSpec>,
  stream: RandomStream,
  inLineOfSight: (c: ContactState) => boolean = () => true,
  rainMmph = 0,
): RadarReturn[] {
  const out: RadarReturn[] = [];
  for (const c of contacts) {
    if (c.status !== 'ACTIVE') continue;
    const spec = specs.get(c.id);
    if (spec === undefined) continue;
    const range = slantRange(radarPos, c.pos);
    const pd =
      radarPd(radar.refRangeM, CLASS_PROFILES[spec.class].rcsM2, range, rainMmph) *
      clutterFactor(c.agl, horizontalRange(radarPos, c.pos));
    const roll = stream.next();
    const nRange = gaussian(stream);
    const nBearing = gaussian(stream);
    const masked = !inLineOfSight(c);
    if (!masked && roll < pd) {
      out.push({
        contactId: c.id,
        hit: true,
        masked,
        rangeM: Math.max(0, range + nRange * RANGE_SIGMA_M),
        bearingDeg: wrapDeg(bearingDeg(radarPos, c.pos) + nBearing * BEARING_SIGMA_DEG),
      });
    } else {
      out.push({ contactId: c.id, hit: false, masked });
    }
  }
  return out;
}
