import type { Scenario, SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  CONFIRM_HITS,
  TICK_MS,
  commandFromEvent,
  createContactState,
  createEffectorState,
  createRng,
  createScanHistory,
  createSim,
  interceptPkill,
  radarPd,
  radarScan,
  recordScan,
  resolveIntercept,
  slantRange,
  type ContactState,
  type Heightmap,
  type Sim,
  type SimCommand,
  type TrackState,
} from '../src/index.ts';
import { attackQuad, flatTerrain, hills, testScenario } from './fixtures.ts';

/**
 * A scripted trainee: selects, marks, classifies and calls hostile on each new
 * track, then orders an intercept every time the interceptor is ready and the
 * track is within 1100 m. Decisions read only sim state, so they are deterministic.
 */
function playScripted(scenario: Scenario, terrain: Heightmap): Sim {
  const sim = createSim(scenario, terrain, { mode: 'ASSESSMENT' });
  const handled = new Set<string>();
  while (sim.getState().endReason === null) {
    const s = sim.getState();
    for (const t of s.tracks) {
      if (t.status !== 'ACTIVE') continue;
      if (!handled.has(t.id)) {
        handled.add(t.id);
        sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
        sim.dispatch({ type: 'MARKED_DETECTED', trackId: t.id, payload: {} });
        sim.dispatch({ type: 'CLASSIFIED', trackId: t.id, payload: { class: 'QUAD_SMALL' } });
        sim.dispatch({
          type: 'AFFILIATION_SET',
          trackId: t.id,
          payload: { affiliation: 'HOSTILE' },
        });
      }
      const eff = s.effectors[0];
      if (eff && s.clock.tMs >= eff.readyAtMs && t.rangeM < 1100 && (eff.ammo ?? 1) > 0) {
        sim.dispatch({
          type: 'RESPONSE_ORDERED',
          trackId: t.id,
          payload: { response: 'INTERCEPT' },
        });
      }
    }
    sim.tick();
  }
  return sim;
}

/** Re-run a scenario applying logged trainee events as commands at their ticks. */
function replay(scenario: Scenario, terrain: Heightmap, events: readonly SimEvent[]): Sim {
  const sim = createSim(scenario, terrain, { mode: 'ASSESSMENT' });
  const pending = events.filter((e) => commandFromEvent(e) !== null);
  let i = 0;
  while (sim.getState().endReason === null) {
    const nextT = sim.getState().clock.tMs + TICK_MS;
    while (i < pending.length && pending[i]!.tMs === nextT) {
      const res = sim.dispatch(commandFromEvent(pending[i]!) as SimCommand);
      expect(res).toEqual({ ok: true });
      i++;
    }
    sim.tick();
  }
  return sim;
}

const twoThreats = (): Scenario =>
  testScenario({
    contacts: [attackQuad('c01', [300, 2800], 5000), attackQuad('c02', [-2600, 600], 20_000)],
  });

describe('determinism (SPEC §3.4)', () => {
  it('same scenario + same commands ⇒ identical events and final state', () => {
    const a = playScripted(twoThreats(), hills);
    const b = playScripted(twoThreats(), hills);
    expect(a.getEvents().length).toBeGreaterThan(10);
    expect(b.getEvents()).toEqual(a.getEvents());
    expect(b.getState()).toEqual(a.getState());
  });

  it('replaying the logged trainee events reproduces the session exactly', () => {
    const live = playScripted(twoThreats(), hills);
    const replayed = replay(twoThreats(), hills, live.getEvents());
    expect(replayed.getEvents()).toEqual(live.getEvents());
    expect(replayed.getState()).toEqual(live.getState());
  });

  it('a different seed changes the outcome', () => {
    const a = playScripted(twoThreats(), hills);
    const b = playScripted({ ...twoThreats(), seed: 7 }, hills);
    expect(b.getEvents()).not.toEqual(a.getEvents());
  });
});

describe('radar Pd (SPEC §6.1)', () => {
  it('is 0.5 at the reference range for 0.01 m²', () => {
    expect(radarPd(3000, 0.01, 3000)).toBeCloseTo(0.5, 10);
  });

  it('scales detection range with RCS^¼', () => {
    // 16× the RCS reaches the same Pd at twice the range.
    expect(radarPd(3000, 0.16, 6000)).toBeCloseTo(0.5, 10);
    expect(radarPd(3000, 0.01, 1500)).toBeCloseTo(radarPd(3000, 0.16, 3000), 10);
  });

  it('decreases monotonically with range', () => {
    let prev = 1;
    for (let r = 200; r <= 8000; r += 200) {
      const pd = radarPd(3000, 0.01, r);
      expect(pd).toBeLessThan(prev);
      prev = pd;
    }
    expect(radarPd(3000, 0.01, 1000)).toBeGreaterThan(0.99);
    expect(radarPd(3000, 0.01, 6000)).toBeLessThan(0.01);
  });

  it('detects at the modelled rate and adds bounded noise', () => {
    const scenario = testScenario();
    const spec = scenario.contacts[0]!;
    const contact: ContactState = {
      ...createContactState(spec),
      status: 'ACTIVE',
      pos: { x: 0, y: 46, z: 2700 },
    };
    const radarPos = { x: 0, y: 6, z: 0 };
    const stream = createRng(1).stream('radar:rad1');
    const expected = radarPd(3000, 0.01, slantRange(radarPos, contact.pos));
    let hits = 0;
    const n = 5000;
    for (let i = 0; i < n; i++) {
      const [r] = radarScan(
        scenario.sensors[0] as Extract<Scenario['sensors'][number], { kind: 'RADAR' }>,
        radarPos,
        [contact],
        new Map([[spec.id, spec]]),
        stream,
      );
      if (r!.hit) {
        hits++;
        expect(Math.abs(r!.rangeM! - 2700)).toBeLessThan(80); // 8σ
        expect(Math.min(r!.bearingDeg!, 360 - r!.bearingDeg!)).toBeLessThan(8);
      }
    }
    expect(hits / n).toBeCloseTo(expected, 1);
  });
});

describe('track confirmation (3 of 5) and loss (4 misses)', () => {
  const feed = (seq: string): (string | null)[] => {
    const h = createScanHistory();
    return [...seq].map((ch) => {
      const u = recordScan(h, ch === '1');
      if (u === 'CONFIRMED') h.trackId = 'T001';
      if (u === 'LOST') h.trackId = null;
      return u;
    });
  };

  it('confirms on the third hit within five scans', () => {
    expect(feed('111')).toEqual([null, null, 'CONFIRMED']);
    expect(feed('10101')).toEqual([null, null, null, null, 'CONFIRMED']);
    expect(CONFIRM_HITS).toBe(3);
  });

  it('does not confirm 3 hits spread over more than five scans', () => {
    expect(feed('1001001')).not.toContain('CONFIRMED');
  });

  it('loses a track after four consecutive misses, not three', () => {
    expect(feed('1110001')).not.toContain('LOST');
    expect(feed('1110000')).toEqual([null, null, 'CONFIRMED', null, null, null, 'LOST']);
  });

  it('needs a fresh 3-of-5 after a loss', () => {
    expect(feed('111000011').at(-1)).toBeNull();
    expect(feed('1110000111').at(-1)).toBe('CONFIRMED');
  });

  it('creates tracks T001… in the sim and links them to contacts', () => {
    const sim = playScripted(twoThreats(), flatTerrain);
    const created = sim.getEvents().filter((e) => e.type === 'SENSOR_TRACK_CREATED');
    expect(created.map((e) => e.trackId).slice(0, 2)).toEqual(['T001', 'T002']);
    for (const e of created) expect(['c01', 'c02']).toContain(e.contactId);
  });
});

// ---- Intercept ---------------------------------------------------------------

/** `ammo: undefined` = unlimited. */
function interceptSetup(rangeToTarget: number, ammo: number | undefined = 4) {
  const eff = createEffectorState(
    {
      id: 'int1',
      kind: 'INTERCEPT',
      x: 0,
      z: 0,
      rangeM: 1200,
      cooldownS: 6,
      ...(ammo === undefined ? {} : { ammo }),
    },
    0,
  );
  const contact: ContactState = {
    ...createContactState(attackQuad('c01', [0, 3000])),
    status: 'ACTIVE',
    pos: { x: 0, y: 0, z: rangeToTarget },
  };
  const track = { id: 'T001', contactId: 'c01', affiliation: 'UNKNOWN' } as TrackState;
  return { eff, contact, track, stream: createRng(5).stream('effectors') };
}

describe('intercept rules (SPEC §8)', () => {
  it('Pkill falls from 0.9 close in to 0.4 at max range', () => {
    expect(interceptPkill(0, 1200)).toBeCloseTo(0.9);
    expect(interceptPkill(600, 1200)).toBeCloseTo(0.775);
    expect(interceptPkill(1200, 1200)).toBeCloseTo(0.4);
  });

  it('is out of range beyond rangeM and spends nothing', () => {
    const { eff, contact, track, stream } = interceptSetup(1300);
    expect(resolveIntercept(eff, track, contact, 'WEAPONS_FREE', 1000, stream)).toBe(
      'OUT_OF_RANGE',
    );
    expect(eff.ammo).toBe(4);
    expect(eff.readyAtMs).toBe(0);
  });

  it('spends ammo, starts the cooldown and rolls NEUTRALISED or MISSED', () => {
    const { eff, contact, track, stream } = interceptSetup(500);
    const r = resolveIntercept(eff, track, contact, 'WEAPONS_FREE', 1000, stream);
    expect(['NEUTRALISED', 'MISSED']).toContain(r);
    expect(eff.ammo).toBe(3);
    expect(eff.readyAtMs).toBe(7000);
    expect(contact.status).toBe(r === 'NEUTRALISED' ? 'NEUTRALISED' : 'ACTIVE');
  });

  it('refuses during cooldown and with no ammo', () => {
    const a = interceptSetup(500);
    a.eff.readyAtMs = 5000;
    expect(resolveIntercept(a.eff, a.track, a.contact, 'WEAPONS_FREE', 4950, a.stream)).toBe(
      'COOLDOWN',
    );
    const b = interceptSetup(500, 0);
    expect(resolveIntercept(b.eff, b.track, b.contact, 'WEAPONS_FREE', 0, b.stream)).toBe(
      'NO_AMMO',
    );
  });

  it('under WEAPONS_TIGHT needs a HOSTILE call; WEAPONS_HOLD always blocks', () => {
    const { eff, contact, track, stream } = interceptSetup(500);
    expect(resolveIntercept(eff, track, contact, 'WEAPONS_TIGHT', 0, stream)).toBe(
      'BLOCKED_BY_ROE',
    );
    expect(eff.ammo).toBe(4);
    const hostile = { ...track, affiliation: 'HOSTILE' } as TrackState;
    expect(resolveIntercept(eff, hostile, contact, 'WEAPONS_HOLD', 0, stream)).toBe(
      'BLOCKED_BY_ROE',
    );
    expect(['NEUTRALISED', 'MISSED']).toContain(
      resolveIntercept(eff, hostile, contact, 'WEAPONS_TIGHT', 0, stream),
    );
  });

  it('hits at roughly the modelled Pkill', () => {
    const stream = createRng(9).stream('effectors');
    let kills = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const s = interceptSetup(600, undefined);
      if (resolveIntercept(s.eff, s.track, s.contact, 'WEAPONS_FREE', 0, stream) === 'NEUTRALISED')
        kills++;
    }
    expect(kills / n).toBeCloseTo(interceptPkill(600, 1200), 1);
  });
});

describe('sim session flow', () => {
  it('emits SESSION_STARTED first with mode, scenario and seed', () => {
    const sim = createSim(testScenario(), flatTerrain, { mode: 'ASSESSMENT' });
    expect(sim.getEvents()[0]).toEqual({
      seq: 0,
      tMs: 0,
      type: 'SESSION_STARTED',
      payload: { mode: 'ASSESSMENT', scenarioId: 'T01', seed: 40417 },
    });
  });

  it('an unengaged attack run reaches the asset and ends the session', () => {
    const sim = createSim(testScenario(), flatTerrain);
    while (sim.getState().endReason === null) sim.tick();
    const types = sim.getEvents().map((e) => e.type);
    expect(types).toContain('SENSOR_TRACK_CREATED');
    expect(types).toContain('CONTACT_REACHED_ASSET');
    expect(sim.getState().endReason).toBe('ALL_RESOLVED');
    expect(types.at(-1)).toBe('SESSION_ENDED');
  });

  it('a defended run neutralises the threat with logged outcome events', () => {
    const sim = playScripted(testScenario(), flatTerrain);
    const ev = sim.getEvents();
    const outcomes = ev.filter((e) => e.type === 'RESPONSE_OUTCOME');
    expect(outcomes.length).toBeGreaterThan(0);
    const neutralised = ev.find((e) => e.type === 'CONTACT_NEUTRALISED');
    expect(neutralised).toMatchObject({ contactId: 'c01', payload: { by: 'INTERCEPT' } });
    expect(ev.some((e) => e.type === 'CONTACT_REACHED_ASSET')).toBe(false);
  });

  it('commands are applied on the next tick at a tick boundary', () => {
    const sim = createSim(testScenario(), flatTerrain);
    while (sim.getState().tracks.length === 0) sim.tick();
    const t0 = sim.getState().clock.tMs;
    sim.dispatch({ type: 'MARKED_DETECTED', trackId: 'T001', payload: {} });
    expect(sim.getState().tracks[0]!.markedDetected).toBe(false);
    sim.tick();
    expect(sim.getState().tracks[0]!.markedDetected).toBe(true);
    expect(sim.getEvents().find((e) => e.type === 'MARKED_DETECTED')!.tMs).toBe(t0 + TICK_MS);
  });

  it('rejects unknown tracks, EW responses and commands after the end', () => {
    const sim = createSim(testScenario(), flatTerrain);
    expect(sim.dispatch({ type: 'MARKED_DETECTED', trackId: 'T999', payload: {} }).ok).toBe(false);
    while (sim.getState().tracks.length === 0) sim.tick();
    expect(
      sim.dispatch({ type: 'RESPONSE_ORDERED', trackId: 'T001', payload: { response: 'EW_JAM' } })
        .ok,
    ).toBe(false);
    sim.end('ABORTED');
    expect(sim.getEvents().at(-1)).toMatchObject({
      type: 'SESSION_ENDED',
      payload: { reason: 'ABORTED' },
    });
    expect(sim.dispatch({ type: 'MARKED_DETECTED', trackId: 'T001', payload: {} }).ok).toBe(false);
    const n = sim.getEvents().length;
    sim.tick();
    expect(sim.getEvents().length).toBe(n);
  });

  it('ends with TIME_UP when threats are still unresolved', () => {
    const sim = createSim(testScenario({ durationS: 30 }), flatTerrain);
    while (sim.getState().endReason === null) sim.tick();
    expect(sim.getState().endReason).toBe('TIME_UP');
    expect(sim.getState().clock.tMs).toBe(30_000);
  });

  it('runs a 180 s session tick well within the 2 ms budget', () => {
    const sim = createSim(twoThreats(), hills);
    const start = process.hrtime.bigint();
    let ticks = 0;
    while (sim.getState().endReason === null) {
      sim.tick();
      ticks++;
    }
    const msPerTick = Number(process.hrtime.bigint() - start) / 1e6 / ticks;
    expect(msPerTick).toBeLessThan(2);
  });
});
