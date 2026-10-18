import { z } from 'zod';
import { Activity, Affiliation, AltitudeBand, ReportedClass } from './enums.ts';
import { named } from './registry.ts';

export const ReportLocation = named(
  'ReportLocation',
  z.object({
    bearingDeg: z.number().min(0).lt(360),
    rangeM: z.number().min(0),
    fromSensorId: z.string().min(1),
  }),
);
export type ReportLocation = z.infer<typeof ReportLocation>;

/** Structured contact report (SPEC §4.3). */
export const ContactReport = named(
  'ContactReport',
  z.object({
    tMs: z.int().min(0),
    trackIds: z.array(z.string().min(1)).min(1),
    count: z.int().min(1),
    class: ReportedClass,
    affiliation: Affiliation,
    location: ReportLocation,
    headingDeg: z.number().min(0).lt(360),
    altitudeBand: AltitudeBand,
    activity: Activity,
  }),
);
export type ContactReport = z.infer<typeof ContactReport>;

// ---- Report ground truth (Phase 4a, decision 104) ------------------------------

/** SPEC §4.3 altitude bands: LOW < 50 m, MEDIUM 50–150 m, HIGH > 150 m AGL. */
export const ALTITUDE_BAND_LOW_MAX_M = 50;
export const ALTITUDE_BAND_MEDIUM_MAX_M = 150;

export function altitudeBandOf(aglM: number): AltitudeBand {
  if (aglM < ALTITUDE_BAND_LOW_MAX_M) return 'LOW';
  if (aglM <= ALTITUDE_BAND_MEDIUM_MAX_M) return 'MEDIUM';
  return 'HIGH';
}

/** Below this ground speed a contact is HOVERING. */
export const ACTIVITY_HOVER_MPS = 1;
/** APPROACHING / DEPARTING when more than this share of the velocity points to / from the nearest asset. */
export const ACTIVITY_RADIAL_FRACTION = 0.3;

/**
 * True activity (SPEC §9.5): from the contact's horizontal velocity relative to the
 * nearest asset. `toAsset` is the horizontal vector from the contact to that asset.
 */
export function activityOf(
  vx: number,
  vz: number,
  toAsset: { x: number; z: number } | null,
): Exclude<Activity, 'UNKNOWN'> {
  const speed = Math.hypot(vx, vz);
  if (speed < ACTIVITY_HOVER_MPS) return 'HOVERING';
  const d = toAsset ? Math.hypot(toAsset.x, toAsset.z) : 0;
  if (!toAsset || d === 0) return 'LOITERING';
  const radial = (vx * toAsset.x + vz * toAsset.z) / (speed * d);
  if (radial > ACTIVITY_RADIAL_FRACTION) return 'APPROACHING';
  if (radial < -ACTIVITY_RADIAL_FRACTION) return 'DEPARTING';
  return 'LOITERING';
}

/** Truth for one contact behind a reported track, at the report's tMs. */
export const ReportTruthContact = named(
  'ReportTruthContact',
  z.object({
    contactId: z.string().min(1).max(64),
    /** Scenario frame, metres (x east, z north). */
    x: z.number(),
    z: z.number(),
    aglM: z.number(),
    headingDeg: z.number().min(0).lt(360),
    speedMps: z.number().min(0),
    activity: Activity,
  }),
);
export type ReportTruthContact = z.infer<typeof ReportTruthContact>;
