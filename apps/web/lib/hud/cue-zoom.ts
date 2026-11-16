import type { EoLevel } from '@vyuh/shared';
import { EO_ACQUIRE_FRAME_FRACTION, type EoTrackMode } from '@vyuh/sim-core';
import { ACQ_AFTER_MS } from './derive';

// Cue framing (decision 176). A cue at full zoom almost never locked: the radar's
// pointing error is wider than the picture. So a cue first opens the field of view
// wide enough for the EO tracker to find the target, and once the tracker holds it,
// zooms in to frame it. Only the radar range is used (what the trainee sees), never
// the contact's true size or class.

/**
 * Radar-cue pointing error seen from the EO mast, 95th percentile, by range band
 * (`node packages/sim-core/scripts/cue-error.ts`, six scripted scenarios, ~116 k
 * samples, SIM_VERSION 7). Close in, the height estimate dominates.
 */
export const CUE_ERROR_P95: readonly { maxRangeM: number; azDeg: number; elDeg: number }[] = [
  { maxRangeM: 500, azDeg: 3.7, elDeg: 9.4 },
  { maxRangeM: 1000, azDeg: 1.7, elDeg: 2.8 },
  { maxRangeM: Infinity, azDeg: 2.3, elDeg: 1.4 },
];

/** The camera picture is 16:9; vertical FOV ≈ horizontal ÷ this for small angles. */
const PICTURE_ASPECT = 16 / 9;

/** Smallest horizontal FOV whose acquisition window covers the cue error at this range. */
export function searchFovDeg(rangeM: number): number {
  const e = CUE_ERROR_P95.find((b) => rangeM < b.maxRangeM) ?? CUE_ERROR_P95.at(-1)!;
  const f = EO_ACQUIRE_FRAME_FRACTION;
  return Math.max((2 * e.azDeg) / f, (2 * e.elDeg * PICTURE_ASPECT) / f);
}

/**
 * Cue field of view, detection first (eo-haze plan [C1], user 2026-11-16). The EO
 * tracker locks only on a contact it can DETECT inside its window, and haze cuts
 * that range hardest for a small drone against the ground. So the cue takes the
 * widest zoom step whose worst-case DETECT range (`worstCaseDetectRangeM`: a small
 * quad seen against the ground, this scenario's air) reaches the track's radar
 * range, even when that step is narrower than the p95 pointing error: the tracker
 * then locks whenever the error is small, instead of never. If no step reaches it,
 * the narrowest step, which detects farthest, so the tracker locks as soon as the
 * contact comes in range (user 2026-11-16, measured with test/cue-lock.test.ts).
 * Where detection does not apply (thermal, night: `detectRangeAt` null), the
 * decision-176 pick: the narrowest step that covers the pointing error. Radar
 * range and the scenario's conditions only; never the contact's truth.
 */
export function cueFovDeg(
  steps: readonly number[],
  rangeM: number,
  detectRangeAt: ((hfovDeg: number) => number) | null,
): number {
  if (!detectRangeAt || steps.length === 0) return pickStep(steps, searchFovDeg(rangeM));
  for (const s of steps) if (detectRangeAt(s) >= rangeM) return s;
  return steps[steps.length - 1]!;
}

/** Framing: a nominal object of this size (m)… */
export const FRAME_SIZE_M = 2;
/** …spans at most this fraction of the picture width (helicopters still fit). */
export const FRAME_FILL = 0.4;

/** Narrowest horizontal FOV that keeps a FRAME_SIZE_M object within FRAME_FILL of the width. */
export function frameFovDeg(rangeM: number): number {
  const r = Math.max(rangeM, 1);
  return (2 * Math.atan(FRAME_SIZE_M / 2 / r) * 180) / Math.PI / FRAME_FILL;
}

/** Narrowest zoom step at least `minFovDeg` wide; the widest step if none is. Steps: widest first. */
export function pickStep(steps: readonly number[], minFovDeg: number): number {
  let best = steps[0]!;
  for (const s of steps) if (s >= minFovDeg - 1e-9) best = s;
  return best;
}

export type VerdictTone = 'ok' | 'info' | 'warn';

export interface CameraVerdict {
  tone: VerdictTone;
  text: string;
}

/**
 * One line under the camera picture: can the trainee identify the target from
 * what the picture shows? From the sim's camera state only (`targetLevel` is
 * what the EO tracker sees, SIM_VERSION 7), never from ground truth.
 */
export function cameraVerdict(
  mode: EoTrackMode,
  level: EoLevel | null,
  lockTrackId: string | null,
  cueSinceTMs: number | null,
  tMs: number,
): CameraVerdict | null {
  if (mode === 'MANUAL') return null;
  if (mode === 'CUE') {
    const searching = cueSinceTMs === null || tMs - cueSinceTMs < ACQ_AFTER_MS;
    return searching
      ? { tone: 'info', text: `Searching for ${lockTrackId ?? 'the track'}` }
      : { tone: 'warn', text: 'No lock — too small or outside the picture at this zoom' };
  }
  switch (level) {
    case 'IDENTIFY':
      return { tone: 'ok', text: 'Clear enough to identify' };
    case 'RECOGNISE':
      return { tone: 'info', text: 'Shape visible — type not certain yet' };
    case 'DETECT':
      return { tone: 'warn', text: 'Too far to identify — a dot, no shape yet' };
    default:
      return { tone: 'warn', text: 'Target faint — tracker holding' };
  }
}
