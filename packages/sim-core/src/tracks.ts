import type { Affiliation, ContactClass, SensorKind } from '@vyuh/shared';
import type { Vec3 } from './coords.ts';

// Track management (SPEC §5): a track is confirmed after 3 hits in the last 5
// scans and lost after 4 consecutive misses. Track ids (T001…) are separate
// from contact ids — the trainee sees tracks, never ground truth.

export const CONFIRM_HITS = 3;
export const CONFIRM_WINDOW = 5;
export const LOSE_MISSES = 4;

/** Per (sensor, contact) scan history used for N-of-M confirmation. */
export interface ScanHistory {
  /** Most recent scans, oldest first, at most CONFIRM_WINDOW long. */
  hits: boolean[];
  consecutiveMisses: number;
  /** How many of the consecutive misses were LOS-masked. */
  consecutiveMaskedMisses: number;
  /** Id of the live track for this history, or null when there is none. */
  trackId: string | null;
}

export type ScanUpdate = 'CONFIRMED' | 'LOST' | null;

export function createScanHistory(): ScanHistory {
  return { hits: [], consecutiveMisses: 0, consecutiveMaskedMisses: 0, trackId: null };
}

/**
 * Record one scan result. Returns CONFIRMED when a new track should be created,
 * LOST when the live track should be dropped. The caller sets `trackId`.
 */
export function recordScan(h: ScanHistory, hit: boolean, masked = false): ScanUpdate {
  h.hits.push(hit);
  if (h.hits.length > CONFIRM_WINDOW) h.hits.shift();
  h.consecutiveMisses = hit ? 0 : h.consecutiveMisses + 1;
  h.consecutiveMaskedMisses = hit ? 0 : h.consecutiveMaskedMisses + (masked ? 1 : 0);

  if (h.trackId === null) {
    return h.hits.filter(Boolean).length >= CONFIRM_HITS ? 'CONFIRMED' : null;
  }
  if (h.consecutiveMisses >= LOSE_MISSES) {
    h.hits = [];
    return 'LOST';
  }
  return null;
}

/** Why a track was just lost: LOS when every losing miss was masked. */
export function lostReason(h: Readonly<ScanHistory>): 'LOS' | 'MISSES' {
  return h.consecutiveMaskedMisses >= h.consecutiveMisses ? 'LOS' : 'MISSES';
}

// ---- Alpha-beta filter (decision 51) ------------------------------------------
// 2D (x east, z north) position + velocity. Radar height is not measured with
// noise, so track height stays the true AGL (tech debt: track height leaks truth).

export const FILTER_ALPHA = 0.5;
export const FILTER_BETA = 0.2;

export interface TrackFilter {
  /** Filtered position at `tMs`. */
  x: number;
  z: number;
  /** Velocity, m/s; meaningful once `hasVelocity`. */
  vx: number;
  vz: number;
  tMs: number;
  /** False until the second measurement (velocity from two points). */
  hasVelocity: boolean;
}

export function createTrackFilter(x: number, z: number, tMs: number): TrackFilter {
  return { x, z, vx: 0, vz: 0, tMs, hasVelocity: false };
}

/** Position extrapolated to `tMs` (pos + vel·Δt). */
export function predictFilter(f: Readonly<TrackFilter>, tMs: number): { x: number; z: number } {
  if (!f.hasVelocity) return { x: f.x, z: f.z };
  const dt = (tMs - f.tMs) / 1000;
  return { x: f.x + f.vx * dt, z: f.z + f.vz * dt };
}

/** Fold one measurement in. The second one sets velocity from two points; later ones use α-β. */
export function updateTrackFilter(f: TrackFilter, mx: number, mz: number, tMs: number): void {
  const dt = (tMs - f.tMs) / 1000;
  if (dt <= 0) return;
  if (!f.hasVelocity) {
    f.vx = (mx - f.x) / dt;
    f.vz = (mz - f.z) / dt;
    f.x = mx;
    f.z = mz;
    f.hasVelocity = true;
  } else {
    const px = f.x + f.vx * dt;
    const pz = f.z + f.vz * dt;
    const rx = mx - px;
    const rz = mz - pz;
    f.x = px + FILTER_ALPHA * rx;
    f.z = pz + FILTER_ALPHA * rz;
    f.vx += (FILTER_BETA / dt) * rx;
    f.vz += (FILTER_BETA / dt) * rz;
  }
  f.tMs = tMs;
}

export function formatTrackId(n: number): string {
  return `T${String(n).padStart(3, '0')}`;
}

export type TrackStatus = 'ACTIVE' | 'LOST';

export interface TrackState {
  readonly id: string;
  /** Ground truth link — for scoring/replay only; HUD must not display it. */
  readonly contactId: string;
  readonly sensorId: string;
  readonly sensorKind: SensorKind;
  status: TrackStatus;
  readonly createdTMs: number;
  lastUpdateTMs: number;
  /** Filtered (and predicted between scans) range / bearing from the sensor. */
  rangeM: number;
  bearingDeg: number;
  /** Filtered position estimate, predicted forward every tick. */
  pos: Vec3;
  /** Height above ground — true AGL (the 2D filter does not estimate it). */
  altitudeAglM: number;
  /** α-β filter state behind `pos`. */
  filter: TrackFilter;
  /** From the filter velocity; null until the second measurement. */
  headingDeg: number | null;
  speedMps: number | null;
  // Trainee annotations.
  markedDetected: boolean;
  classifiedAs: ContactClass | null;
  affiliation: Affiliation;
}
