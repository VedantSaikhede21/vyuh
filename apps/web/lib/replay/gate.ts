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

export type MarkerKind = 'DETECT' | 'CLASSIFY' | 'RESPOND' | 'GOOD' | 'BAD' | 'PENALTY';

export interface TimelineMarker {
  tMs: number;
  kind: MarkerKind;
  text: string;
}

/**
 * Where a penalty happened: its own time (trees from default_v4 record it), else
 * the moment of the contact's response in the kill chain (decision 111).
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
  for (const p of score?.penalties ?? []) {
    const t = penaltyMoment(p, killChain);
    if (t !== null) out.push({ tMs: t, kind: 'PENALTY', text: `${p.points} · ${p.feedback}` });
  }
  return out.sort((a, b) => a.tMs - b.tMs);
}
