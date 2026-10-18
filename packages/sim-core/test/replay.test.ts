import { readFileSync } from 'node:fs';
import { Scenario, type SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  TICK_MS,
  compareLogs,
  createSim,
  replaySchedule,
  replayTick,
  replayTo,
  type SimSnapshot,
} from '../src/index.ts';
import { loadScripted } from './fixture-logs.ts';
import { presetWorld } from './fixtures.ts';
import { playTrainee } from './trainee-policy.ts';

// Replay and keyframes (Phase 4a, decisions 107, 109): a log replayed from its
// commands reproduces the original run exactly, and restoring any 10 s keyframe
// and running on gives exactly what the straight run gave.

const KEYFRAME_MS = 10_000;

const GENERATED = Scenario.parse(
  JSON.parse(
    readFileSync(new URL('./data/generated-punjab-d5-seed6.json', import.meta.url), 'utf8'),
  ),
);

const CASES: [string, () => Scenario][] = [
  ...[
    'S01',
    'S02',
    'S03',
    'S04',
    'S05',
    'S06',
    'S07',
    'S08',
    'S09',
    'S10',
    'S11',
    'S12',
    'S13',
    'S14',
    'S15',
  ].map((id): [string, () => Scenario] => [id, () => loadScripted(id)]),
  ['generated PUNJAB D5 seed 6', () => GENERATED],
];

function json(v: unknown): unknown {
  return JSON.parse(JSON.stringify(v));
}

describe.each(CASES)('replay %s', (_name, load) => {
  const scenario = load();
  const world = presetWorld(scenario.terrain.preset);
  const original = playTrainee(scenario, world);
  const events: readonly SimEvent[] = json(original.getEvents()) as SimEvent[];
  const schedule = replaySchedule(events);

  // Straight replay from t = 0, keeping a keyframe every 10 s of sim time.
  const replay = createSim(scenario, world, { mode: 'ASSESSMENT' });
  const keyframes: SimSnapshot[] = [replay.snapshot()];
  while (replayTick(replay, schedule)) {
    if (replay.getState().clock.tMs % KEYFRAME_MS === 0) keyframes.push(replay.snapshot());
  }

  it('reproduces the original event log and final state exactly', () => {
    expect(compareLogs(events, json(replay.getEvents()) as SimEvent[])).toEqual({ ok: true });
    expect(json(replay.getState())).toEqual(json(original.getState()));
    // The policy exercised every trainee command replay has to handle.
    const types = new Set(events.map((e) => e.type));
    for (const t of ['TRACK_SELECTED', 'CAMERA_SLEWED', 'SESSION_ENDED'])
      expect(types).toContain(t);
  });

  it('restores every keyframe to exactly the next one', () => {
    for (let k = 0; k + 1 < keyframes.length; k++) {
      const sim = createSim(scenario, world, { mode: 'ASSESSMENT' });
      sim.restore(keyframes[k]!, events);
      replayTo(sim, schedule, keyframes[k + 1]!.tMs);
      expect(sim.snapshot(), `keyframe ${k} → ${k + 1}`).toEqual(keyframes[k + 1]);
    }
  });

  it('runs on from a middle keyframe to the same end, on a sim that had already run', () => {
    const mid = keyframes[Math.floor(keyframes.length / 2)]!;
    // A used sim (ended, caches warm) is restored backwards in time.
    const sim = createSim(scenario, world, { mode: 'ASSESSMENT' });
    replayTo(sim, schedule, Number.MAX_SAFE_INTEGER);
    sim.restore(mid, events);
    expect(sim.getState().clock.tMs).toBe(mid.tMs);
    expect(sim.getEvents()).toHaveLength(mid.eventCount);
    while (replayTick(sim, schedule)) {
      // to the end
    }
    expect(compareLogs(events, json(sim.getEvents()) as SimEvent[])).toEqual({ ok: true });
    expect(json(sim.getState())).toEqual(json(original.getState()));
  });
});

describe('replay checks', () => {
  const scenario = loadScripted('S01');
  const world = presetWorld(scenario.terrain.preset);
  const events = json(playTrainee(scenario, world).getEvents()) as SimEvent[];

  it('reports the first event that differs, and a length mismatch', () => {
    const changed = events.map((e) =>
      e.type === 'SENSOR_TRACK_CREATED' ? { ...e, payload: { ...e.payload, rangeM: 1 } } : e,
    );
    const first = changed.find((e) => e.type === 'SENSOR_TRACK_CREATED')!;
    expect(compareLogs(changed, events)).toMatchObject({ ok: false, seq: first.seq });
    expect(compareLogs(events, events.slice(0, -1))).toMatchObject({ ok: false });
  });

  it('ignores key order (stored events come back from jsonb)', () => {
    const reordered = events.map(
      (e) => Object.fromEntries(Object.entries(e).reverse()) as unknown as SimEvent,
    );
    expect(compareLogs(reordered, events)).toEqual({ ok: true });
  });

  it('ends an aborted session at the logged time', () => {
    const sim = createSim(scenario, world, { mode: 'PRACTICE' });
    for (let i = 0; i < 100; i++) sim.tick();
    sim.end('ABORTED');
    const log = json(sim.getEvents()) as SimEvent[];
    const again = createSim(scenario, world, { mode: 'PRACTICE' });
    replayTo(again, replaySchedule(log), Number.MAX_SAFE_INTEGER);
    expect(again.getState().clock.tMs).toBe(100 * TICK_MS);
    expect(compareLogs(log, json(again.getEvents()) as SimEvent[])).toEqual({ ok: true });
  });
});
