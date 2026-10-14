import { CLASS_PROFILES, type ContactSpec, type RadarSensor } from '@vyuh/shared';
import type { ContactState } from '../contacts.ts';
import { bearingDeg, slantRange, wrapDeg, type Vec3 } from '../coords.ts';
import type { RandomStream } from '../rng.ts';

// Basic radar (SPEC §6.1). SNR relative to the reference point (0.01 m² at
// refRangeM ⇒ Pd 0.5) follows the radar equation, SNR ∝ RCS / R⁴, so detection
// range scales with RCS^¼. Pd = logistic(SNRdB / slope) × LOS (0 when the
// terrain or a building masks the contact). Clutter and rain arrive in Part B.

export const REF_RCS_M2 = 0.01;
/** dB per logistic unit: Pd goes 0.5 → ~0.92 for +5 dB. */
export const PD_SLOPE_DB = 2;
export const BEARING_SIGMA_DEG = 1;
export const RANGE_SIGMA_M = 10;

export function radarSnrDb(refRangeM: number, rcsM2: number, rangeM: number): number {
  const r = Math.max(rangeM, 1);
  return 10 * Math.log10(rcsM2 / REF_RCS_M2) - 40 * Math.log10(r / refRangeM);
}

export function radarPd(refRangeM: number, rcsM2: number, rangeM: number): number {
  return 1 / (1 + Math.exp(-radarSnrDb(refRangeM, rcsM2, rangeM) / PD_SLOPE_DB));
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
): RadarReturn[] {
  const out: RadarReturn[] = [];
  for (const c of contacts) {
    if (c.status !== 'ACTIVE') continue;
    const spec = specs.get(c.id);
    if (spec === undefined) continue;
    const range = slantRange(radarPos, c.pos);
    const pd = radarPd(radar.refRangeM, CLASS_PROFILES[spec.class].rcsM2, range);
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
