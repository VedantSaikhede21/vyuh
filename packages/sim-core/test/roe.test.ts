import type { Point2, Roe, Scenario } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  createDefender,
  createSim,
  inNoKinetic,
  noKineticPolygons,
  noKineticZoneAt,
  pointInPolygon,
  roeAllowsIntercept,
  type Sim,
  type TrackState,
} from '../src/index.ts';
import { attackQuad, flatTerrain, testScenario } from './fixtures.ts';

// ROE semantics (SPEC §8, SIM_VERSION 3): FREE / TIGHT (threat class + HOSTILE)
// / HOLD, and NO_KINETIC zones judged on the track estimate (decision 69).

const square: Point2[] = [
  [-100, 900],
  [100, 900],
  [100, 1100],
  [-100, 1100],
];

describe('pointInPolygon', () => {
  it('inside, outside and on the edge', () => {
    expect(pointInPolygon(0, 1000, square)).toBe(true);
    expect(pointInPolygon(0, 1200, square)).toBe(false);
    expect(pointInPolygon(150, 1000, square)).toBe(false);
    expect(pointInPolygon(100, 1000, square)).toBe(true); // edge counts as inside
    expect(pointInPolygon(-100, 900, square)).toBe(true); // vertex
    expect(pointInPolygon(100.01, 1000, square)).toBe(false);
  });

  it('handles a concave polygon', () => {
    const l: Point2[] = [
      [0, 0],
      [200, 0],
      [200, 100],
      [100, 100],
      [100, 200],
      [0, 200],
    ];
    expect(pointInPolygon(50, 150, l)).toBe(true);
    expect(pointInPolygon(150, 150, l)).toBe(false);
  });

  it('names the zone a point is in', () => {
    const zones = [
      { id: 'Z1', kind: 'PROTECTED_ASSET' as const, polygon: square },
      { id: 'Z2', kind: 'NO_KINETIC' as const, name: 'village', polygon: square },
    ];
    expect(noKineticZoneAt(zones, 0, 1000)?.id).toBe('Z2');
    expect(noKineticZoneAt(zones, 0, 0)).toBeUndefined();
  });

  it('collects only NO_KINETIC zones', () => {
    const polys = noKineticPolygons([
      { id: 'z1', kind: 'NO_KINETIC', polygon: square },
      { id: 'z2', kind: 'PROTECTED_ASSET', polygon: square },
      {
        id: 'b1',
        kind: 'BORDER_LINE',
        polyline: [
          [0, 0],
          [1, 1],
        ],
      },
    ]);
    expect(polys).toEqual([square]);
    expect(inNoKinetic(polys, 0, 1000)).toBe(true);
    expect(inNoKinetic([], 0, 1000)).toBe(false);
  });
});

describe('roeAllowsIntercept matrix', () => {
  const track = (
    affiliation: TrackState['affiliation'],
    classifiedAs: TrackState['classifiedAs'],
  ) => ({ affiliation, classifiedAs }) as TrackState;
  const cases: [Roe, TrackState['affiliation'], TrackState['classifiedAs'], boolean][] = [
    ['WEAPONS_FREE', 'UNKNOWN', null, true],
    ['WEAPONS_FREE', 'FRIENDLY', 'FRIENDLY_QUAD', true],
    ['WEAPONS_TIGHT', 'HOSTILE', 'QUAD_SMALL', true],
    ['WEAPONS_TIGHT', 'HOSTILE', 'LOITERING_GENERIC', true],
    ['WEAPONS_TIGHT', 'HOSTILE', null, false],
    ['WEAPONS_TIGHT', 'HOSTILE', 'CIVILIAN_HOBBY', false],
    ['WEAPONS_TIGHT', 'UNKNOWN', 'FPV', false],
    ['WEAPONS_HOLD', 'HOSTILE', 'QUAD_SMALL', false],
  ];
  it.each(cases)('%s, %s, %s → %s', (roe, aff, cls, allowed) => {
    expect(roeAllowsIntercept(roe, track(aff, cls))).toBe(allowed);
  });
});

/** A quad holding 15 s inside a NO_KINETIC square 1 km north, then diving on the asset. */
function zoned(roe: Roe = 'WEAPONS_FREE'): Scenario {
  const quad = attackQuad('c01', [0, 2500]);
  return testScenario({
    roe,
    zones: [{ id: 'nk1', kind: 'NO_KINETIC', polygon: square }],
    contacts: [
      {
        ...quad,
        path: [
          { x: 0, y: 40, z: 2500, speedMps: 16 },
          { x: 0, y: 40, z: 1000, speedMps: 16, holdS: 15 },
          { x: 0, y: 0, z: 0, speedMps: 16, action: 'DIVE' },
        ],
      },
    ],
    effectors: [{ id: 'int1', kind: 'INTERCEPT', x: 0, z: 0, rangeM: 1200, cooldownS: 6, ammo: 4 }],
  });
}

/** Tick until the contact hovers inside the zone with a confirmed track. */
function hoveringInZone(sim: Sim): TrackState {
  for (let i = 0; i < 6000; i++) {
    const st = sim.getState();
    const c = st.contacts[0]!;
    const t = st.tracks.find((x) => x.status === 'ACTIVE');
    if (t && c.holdUntilMs !== null && pointInPolygon(t.pos.x, t.pos.z, square)) return t;
    sim.tick();
  }
  throw new Error('never hovered in the zone with a track');
}

const outcomes = (sim: Sim) =>
  sim.getEvents().flatMap((e) => (e.type === 'RESPONSE_OUTCOME' ? [e.payload.result] : []));

describe('NO_KINETIC gate in the sim', () => {
  it('blocks an intercept on a track inside the zone and spends nothing', () => {
    const sim = createSim(zoned(), flatTerrain);
    const t = hoveringInZone(sim);
    sim.dispatch({ type: 'RESPONSE_ORDERED', trackId: t.id, payload: { response: 'INTERCEPT' } });
    sim.tick();
    expect(outcomes(sim)).toEqual(['BLOCKED_NO_KINETIC']);
    const eff = sim.getState().effectors[0]!;
    expect(eff.ammo).toBe(4);
    expect(eff.readyAtMs).toBe(0);
  });

  it('ROE is checked first: WEAPONS_HOLD inside the zone is BLOCKED_BY_ROE', () => {
    const sim = createSim(zoned('WEAPONS_HOLD'), flatTerrain);
    const t = hoveringInZone(sim);
    sim.dispatch({ type: 'RESPONSE_ORDERED', trackId: t.id, payload: { response: 'INTERCEPT' } });
    sim.tick();
    expect(outcomes(sim)).toEqual(['BLOCKED_BY_ROE']);
  });

  it('allows the intercept once the track leaves the zone', () => {
    const sim = createSim(zoned(), flatTerrain);
    hoveringInZone(sim);
    for (let i = 0; i < 4000; i++) {
      const t = sim.getState().tracks.find((x) => x.status === 'ACTIVE');
      if (t && t.pos.z < 850) {
        sim.dispatch({
          type: 'RESPONSE_ORDERED',
          trackId: t.id,
          payload: { response: 'INTERCEPT' },
        });
        sim.tick();
        break;
      }
      sim.tick();
    }
    expect(['NEUTRALISED', 'MISSED']).toContain(outcomes(sim)[0]);
  });
});

describe('ground-truth defender under the new gates', () => {
  function defend(scenario: Scenario): Sim {
    const sim = createSim(scenario, flatTerrain);
    const defender = createDefender(scenario);
    while (sim.getState().endReason === null) {
      for (const cmd of defender.step(sim.getState())) sim.dispatch(cmd);
      sim.tick();
    }
    return sim;
  }

  it('never orders a blocked intercept, and jams a threat it may not shoot', () => {
    const scenario = zoned();
    scenario.effectors.push({
      id: 'jam1',
      kind: 'EW_JAM',
      x: 0,
      z: 0,
      rangeM: 2000,
      cooldownS: 10,
    });
    const sim = defend(scenario);
    const results = outcomes(sim);
    expect(results).not.toContain('BLOCKED_NO_KINETIC');
    expect(results).not.toContain('BLOCKED_BY_ROE');
    const orders = sim
      .getEvents()
      .flatMap((e) => (e.type === 'RESPONSE_ORDERED' ? [e.payload.response] : []));
    expect(orders[0]).toBe('EW_JAM');
    expect(sim.getEvents().some((e) => e.type === 'CONTACT_REACHED_ASSET')).toBe(false);
  });

  it('passes WEAPONS_TIGHT (true class + HOSTILE) and defends', () => {
    const sim = defend(testScenario({ roe: 'WEAPONS_TIGHT' }));
    expect(outcomes(sim)).not.toContain('BLOCKED_BY_ROE');
    expect(sim.getEvents().some((e) => e.type === 'CONTACT_NEUTRALISED')).toBe(true);
  });

  it('under WEAPONS_HOLD with no EW it holds fire', () => {
    const sim = defend(testScenario({ roe: 'WEAPONS_HOLD' }));
    expect(sim.getEvents().some((e) => e.type === 'RESPONSE_ORDERED')).toBe(false);
  });
});
