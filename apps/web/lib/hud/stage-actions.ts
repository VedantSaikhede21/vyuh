import type { Asset } from '@vyuh/shared';
import type { TrackView } from '@/lib/sim/store';

// What the track card offers first for the selected track (player plan §6.2).
// Pure and display-only: it decides order, never whether an action is allowed.
// actionStates() stays the only authority, and every key works from any stage.

export type ActionKey =
  | 'MARK'
  | 'CUE'
  | 'CLASSIFY'
  | 'HOSTILE'
  | 'FRIENDLY'
  | 'NEUTRAL'
  | 'UNKNOWN'
  | 'MONITOR'
  | 'REPORT'
  | 'JAM'
  | 'SPOOF'
  | 'INTERCEPT';

export const ALL_ACTIONS: readonly ActionKey[] = [
  'MARK',
  'CUE',
  'CLASSIFY',
  'HOSTILE',
  'FRIENDLY',
  'NEUTRAL',
  'UNKNOWN',
  'MONITOR',
  'REPORT',
  'JAM',
  'SPOOF',
  'INTERCEPT',
];

type Stage = Pick<TrackView, 'status' | 'markedDetected' | 'classifiedAs' | 'affiliation'>;

export function stageActions(track: Stage | null): readonly ActionKey[] {
  if (!track) return [];
  if (track.status === 'LOST') return ['REPORT'];
  if (!track.markedDetected) return ['MARK', 'CUE', 'MONITOR'];
  if (track.classifiedAs === null) return ['CLASSIFY', 'CUE', 'HOSTILE', 'UNKNOWN'];
  if (track.affiliation === 'UNKNOWN') return ['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN'];
  if (track.affiliation === 'HOSTILE') return ['JAM', 'SPOOF', 'INTERCEPT', 'MONITOR', 'REPORT'];
  return ['MONITOR', 'REPORT', 'HOSTILE', 'FRIENDLY', 'NEUTRAL'];
}

export function moreActions(track: Stage | null): readonly ActionKey[] {
  const shown = new Set(stageActions(track));
  return ALL_ACTIONS.filter((a) => !shown.has(a));
}

type Moving = Pick<TrackView, 'x' | 'z' | 'headingDeg' | 'speedMps'>;
type Site = Pick<Asset, 'x' | 'z' | 'name'>;

export interface AssetClosure {
  name: string;
  rangeM: number;
  /** Seconds until the closest approach to it at this speed; null when not closing. */
  etaS: number | null;
}

/** The nearest defended asset, and how long until the track reaches it. */
export function nearestAsset(track: Moving, assets: readonly Site[]): AssetClosure | null {
  let best: AssetClosure | null = null;
  for (const a of assets) {
    const dx = a.x - track.x;
    const dz = a.z - track.z;
    const rangeM = Math.hypot(dx, dz);
    let etaS: number | null = null;
    if (track.headingDeg !== null && track.speedMps !== null && track.speedMps > 0.5) {
      const h = (track.headingDeg * Math.PI) / 180;
      const closing = (Math.sin(h) * dx + Math.cos(h) * dz) / Math.max(rangeM, 1);
      const speed = closing * track.speedMps;
      if (speed > 0.5) etaS = rangeM / speed;
    }
    if (!best || rangeM < best.rangeM) best = { name: a.name, rangeM, etaS };
  }
  return best;
}

/** Most urgent first: closing tracks by time to the asset, then the rest by range, lost last. */
export function threatOrder<T extends Moving & Pick<TrackView, 'status' | 'rangeM' | 'id'>>(
  tracks: readonly T[],
  assets: readonly Site[],
): T[] {
  const key = (t: T): [number, number] => {
    if (t.status === 'LOST') return [2, t.rangeM];
    const eta = nearestAsset(t, assets)?.etaS ?? null;
    return eta === null ? [1, t.rangeM] : [0, eta];
  };
  return [...tracks].sort((a, b) => {
    const [ga, va] = key(a);
    const [gb, vb] = key(b);
    return ga - gb || va - vb || a.id.localeCompare(b.id);
  });
}
