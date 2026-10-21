import type { ContactKillChain, Penalty, Score, SimEvent } from '@vyuh/shared';
import { CLASS_LABEL, EFFECTOR_LABEL } from '@/lib/strings';

// Replay gate (decision 109) and the timeline's event markers.

/** Shown instead of a replay whenever it could not be exact (user wording). */
export const REPLAY_FALLBACK_TEXT =
  'This session used an older simulator version — showing the event timeline only, not a replay.';

export type ReplayGate = { ok: true } | { ok: false; why: string };

/**
 * A session replays only on the sim version and terrain revision it was played
 * on. A null terrain revision (recorded before Phase 4a) is attempted; the log
 * check that follows decides.
 */
export function replayGate(
  session: { simVersion: number | null; terrainRevision: number | null },
  simVersion: number,
  presetRevision: number,
): ReplayGate {
  if (session.simVersion !== simVersion) {
    return {
      ok: false,
      why: `Recorded on simulator version ${session.simVersion ?? 'unknown'}; this is version ${simVersion}.`,
    };
  }
  if (session.terrainRevision !== null && session.terrainRevision !== presetRevision) {
    return {
      ok: false,
      why: `Recorded on terrain revision ${session.terrainRevision}; the preset is now revision ${presetRevision}.`,
    };
  }
  return { ok: true };
}

/**
 * Link from a result-screen penalty to its moment in the AAR (Phase 4a Step 12).
 * v4 penalties carry their time; older ones are resolved by the AAR page from the
 * kill chain (`penaltyMoment`), so they link by their index in the score.
 */
export function penaltyHref(sessionId: string, p: Penalty, index: number): string {
  const base = `/aar/session/${sessionId}`;
  return p.tMs !== undefined ? `${base}?t=${p.tMs}` : `${base}?penalty=${index}`;
}

/** Start time for the AAR page from `?t=` or `?penalty=` (null = from the start). */
export function initialReplayTime(
  params: { t: string | null; penalty: string | null },
  score: Score | null | undefined,
  killChain: readonly ContactKillChain[],
): number {
  const t = Number(params.t);
  if (params.t !== null && Number.isFinite(t) && t > 0) return t;
  const i = Number(params.penalty);
  const p = params.penalty !== null && Number.isInteger(i) ? score?.penalties[i] : undefined;
  return (p && penaltyMoment(p, killChain)) ?? 0;
}

export type MarkerKind = 'DETECT' | 'CLASSIFY' | 'RESPOND' | 'GOOD' | 'BAD' | 'PENALTY';

export interface TimelineMarker {
  tMs: number;
  kind: MarkerKind;
  text: string;
}

/**
 * Where a penalty happened: its own time (trees from default_v4 record it), else
 * the moment of the contact's response in the kill chain (decision 112).
 */
export function penaltyMoment(p: Penalty, killChain: readonly ContactKillChain[]): number | null {
  if (p.tMs !== undefined) return p.tMs;
  const row = killChain.find((r) => r.contactId === p.contactId);
  return row?.stages.find((s) => s.stage === 'RESPOND')?.jumpTMs ?? null;
}

/** Timeline markers: the trainee's detections, classifications and responses, outcomes and penalties. */
export function timelineMarkers(
  events: readonly SimEvent[],
  score: Score | null,
  killChain: readonly ContactKillChain[],
): TimelineMarker[] {
  const out: TimelineMarker[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'MARKED_DETECTED':
        out.push({ tMs: e.tMs, kind: 'DETECT', text: `${e.trackId} marked detected` });
        break;
      case 'CLASSIFIED':
        out.push({
          tMs: e.tMs,
          kind: 'CLASSIFY',
          text: `${e.trackId} classified ${CLASS_LABEL[e.payload.class]}`,
        });
        break;
      case 'RESPONSE_ORDERED': {
        const r = e.payload.response;
        if (r === 'INTERCEPT' || r === 'EW_JAM' || r === 'EW_SPOOF') {
          out.push({
            tMs: e.tMs,
            kind: 'RESPOND',
            text: `${EFFECTOR_LABEL[r]} ordered on ${e.trackId}`,
          });
        }
        break;
      }
      case 'CONTACT_NEUTRALISED':
        out.push({ tMs: e.tMs, kind: 'GOOD', text: `Contact ${e.contactId} neutralised` });
        break;
      case 'CONTACT_REACHED_ASSET':
        out.push({ tMs: e.tMs, kind: 'BAD', text: `Contact ${e.contactId} reached the asset` });
        break;
      case 'CONTACT_DROPPED':
        out.push({ tMs: e.tMs, kind: 'BAD', text: `Contact ${e.contactId} dropped its payload` });
        break;
      default:
        break;
    }
  }
  // Session adjustments include bonuses (a non-threat correctly identified, +5); only
  // deductions are penalties.
  for (const p of score?.penalties ?? []) {
    const t = p.points < 0 ? penaltyMoment(p, killChain) : null;
    if (t !== null) out.push({ tMs: t, kind: 'PENALTY', text: `${p.points} · ${p.feedback}` });
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}
