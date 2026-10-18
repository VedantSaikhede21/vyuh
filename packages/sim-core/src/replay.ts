import type { SimEvent } from '@vyuh/shared';
import { TICK_MS } from './clock.ts';
import { commandFromEvent, type Sim, type SimCommand } from './sim.ts';

// Replay (SPEC §3.4, Phase 4a): re-run a scenario from its logged trainee
// commands. A trainee event's tMs is the tick that applied it, so its command is
// dispatched just before the tick that advances the clock to that tMs. An
// operator abort (SESSION_ENDED ABORTED) is not a command: `end` is called after
// the tick that reached its time, as the live session did.

export interface ReplaySchedule {
  /** Commands to dispatch before the tick that reaches this tMs, in log order. */
  readonly byTick: ReadonlyMap<number, readonly SimCommand[]>;
  /** Sim time at which the operator ended the session, if they did. */
  readonly abortAtTMs: number | null;
}

export function replaySchedule(events: readonly SimEvent[]): ReplaySchedule {
  const byTick = new Map<number, SimCommand[]>();
  let abortAtTMs: number | null = null;
  for (const ev of events) {
    const cmd = commandFromEvent(ev);
    if (cmd !== null) {
      const list = byTick.get(ev.tMs);
      if (list) list.push(cmd);
      else byTick.set(ev.tMs, [cmd]);
    } else if (ev.type === 'SESSION_ENDED' && ev.payload.reason === 'ABORTED') {
      abortAtTMs = ev.tMs;
    }
  }
  return { byTick, abortAtTMs };
}

/** Why a replay step could not apply a logged command (the log does not fit this sim). */
export class ReplayDivergence extends Error {
  // A plain field, not a parameter property: Node's type stripping (CLI scripts) rejects those.
  readonly tMs: number;

  constructor(message: string, tMs: number) {
    super(message);
    this.name = 'ReplayDivergence';
    this.tMs = tMs;
  }
}

/** Advance one tick with the logged commands for it. Returns false once the sim has ended. */
export function replayTick(sim: Sim, schedule: ReplaySchedule): boolean {
  const st = sim.getState();
  if (st.endReason !== null) return false;
  const next = st.clock.tMs + TICK_MS;
  for (const cmd of schedule.byTick.get(next) ?? []) {
    const r = sim.dispatch(cmd);
    if (!r.ok) throw new ReplayDivergence(`${cmd.type} rejected: ${r.reason}`, next);
  }
  sim.tick();
  if (schedule.abortAtTMs !== null && sim.getState().clock.tMs === schedule.abortAtTMs) {
    sim.end('ABORTED');
  }
  return sim.getState().endReason === null;
}

/** Replay up to (and including) the tick at `tMs`, or until the session ends. */
export function replayTo(sim: Sim, schedule: ReplaySchedule, tMs: number): void {
  while (sim.getState().clock.tMs < tMs && replayTick(sim, schedule)) {
    // advancing
  }
}

export type ReplayCheck = { ok: true } | { ok: false; seq: number; reason: string };

/** Order-insensitive deep equality for JSON-like values (stored events come from jsonb). */
function same(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => same(v, b[i]));
  }
  const ak = Object.keys(a).filter((k) => (a as Record<string, unknown>)[k] !== undefined);
  const bk = Object.keys(b).filter((k) => (b as Record<string, unknown>)[k] !== undefined);
  return (
    ak.length === bk.length &&
    ak.every((k) => same((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]))
  );
}

/**
 * Compare a regenerated log with the stored one, event by event. The first
 * difference is reported; a replay that differs anywhere is not shown (decision 109).
 */
export function compareLogs(
  stored: readonly SimEvent[],
  replayed: readonly SimEvent[],
): ReplayCheck {
  const n = Math.min(stored.length, replayed.length);
  for (let i = 0; i < n; i++) {
    const ev = stored[i];
    if (ev !== undefined && !same(ev, replayed[i])) {
      return { ok: false, seq: ev.seq, reason: `event ${ev.seq} differs` };
    }
  }
  if (stored.length !== replayed.length) {
    return {
      ok: false,
      seq: n,
      reason: `stored log has ${stored.length} events, replay produced ${replayed.length}`,
    };
  }
  return { ok: true };
}
