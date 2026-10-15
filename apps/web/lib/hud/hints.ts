import type { EoTrackMode } from '@vyuh/sim-core';
import type { TrackView } from '@/lib/sim/store';

// Practice-mode hints (plan Q9, decision 82): short Comms lines tagged HINT.
// Built only from what the operator can see — track ids, track age, their own
// selections and calls, the EO camera state and the ROE — never contact ids,
// true class or anything the sensors have not reported. Each hint fires at
// most once per track; Assessment shows none.

/** An active track not selected for this long gets a "not looked at" hint. */
export const HINT_UNSEEN_MS = 20_000;
/** The EO camera cued this long without a video lock gets a "zoom in" hint. */
export const HINT_CUE_MS = 10_000;

export interface Hint {
  /** Once-only key (`unseen:T004`, `cue:T004`, `tight:T004`). */
  key: string;
  text: string;
}

export interface HintInput {
  tMs: number;
  tracks: readonly TrackView[];
  /** Tracks the trainee has selected at least once. */
  selectedEver: ReadonlySet<string>;
  eo: { trackMode: EoTrackMode; lockTrackId: string | null; cueSinceTMs: number | null };
}

/** Hints due now (the caller drops keys already given). */
export function dueHints({ tMs, tracks, selectedEver, eo }: HintInput): Hint[] {
  const out: Hint[] = [];
  for (const t of tracks) {
    if (t.status !== 'ACTIVE' || selectedEver.has(t.id)) continue;
    if (tMs - t.createdTMs >= HINT_UNSEEN_MS) {
      out.push({ key: `unseen:${t.id}`, text: `${t.id} has not been looked at. Tab selects it.` });
    }
  }
  if (
    eo.trackMode === 'CUE' &&
    eo.lockTrackId !== null &&
    eo.cueSinceTMs !== null &&
    tMs - eo.cueSinceTMs >= HINT_CUE_MS
  ) {
    out.push({
      key: `cue:${eo.lockTrackId}`,
      text: 'Zoom in (+) or wait for the range to close.',
    });
  }
  return out;
}

/** Shown when an intercept is refused under WEAPONS_TIGHT. */
export function weaponsTightHint(trackId: string): Hint {
  return { key: `tight:${trackId}`, text: 'Classify (C) and declare hostile (H) first.' };
}
