import type { Scenario, SessionMode, SimEvent } from '@vyuh/shared';
import {
  ReplayDivergence,
  compareLogs,
  createSim,
  replaySchedule,
  replayTick,
  type Heightmap,
  type ReplayCheck,
  type SimSnapshot,
  type World,
} from '@vyuh/sim-core';
import { KEYFRAME_MS } from './controller';

// Straight replay from t = 0 (run in a Web Worker): a keyframe every 10 s of sim
// time, then the regenerated log is checked against the stored one (decision 109).

export interface KeyframeResult {
  keyframes: SimSnapshot[];
  check: ReplayCheck;
}

export function computeKeyframes(
  scenario: Scenario,
  world: World | Heightmap,
  events: readonly SimEvent[],
  mode: SessionMode,
  onProgress?: (fraction: number) => void,
): KeyframeResult {
  const sim = createSim(scenario, world, { mode });
  const schedule = replaySchedule(events);
  const end = Math.max(events.at(-1)?.tMs ?? 0, 1);
  const keyframes = [sim.snapshot()];
  try {
    while (replayTick(sim, schedule)) {
      const t = sim.getState().clock.tMs;
      if (t % KEYFRAME_MS === 0) {
        keyframes.push(sim.snapshot());
        onProgress?.(Math.min(t / end, 1));
      }
    }
  } catch (err) {
    if (!(err instanceof ReplayDivergence)) throw err;
    return { keyframes, check: { ok: false, seq: -1, reason: err.message } };
  }
  return { keyframes, check: compareLogs(events, sim.getEvents()) };
}
