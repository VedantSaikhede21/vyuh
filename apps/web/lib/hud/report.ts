import type {
  Activity,
  Affiliation,
  AltitudeBand,
  ContactReport,
  ReportedClass,
} from '@vyuh/shared';
import type { HudSnapshot, TrackView } from '@/lib/sim/store';
import { altitudeBand } from './derive';

// Structured contact report (SPEC §4.3, Phase 4a Step 9). The prefill uses only
// what the operator knows: the first track's sensor bearing and range, its
// estimated heading and height (never truth, decision 108), and the trainee's
// own class and affiliation calls. Activity is the trainee's judgement and
// starts UNKNOWN.

export interface ReportDraft {
  trackIds: string[];
  count: number;
  class: ReportedClass;
  affiliation: Affiliation;
  bearingDeg: number;
  rangeM: number;
  fromSensorId: string;
  headingDeg: number;
  /** False when the track has no heading estimate yet (one radar hit). */
  headingKnown: boolean;
  altitudeBand: AltitudeBand;
  activity: Activity;
}

/** Activity keys 1–5 in the report form. */
export const ACTIVITY_KEYS: { key: string; activity: Activity; label: string; short: string }[] = [
  { key: '1', activity: 'APPROACHING', label: 'Approaching', short: 'APPR' },
  { key: '2', activity: 'LOITERING', label: 'Loitering', short: 'LOIT' },
  { key: '3', activity: 'DEPARTING', label: 'Departing', short: 'DEPT' },
  { key: '4', activity: 'HOVERING', label: 'Hovering', short: 'HOVR' },
  { key: '5', activity: 'UNKNOWN', label: 'Unknown', short: 'UNK' },
];

/** Other active tracks this close to the first one are offered for the same report. */
export const REPORT_NEARBY_M = 1500;
export const REPORT_NEARBY_MAX = 6;

/** Active tracks near `first`, closest first (a swarm reported as one group). */
export function nearbyTracks(hud: HudSnapshot, first: TrackView): TrackView[] {
  return hud.tracks
    .filter((t) => t.id !== first.id && t.status === 'ACTIVE')
    .map((t) => ({ t, d: Math.hypot(t.x - first.x, t.z - first.z) }))
    .filter(({ d }) => d <= REPORT_NEARBY_M)
    .sort((a, b) => a.d - b.d || a.t.id.localeCompare(b.t.id))
    .slice(0, REPORT_NEARBY_MAX)
    .map(({ t }) => t);
}

function norm360(deg: number): number {
  const d = ((deg % 360) + 360) % 360;
  return d >= 360 ? 0 : d;
}

/** A draft for the given tracks (the first one gives location, heading and height). */
export function prefillReport(hud: HudSnapshot, trackIds: readonly string[]): ReportDraft | null {
  const tracks = trackIds
    .map((id) => hud.tracks.find((t) => t.id === id))
    .filter((t): t is TrackView => t !== undefined);
  const first = tracks[0];
  if (!first) return null;
  return {
    trackIds: tracks.map((t) => t.id),
    count: tracks.length,
    class: first.classifiedAs ?? 'UNKNOWN',
    affiliation: first.affiliation,
    bearingDeg: norm360(first.bearingDeg),
    rangeM: Math.max(0, first.rangeM),
    fromSensorId: first.sensorId,
    headingDeg: norm360(Math.round(first.headingDeg ?? 0)),
    headingKnown: first.headingDeg !== null,
    altitudeBand: altitudeBand(first.altitudeAglM),
    activity: 'UNKNOWN',
  };
}

/** Add or remove a track; location, heading and height follow the first one left. */
export function toggleReportTrack(
  hud: HudSnapshot,
  draft: ReportDraft,
  trackId: string,
): ReportDraft {
  const has = draft.trackIds.includes(trackId);
  const ids = has ? draft.trackIds.filter((id) => id !== trackId) : [...draft.trackIds, trackId];
  if (ids.length === 0) return draft;
  const base = prefillReport(hud, ids);
  if (!base) return draft;
  // Keep the trainee's edits; recompute what depends on the tracks.
  const firstChanged = ids[0] !== draft.trackIds[0];
  return {
    ...draft,
    trackIds: base.trackIds,
    count: Math.max(base.trackIds.length, draft.count + (has ? -1 : 1)),
    ...(firstChanged
      ? {
          bearingDeg: base.bearingDeg,
          rangeM: base.rangeM,
          fromSensorId: base.fromSensorId,
          headingDeg: base.headingDeg,
          headingKnown: base.headingKnown,
          altitudeBand: base.altitudeBand,
        }
      : {}),
  };
}

export function reportPayload(draft: ReportDraft, tMs: number): ContactReport {
  return {
    tMs,
    trackIds: draft.trackIds,
    count: draft.count,
    class: draft.class,
    affiliation: draft.affiliation,
    location: {
      bearingDeg: draft.bearingDeg,
      rangeM: draft.rangeM,
      fromSensorId: draft.fromSensorId,
    },
    headingDeg: draft.headingDeg,
    altitudeBand: draft.altitudeBand,
    activity: draft.activity,
  };
}
