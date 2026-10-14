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
  /** Id of the live track for this history, or null when there is none. */
  trackId: string | null;
}

export type ScanUpdate = 'CONFIRMED' | 'LOST' | null;

export function createScanHistory(): ScanHistory {
  return { hits: [], consecutiveMisses: 0, trackId: null };
}

/**
 * Record one scan result. Returns CONFIRMED when a new track should be created,
 * LOST when the live track should be dropped. The caller sets `trackId`.
 */
export function recordScan(h: ScanHistory, hit: boolean): ScanUpdate {
  h.hits.push(hit);
  if (h.hits.length > CONFIRM_WINDOW) h.hits.shift();
  h.consecutiveMisses = hit ? 0 : h.consecutiveMisses + 1;

  if (h.trackId === null) {
    return h.hits.filter(Boolean).length >= CONFIRM_HITS ? 'CONFIRMED' : null;
  }
  if (h.consecutiveMisses >= LOSE_MISSES) {
    h.hits = [];
    return 'LOST';
  }
  return null;
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
  /** Latest measurement from the sensor. */
  rangeM: number;
  bearingDeg: number;
  /** Position estimate in the scenario frame. */
  pos: Vec3;
  /** Estimated from the last two measurements; null until there are two. */
  headingDeg: number | null;
  speedMps: number | null;
  // Trainee annotations.
  markedDetected: boolean;
  classifiedAs: ContactClass | null;
  affiliation: Affiliation;
}
