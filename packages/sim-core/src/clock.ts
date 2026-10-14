// Fixed-step sim clock (SPEC §3.1): 20 Hz, integer milliseconds since session start.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
/** Tick length in seconds, for kinematics. */
export const TICK_S = TICK_MS / 1000;

export interface SimClock {
  /** Number of completed ticks. */
  readonly tick: number;
  /** Sim time in ms; always tick × TICK_MS. */
  readonly tMs: number;
}

export function createClock(): SimClock {
  return { tick: 0, tMs: 0 };
}

export function advanceClock(clock: SimClock): SimClock {
  const tick = clock.tick + 1;
  return { tick, tMs: tick * TICK_MS };
}

/** First tick boundary at or after `ms` (commands and spawns snap to ticks). */
export function ceilToTick(ms: number): number {
  return Math.ceil(ms / TICK_MS) * TICK_MS;
}
