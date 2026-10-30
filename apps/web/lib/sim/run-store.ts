import type { SimEvent } from '@vyuh/shared';
import { SIM_VERSION, commandFromEvent } from '@vyuh/sim-core';
import type { BatcherPosition } from './event-batcher';

// Enough to rebuild a run after a reload (system plan S2): the trainee's commands
// and the sim time. The sim is deterministic, so that restores everything else.
// sessionStorage is a per-tab convenience: when it fails, resume is not offered.

export interface StoredRun {
  simVersion: number;
  tMs: number;
  /** Trainee events, plus an operator abort if there was one. */
  events: SimEvent[];
  /** Count of all events at `tMs`: the rebuilt log must reach exactly this. */
  logLength: number;
  batcher: BatcherPosition;
}

const key = (sessionId: string) => `vyuh.run.${sessionId}`;

/** The events that rebuild a run. */
export function replayableEvents(events: readonly SimEvent[]): SimEvent[] {
  return events.filter(
    (ev) =>
      commandFromEvent(ev) !== null ||
      (ev.type === 'SESSION_ENDED' && ev.payload.reason === 'ABORTED'),
  );
}

export function saveRun(sessionId: string, run: Omit<StoredRun, 'simVersion'>): void {
  try {
    window.sessionStorage.setItem(
      key(sessionId),
      JSON.stringify({ simVersion: SIM_VERSION, ...run }),
    );
  } catch {
    // Storage full or blocked: no resume for this run.
  }
}

/** A stored run for this session, if this tab has one this sim can rebuild. */
export function loadRun(sessionId: string): StoredRun | null {
  try {
    const raw = window.sessionStorage.getItem(key(sessionId));
    if (!raw) return null;
    const run = JSON.parse(raw) as StoredRun;
    return run.simVersion === SIM_VERSION ? run : null;
  } catch {
    return null;
  }
}

export function clearRun(sessionId: string): void {
  try {
    window.sessionStorage.removeItem(key(sessionId));
  } catch {
    // Nothing to do.
  }
}
