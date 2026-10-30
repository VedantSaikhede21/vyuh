import { Scenario, type SimEvent } from '@vyuh/shared';
import {
  TICK_MS,
  createDefender,
  createSim,
  replaySchedule,
  replayTo,
  PROCEDURAL_HILLS,
  builtinWorld,
} from '@vyuh/sim-core';
import { describe, expect, it, vi } from 'vitest';
import S01 from '../../api/app/seed/scenarios/S01.json';
import { EventBatcher } from '@/lib/sim/event-batcher';
import { replayableEvents } from '@/lib/sim/run-store';

const scenario = Scenario.parse(S01);
const world = builtinWorld(PROCEDURAL_HILLS)!;

function play(untilMs: number) {
  const sim = createSim(scenario, world, { mode: 'PRACTICE' });
  const defender = createDefender(scenario);
  while (sim.getState().clock.tMs < untilMs && sim.getState().endReason === null) {
    for (const cmd of defender.step(sim.getState())) sim.dispatch(cmd);
    sim.tick();
  }
  return sim;
}

describe('session resume (system plan S2)', () => {
  it('a run rebuilt from stored commands continues into the identical log', () => {
    const full = play(120_000).getEvents();
    for (const cut of [TICK_MS * 40, 33_000, 61_250]) {
      const original = play(cut);
      const stored = replayableEvents(original.getEvents());
      const rebuilt = createSim(scenario, world, { mode: 'PRACTICE' });
      replayTo(rebuilt, replaySchedule(stored), original.getState().clock.tMs);
      expect(rebuilt.getEvents()).toEqual(original.getEvents());
      // Going on from the rebuilt sim gives exactly what the uninterrupted run gave.
      replayTo(rebuilt, replaySchedule(replayableEvents(full)), 120_000);
      expect(rebuilt.getEvents()).toEqual(full);
    }
  });

  it('a restored batcher resends a formed batch with the same seq and content', async () => {
    vi.useFakeTimers();
    const events = Array.from({ length: 5 }, (_, i) => ({ seq: i }) as unknown as SimEvent);
    const sent: [number, number][] = [];
    const batcher = new EventBatcher({
      send: async (seq, batch) => {
        sent.push([seq, batch.length]);
      },
      getEvents: () => events,
      restore: { nextBatchSeq: 3, sentUpTo: 2, formedUpTo: 4 },
    });
    await batcher.finish();
    vi.useRealTimers();
    expect(sent).toEqual([
      [2, 2],
      [3, 1],
    ]);
  });
});
