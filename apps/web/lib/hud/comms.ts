import type { SimEvent } from '@vyuh/shared';
import type { CommsLine, CommsStatus } from '@/components/hud/primitives/comms-log';
import { CLASS_LABEL, EFFECTOR_LABEL } from '@/lib/strings';
import { EW_SECTOR_DEG, bearingDeg, formatBearing, formatKm } from './derive';

// Comms log lines from the sim event log (DESIGN §9). Only operator-visible
// facts: track ids, sensor-measured range/bearing, the trainee's own orders
// and observable outcomes. `contactId` and collateral lists are never read
// (decision 66), and truth-only events (spawns, EO identifiability) are skipped.

export interface CommsContext {
  /** Current estimate of a track, for sector bearings at order time. */
  trackPos(trackId: string): { x: number; z: number } | null;
  effectorPos(kind: 'EW_JAM' | 'EW_SPOOF'): { x: number; z: number } | null;
  assetName(assetId: string): string;
}

const RESULT: Record<string, { text: string; status: CommsStatus }> = {
  NEUTRALISED: { text: 'NEUTRALISED', status: 'ok' },
  MISSED: { text: 'MISSED', status: 'warn' },
  NO_EFFECT: { text: 'NO EFFECT', status: 'warn' },
  BLOCKED_BY_ROE: { text: 'BLOCKED — ROE', status: 'warn' },
  BLOCKED_NO_KINETIC: { text: 'BLOCKED — NO-KINETIC ZONE', status: 'warn' },
  OUT_OF_RANGE: { text: 'OUT OF RANGE', status: 'warn' },
  COOLDOWN: { text: 'RELOADING', status: 'warn' },
  NO_AMMO: { text: 'NO ROUNDS LEFT', status: 'warn' },
};

const RESPONSE_NAME: Record<string, string> = {
  MONITOR: 'MONITOR',
  REPORT: 'REPORT',
  EW_JAM: 'JAM',
  EW_SPOOF: 'SPOOF',
  INTERCEPT: 'INTERCEPT',
};

const END_REASON: Record<string, string> = {
  TIME_UP: 'TIME UP',
  ALL_RESOLVED: 'ALL TRACKS RESOLVED',
  ABORTED: 'ENDED BY OPERATOR',
};

/** One event → at most one line; null for events the operator would not see. */
export function eventLine(e: SimEvent, ctx: CommsContext): Omit<CommsLine, 'id'> | null {
  const t = e.tMs;
  switch (e.type) {
    case 'SENSOR_TRACK_CREATED':
      return {
        tMs: t,
        text:
          `NEW TRACK ${e.trackId}  BRG ${formatBearing(e.payload.bearingDeg)}` +
          (e.payload.rangeM === undefined ? '' : `  RNG ${formatKm(e.payload.rangeM)} km`),
      };
    case 'SENSOR_TRACK_LOST':
      return { tMs: t, text: `TRACK ${e.trackId} LOST` };
    case 'TRACK_SELECTED':
      return { tMs: t, text: `${e.trackId} SELECTED` };
    case 'CAMERA_SLEWED':
      return e.trackId ? { tMs: t, text: `EO CUED TO ${e.trackId}` } : null;
    case 'MARKED_DETECTED':
      return { tMs: t, text: `${e.trackId} MARKED DETECTED` };
    case 'CLASSIFIED':
      return {
        tMs: t,
        text: `${e.trackId} CLASSIFIED  ${CLASS_LABEL[e.payload.class].toUpperCase()}`,
      };
    case 'AFFILIATION_SET':
      return { tMs: t, text: `${e.trackId} AFFILIATION  ${e.payload.affiliation}` };
    case 'RESPONSE_ORDERED': {
      const r = e.payload.response;
      if (r === 'EW_JAM' || r === 'EW_SPOOF') {
        const eff = ctx.effectorPos(r);
        const tr = e.trackId ? ctx.trackPos(e.trackId) : null;
        const sector =
          eff && tr ? `  SECTOR ${formatBearing(bearingDeg(eff, tr))} ±${EW_SECTOR_DEG}°` : '';
        return { tMs: t, text: `${EFFECTOR_LABEL[r]} ORDERED  ${e.trackId}${sector}` };
      }
      return { tMs: t, text: `${RESPONSE_NAME[r] ?? r} ORDERED  ${e.trackId}` };
    }
    case 'RESPONSE_OUTCOME': {
      const res = RESULT[e.payload.result] ?? { text: e.payload.result, status: 'info' };
      return {
        tMs: t,
        text: `${e.trackId} ${RESPONSE_NAME[e.payload.response] ?? e.payload.response}  ${res.text}`,
        status: res.status,
      };
    }
    case 'CONTACT_DROPPED':
      // Only when the EO tracker held the track at the release (decision 70); the
      // event's x/z and contactId are never shown.
      return e.trackId
        ? { tMs: t, text: `${e.trackId} PAYLOAD RELEASE OBSERVED`, status: 'crit' }
        : null;
    case 'CONTACT_REACHED_ASSET':
      return {
        tMs: t,
        text: `IMPACT AT ${ctx.assetName(e.payload.assetId).toUpperCase()}`,
        status: 'crit',
      };
    case 'SESSION_ENDED':
      return {
        tMs: t,
        text: `SESSION ENDED — ${END_REASON[e.payload.reason] ?? e.payload.reason}`,
      };
    default:
      return null;
  }
}

/**
 * Incremental builder: feed it the growing event log; it converts only new
 * events (so sector bearings are taken at order time) and collapses runs of
 * TRACK_SELECTED into the latest one so Tab-cycling does not flood the log.
 */
export class CommsBuilder {
  private seen = 0;
  /** Track the EO is cued to, so repeated slew events while locked log once. */
  private cuedTo: string | null = null;
  readonly lines: CommsLine[] = [];

  constructor(private readonly ctx: CommsContext) {}

  update(events: readonly SimEvent[]): boolean {
    if (events.length === this.seen) return false;
    for (let i = this.seen; i < events.length; i++) {
      const e = events[i]!;
      if (e.type === 'CAMERA_SLEWED') {
        const to = e.trackId ?? null;
        const repeat = to === this.cuedTo;
        this.cuedTo = to;
        if (repeat) continue;
      }
      const line = eventLine(e, this.ctx);
      if (!line) continue;
      const last = this.lines.at(-1);
      if (e.type === 'TRACK_SELECTED' && last?.id.startsWith('sel-')) this.lines.pop();
      this.lines.push({ id: `${e.type === 'TRACK_SELECTED' ? 'sel-' : 'ev-'}${e.seq}`, ...line });
    }
    this.seen = events.length;
    return true;
  }
}
