import type { Behaviour, ContactSpec, ControlLink, Scenario, SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  EW_SECTOR_HALF_DEG,
  createContactState,
  createEffectorState,
  createSim,
  jamReaction,
  resolveEw,
  resolveIntercept,
  type ContactState,
  type EffectorState,
  type RandomStream,
  type Sim,
  type TrackState,
} from '../src/index.ts';
import { attackQuad, flatTerrain, testScenario } from './fixtures.ts';

// EW_JAM / EW_SPOOF (SPEC §8, decision 54).

/** A stream that always returns `v`: 0 = every roll succeeds, 0.99 = every roll fails. */
const fixed = (v: number) => ({ name: 'fixed', next: () => v }) as unknown as RandomStream;

function contact(
  id: string,
  link: ControlLink,
  bearingDeg: number,
  rangeM = 1000,
  extra: Partial<ContactSpec> = {},
): [ContactSpec, ContactState] {
  const r = (bearingDeg * Math.PI) / 180;
  const pos = { x: rangeM * Math.sin(r), y: 40, z: rangeM * Math.cos(r) };
  const spec: ContactSpec = {
    ...attackQuad(id, [pos.x, pos.z]),
    controlLink: link,
    emissions: { rfActive: link === 'RF_MANUAL' },
    ...extra,
  };
  return [spec, { ...createContactState(spec), status: 'ACTIVE', pos, agl: 40, speedMps: 16 }];
}

const trackOn = (c: ContactState) =>
  ({ id: 'T001', contactId: c.id, pos: { ...c.pos } }) as unknown as TrackState;

function setup(kind: 'EW_JAM' | 'EW_SPOOF', list: [ContactSpec, ContactState][], ammo?: number) {
  const eff: EffectorState = createEffectorState(
    { id: 'e1', kind, x: 0, z: 0, rangeM: 1500, cooldownS: 10, ...(ammo ? { ammo } : {}) },
    0,
  );
  const specs = new Map(list.map(([s]) => [s.id, s]));
  const states = list.map(([, c]) => c).sort((a, b) => (a.id < b.id ? -1 : 1));
  return { eff, specs, states };
}

describe('EW_JAM', () => {
  it('defeats an RF_MANUAL contact (attack run → hover and land)', () => {
    const [s, c] = contact('c01', 'RF_MANUAL', 20);
    const { eff, specs, states } = setup('EW_JAM', [[s, c]]);
    const out = resolveEw(eff, trackOn(c), states, specs, 1000, fixed(0));
    expect(out).toEqual({ result: 'NEUTRALISED', affected: ['c01'] });
    expect([c.defeated, c.control, c.status]).toEqual([true, 'HOVER_LAND', 'ACTIVE']);
    expect(eff.readyAtMs).toBe(11_000);
  });

  it.each(['AUTONOMOUS_GNSS', 'FIBRE_OPTIC'] as const)(
    'has no effect on %s, but the cooldown is consumed',
    (link) => {
      const [s, c] = contact('c01', link, 20);
      const { eff, specs, states } = setup('EW_JAM', [[s, c]]);
      expect(resolveEw(eff, trackOn(c), states, specs, 1000, fixed(0))).toEqual({
        result: 'NO_EFFECT',
        affected: [],
      });
      expect([c.defeated, eff.readyAtMs]).toEqual([false, 11_000]);
    },
  );

  it('MISSED when the roll fails', () => {
    const [s, c] = contact('c01', 'RF_MANUAL', 20);
    const { eff, specs, states } = setup('EW_JAM', [[s, c]]);
    expect(resolveEw(eff, trackOn(c), states, specs, 0, fixed(0.95)).result).toBe('MISSED');
    expect(c.defeated).toBe(false);
  });

  it('OUT_OF_RANGE spends nothing', () => {
    const [s, c] = contact('c01', 'RF_MANUAL', 20, 1600);
    const { eff, specs, states } = setup('EW_JAM', [[s, c]], 2);
    expect(resolveEw(eff, trackOn(c), states, specs, 0, fixed(0)).result).toBe('OUT_OF_RANGE');
    expect([eff.ammo, eff.readyAtMs]).toEqual([2, 0]);
  });

  it('respects cooldown and ammo', () => {
    const [s, c] = contact('c01', 'RF_MANUAL', 20);
    const [s2, c2] = contact('c02', 'RF_MANUAL', 200);
    const { eff, specs, states } = setup(
      'EW_JAM',
      [
        [s, c],
        [s2, c2],
      ],
      1,
    );
    expect(resolveEw(eff, trackOn(c), states, specs, 0, fixed(0.95)).result).toBe('MISSED');
    expect(resolveEw(eff, trackOn(c2), states, specs, 5000, fixed(0)).result).toBe('COOLDOWN');
    expect(resolveEw(eff, trackOn(c2), states, specs, 20_000, fixed(0)).result).toBe('NO_AMMO');
  });

  it('affects every RF_MANUAL contact inside ±10°, friendly and civilian included', () => {
    const list: [ContactSpec, ContactState][] = [
      contact('c01', 'RF_MANUAL', 20),
      contact('c02', 'RF_MANUAL', 20 + EW_SECTOR_HALF_DEG - 0.1, 900, {
        class: 'FRIENDLY_QUAD',
        isThreat: false,
        affiliation: 'FRIENDLY',
        behaviour: 'FRIENDLY_PATROL',
      }),
      contact('c03', 'RF_MANUAL', 20 - EW_SECTOR_HALF_DEG + 0.1, 1200, {
        class: 'CIVILIAN_HOBBY',
        isThreat: false,
        affiliation: 'NEUTRAL',
        behaviour: 'TRANSIT',
      }),
      contact('c04', 'RF_MANUAL', 20 + EW_SECTOR_HALF_DEG + 0.1), // just outside
      contact('c05', 'AUTONOMOUS_GNSS', 21), // not jammable
    ];
    const { eff, specs, states } = setup('EW_JAM', list);
    const target = states[0]!;
    const out = resolveEw(eff, trackOn(target), states, specs, 0, fixed(0));
    expect(out).toEqual({ result: 'NEUTRALISED', affected: ['c01', 'c02', 'c03'] });
    expect(states.map((c) => c.control)).toEqual(['HOVER_LAND', 'RTH', 'RTH', 'PATH', 'PATH']);
  });

  it('reacts by behaviour: attack and swarm hover-land, everything else returns home', () => {
    const rth: Behaviour[] = [
      'RECON_LOITER',
      'SMUGGLING_DROP',
      'TRANSIT',
      'DECOY',
      'FRIENDLY_PATROL',
    ];
    expect(jamReaction('ATTACK_RUN')).toBe('HOVER_LAND');
    expect(jamReaction('SWARM_SATURATION')).toBe('HOVER_LAND');
    for (const b of rth) expect(jamReaction(b)).toBe('RTH');
  });
});

describe('EW_SPOOF', () => {
  it('makes an AUTONOMOUS_GNSS contact drift', () => {
    const [s, c] = contact('c01', 'AUTONOMOUS_GNSS', 20);
    const { eff, specs, states } = setup('EW_SPOOF', [[s, c]]);
    expect(resolveEw(eff, trackOn(c), states, specs, 0, fixed(0)).result).toBe('NEUTRALISED');
    expect([c.defeated, c.control, c.drift !== null]).toEqual([true, 'DRIFT', true]);
  });

  it.each(['RF_MANUAL', 'FIBRE_OPTIC'] as const)('has no effect on %s', (link) => {
    const [s, c] = contact('c01', link, 20);
    const { eff, specs, states } = setup('EW_SPOOF', [[s, c]]);
    expect(resolveEw(eff, trackOn(c), states, specs, 0, fixed(0)).result).toBe('NO_EFFECT');
    expect(c.defeated).toBe(false);
  });
});

describe('intercept on a contact already defeated by EW', () => {
  it('is NO_EFFECT and uses no round', () => {
    const [, c] = contact('c01', 'RF_MANUAL', 20);
    c.defeated = true;
    const eff = createEffectorState(
      { id: 'i1', kind: 'INTERCEPT', x: 0, z: 0, rangeM: 1200, cooldownS: 6, ammo: 3 },
      0,
    );
    expect(resolveIntercept(eff, trackOn(c), c, 'WEAPONS_FREE', 0, fixed(0))).toBe('NO_EFFECT');
    expect([eff.ammo, eff.readyAtMs]).toEqual([3, 0]);
  });
});

describe('EW in the sim', () => {
  /** A hostile quad and a friendly patrol on nearly the same bearing; jammer at the asset. */
  const scenario = (roe: Scenario['roe'] = 'WEAPONS_HOLD'): Scenario =>
    testScenario({
      roe,
      effectors: [
        { id: 'jam1', kind: 'EW_JAM', x: 0, z: 0, rangeM: 1500, cooldownS: 10 },
        { id: 'int1', kind: 'INTERCEPT', x: 0, z: 0, rangeM: 1200, cooldownS: 6, ammo: 4 },
      ],
      contacts: [
        attackQuad('c01', [300, 2500], 0),
        {
          ...attackQuad('c02', [330, 1300], 0),
          class: 'FRIENDLY_QUAD',
          isThreat: false,
          affiliation: 'FRIENDLY',
          behaviour: 'FRIENDLY_PATROL',
          path: [
            { x: 330, y: 50, z: 1300, speedMps: 3 },
            { x: 200, y: 50, z: 1250, speedMps: 3 },
          ],
        },
        // A late second threat keeps the session running after c01 is defeated.
        {
          ...attackQuad('c03', [-2500, 2500], 120_000),
          controlLink: 'FIBRE_OPTIC',
          emissions: { rfActive: false },
        },
      ],
    });

  function jamWhenClose(sc: Scenario): Sim {
    const sim = createSim(sc, flatTerrain);
    let ordered = false;
    while (sim.getState().endReason === null && sim.getState().clock.tMs < 170_000) {
      const t = sim.getState().tracks.find((x) => x.contactId === 'c01' && x.status === 'ACTIVE');
      if (!ordered && t && t.rangeM < 1400) {
        ordered = true;
        expect(
          sim.dispatch({
            type: 'RESPONSE_ORDERED',
            trackId: t.id,
            payload: { response: 'EW_JAM' },
          }).ok,
        ).toBe(true);
      }
      sim.tick();
    }
    expect(ordered).toBe(true);
    return sim;
  }

  it('is not ROE-gated, reports collateral and neutralises every affected contact', () => {
    const ev = jamWhenClose(scenario('WEAPONS_HOLD')).getEvents();
    const outcome = ev.find((e) => e.type === 'RESPONSE_OUTCOME')!;
    expect(outcome).toMatchObject({
      contactId: 'c01',
      payload: { response: 'EW_JAM', result: 'NEUTRALISED', collateral: { contactIds: ['c02'] } },
    });
    const neutralised = ev.filter((e) => e.type === 'CONTACT_NEUTRALISED');
    expect(neutralised.map((e) => [e.contactId, e.payload])).toEqual([
      ['c01', { by: 'EW_JAM' }],
      ['c02', { by: 'EW_JAM' }],
    ]);
  });

  it('a defeated contact keeps flying, never reaches the asset and lands', () => {
    const sim = jamWhenClose(scenario());
    const ev: readonly SimEvent[] = sim.getEvents();
    const c01 = (e: SimEvent) => 'contactId' in e && e.contactId === 'c01';
    expect(ev.filter(c01).map((e) => e.type)).toContain('CONTACT_DESPAWNED');
    expect(ev.some((e) => e.type === 'CONTACT_REACHED_ASSET' && c01(e))).toBe(false);
  });

  it('is deterministic', () => {
    const a = JSON.stringify(jamWhenClose(scenario()).getEvents());
    const b = JSON.stringify(jamWhenClose(scenario()).getEvents());
    expect(a).toBe(b);
  });
});
