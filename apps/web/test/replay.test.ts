import { readFileSync } from 'node:fs';
import { Scenario, type Penalty, type Score, type SimEvent } from '@vyuh/shared';
import {
  TICK_MS,
  createDefender,
  createProceduralTerrain,
  createSim,
  type SimSnapshot,
} from '@vyuh/sim-core';
import { describe, expect, it } from 'vitest';
import { KEYFRAME_MS, ReplayController } from '../lib/replay/controller';
import {
  REPLAY_FALLBACK_TEXT,
  penaltyMoment,
  replayGate,
  timelineMarkers,
} from '../lib/replay/gate';
import { computeKeyframes } from '../lib/replay/keyframes';

const S01 = Scenario.parse(
  JSON.parse(
    readFileSync(new URL('../../api/app/seed/scenarios/S01.json', import.meta.url), 'utf8'),
  ),
);
const terrain = createProceduralTerrain();

/** The ground-truth defender plus a manual camera slew now and then. */
function play(): SimEvent[] {
  const sim = createSim(S01, terrain, { mode: 'ASSESSMENT' });
  const defender = createDefender(S01);
  let n = 0;
  while (sim.getState().endReason === null) {
    for (const cmd of defender.step(sim.getState())) sim.dispatch(cmd);
    if (++n % 150 === 0) {
      sim.dispatch({ type: 'CAMERA_SLEWED', payload: { azDeg: n % 360, elDeg: 2, zoom: 1 } });
    }
    sim.tick();
  }
  return JSON.parse(JSON.stringify(sim.getEvents())) as SimEvent[];
}

const events = play();
const end = events.at(-1)!.tMs;

/** Snapshot of a straight run at each requested time. */
function straight(times: number[]): Map<number, SimSnapshot> {
  const c = new ReplayController(S01, terrain, events, 'ASSESSMENT');
  const out = new Map<number, SimSnapshot>();
  for (const t of [...times].sort((a, b) => a - b)) {
    c.seek(t); // forward only, never more than one keyframe away: a straight run
    out.set(t, c.runtime.sim.snapshot());
  }
  return out;
}

describe('keyframes (worker)', () => {
  it('keeps one every 10 s and verifies the log', () => {
    const { keyframes, check } = computeKeyframes(S01, terrain, events, 'ASSESSMENT');
    expect(check).toEqual({ ok: true });
    expect(keyframes.map((k) => k.tMs)).toEqual(
      Array.from({ length: Math.floor(end / KEYFRAME_MS) + 1 }, (_, i) => i * KEYFRAME_MS),
    );
  });

  it('reports a log the sim does not reproduce', () => {
    const tampered = events.map((e) =>
      e.type === 'SENSOR_TRACK_CREATED' ? { ...e, payload: { ...e.payload, bearingDeg: 1 } } : e,
    );
    expect(computeKeyframes(S01, terrain, tampered, 'ASSESSMENT').check.ok).toBe(false);
  });
});

describe('ReplayController', () => {
  const { keyframes } = computeKeyframes(S01, terrain, events, 'ASSESSMENT');
  const targets = [61_050, 3_000, end, 25_000, 24_950, 0, 47_500, 90_000, 12_345];
  const truth = straight(targets.map((t) => Math.min(end, Math.floor(t / TICK_MS) * TICK_MS)));

  it('lands on exactly the straight run state for any seek order', () => {
    const c = new ReplayController(S01, terrain, events, 'ASSESSMENT', keyframes);
    for (const t of targets) {
      c.seek(t);
      const snapped = Math.min(end, Math.floor(t / TICK_MS) * TICK_MS);
      expect(c.tMs).toBe(snapped);
      expect(c.runtime.sim.snapshot(), `seek ${t}`).toEqual(truth.get(snapped));
    }
  });

  it('steps one tick each way and plays at the chosen speed', () => {
    const c = new ReplayController(S01, terrain, events, 'ASSESSMENT', keyframes);
    c.seek(20_000);
    c.step(1);
    expect(c.tMs).toBe(20_050);
    c.step(-1);
    c.step(-1);
    expect(c.tMs).toBe(19_950);
    c.speed = 4;
    c.play();
    c.advance(50); // 50 ms of wall time at 4× = 4 ticks
    expect(c.tMs).toBe(20_150);
    c.playing = false;
    expect(c.advance(50)).toBe(0);
  });

  it('stops at the end, and play from the end restarts', () => {
    const c = new ReplayController(S01, terrain, events, 'ASSESSMENT', keyframes);
    c.seek(end - TICK_MS);
    c.play();
    for (let i = 0; i < 10; i++) c.advance(100);
    expect(c.tMs).toBe(end);
    expect(c.playing).toBe(false);
    c.play();
    expect(c.tMs).toBe(0);
  });

  it('replays an operator abort at the logged time', () => {
    const sim = createSim(S01, terrain, { mode: 'PRACTICE' });
    for (let i = 0; i < 200; i++) sim.tick();
    sim.end('ABORTED');
    const log = JSON.parse(JSON.stringify(sim.getEvents())) as SimEvent[];
    const c = new ReplayController(S01, terrain, log, 'PRACTICE');
    c.play();
    for (let i = 0; i < 60; i++) c.advance(250);
    expect(c.tMs).toBe(200 * TICK_MS);
    expect(c.runtime.sim.getState().endReason).toBe('ABORTED');
  });
});

describe('replay gate', () => {
  it('needs the same sim version and terrain revision', () => {
    expect(replayGate({ simVersion: 5, terrainRevision: 2 }, 5, 2)).toEqual({ ok: true });
    expect(replayGate({ simVersion: 5, terrainRevision: null }, 5, 2)).toEqual({ ok: true });
    expect(replayGate({ simVersion: 4, terrainRevision: 2 }, 5, 2).ok).toBe(false);
    expect(replayGate({ simVersion: null, terrainRevision: null }, 5, 1).ok).toBe(false);
    expect(replayGate({ simVersion: 5, terrainRevision: 1 }, 5, 2).ok).toBe(false);
    expect(REPLAY_FALLBACK_TEXT).toBe(
      'This session used an older simulator version — showing the event timeline only, not a replay.',
    );
  });
});

describe('timeline markers', () => {
  const killChain = [
    {
      contactId: 'c01',
      isThreat: true,
      trueClass: 'QUAD_SMALL' as const,
      trueAffiliation: 'HOSTILE' as const,
      trackIds: ['T001'],
      stages: (['DETECT', 'TRACK', 'IDENTIFY', 'DECIDE', 'RESPOND', 'ASSESS'] as const).map(
        (stage) => ({
          stage,
          status: 'OK' as const,
          feedback: '',
          jumpTMs: stage === 'RESPOND' ? 42_000 : 1000,
        }),
      ),
    },
  ];
  const penalty = (p: Partial<Penalty>): Penalty => ({
    code: 'WRONGLY_ENGAGED',
    points: -25,
    feedback: 'Engaged a non-threat.',
    ...p,
  });

  it('places a penalty at its own time, else at the contact response', () => {
    expect(penaltyMoment(penalty({ tMs: 5000, contactId: 'c01' }), killChain)).toBe(5000);
    expect(penaltyMoment(penalty({ contactId: 'c01' }), killChain)).toBe(42_000);
    expect(penaltyMoment(penalty({ contactId: 'c09' }), killChain)).toBeNull();
  });

  it('marks trainee actions, outcomes and penalties in time order', () => {
    const score = { penalties: [penalty({ contactId: 'c01' })] } as unknown as Score;
    const markers = timelineMarkers(events, score, killChain);
    expect(markers.map((m) => m.tMs)).toEqual([...markers.map((m) => m.tMs)].sort((a, b) => a - b));
    const kinds = new Set(markers.map((m) => m.kind));
    for (const k of ['DETECT', 'CLASSIFY', 'RESPOND', 'GOOD', 'PENALTY'])
      expect(kinds).toContain(k);
    expect(markers.find((m) => m.kind === 'PENALTY')?.tMs).toBe(42_000);
  });
});
