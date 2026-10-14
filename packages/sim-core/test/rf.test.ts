import type { ContactSpec, RfSensor, Scenario } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  RF_STROBE_TTL_MS,
  angleDiffDeg,
  bearingDeg,
  createContactState,
  createRng,
  createSim,
  rfBadgeFor,
  rfScan,
  type ContactState,
  type RfStrobe,
} from '../src/index.ts';
import { attackQuad, flatTerrain, testScenario } from './fixtures.ts';

// RF detector (SPEC §6.3, decision 53).

const RF: RfSensor = { id: 'rf1', kind: 'RF', x: 0, y: 4, z: 0, rangeM: 4000, bearingErrDeg: 7 };
const rfPos = { x: 0, y: 4, z: 0 };

function contactWith(spec: ContactSpec, pos = { x: 0, y: 50, z: 2000 }): ContactState {
  return { ...createContactState(spec), status: 'ACTIVE', pos };
}

const quad = attackQuad('c01', [0, 2000]);
const silent = (link: ContactSpec['controlLink']): ContactSpec => ({
  ...quad,
  controlLink: link,
  emissions: { rfActive: false },
});

describe('rfScan', () => {
  it.each(['AUTONOMOUS_GNSS', 'FIBRE_OPTIC', 'NONE', 'RF_MANUAL'] as const)(
    'is silent for a non-emitting %s contact',
    (link) => {
      const spec = silent(link);
      const stream = createRng(1).stream('rf:rf1');
      const out = rfScan(RF, rfPos, [contactWith(spec)], new Map([[spec.id, spec]]), stream);
      expect(out).toEqual([]);
    },
  );

  it('hears RF_MANUAL in range and in LOS only, with band and friendly ID', () => {
    const spec: ContactSpec = {
      ...quad,
      emissions: { rfActive: true, rfBand: '5.8GHz', friendlyIdCode: 'BLUE7' },
    };
    const specs = new Map([[spec.id, spec]]);
    const s = createRng(1).stream('rf:rf1');
    const [d] = rfScan(RF, rfPos, [contactWith(spec)], specs, s);
    expect(d).toMatchObject({ contactId: 'c01', band: '5.8GHz', friendlyIdCode: 'BLUE7' });
    expect(rfScan(RF, rfPos, [contactWith(spec, { x: 0, y: 50, z: 4100 })], specs, s)).toEqual([]);
    expect(rfScan(RF, rfPos, [contactWith(spec)], specs, s, () => false)).toEqual([]);
  });

  it('bearing error is bounded and about bearingErrDeg / 2 (1σ)', () => {
    const specs = new Map([[quad.id, quad]]);
    const pos = { x: 1200, y: 50, z: 1600 };
    const truth = bearingDeg(rfPos, pos);
    const s = createRng(5).stream('rf:rf1');
    const errs: number[] = [];
    for (let i = 0; i < 4000; i++) {
      const [d] = rfScan(RF, rfPos, [contactWith(quad, pos)], specs, s);
      errs.push(angleDiffDeg(d!.bearingDeg, truth));
    }
    expect(Math.max(...errs.map(Math.abs))).toBeLessThan(2.5 * RF.bearingErrDeg); // 5σ
    const sd = Math.sqrt(errs.reduce((a, e) => a + e * e, 0) / errs.length);
    expect(sd).toBeGreaterThan(0.45 * RF.bearingErrDeg);
    expect(sd).toBeLessThan(0.55 * RF.bearingErrDeg);
  });

  it('draws two numbers per active contact whether heard or not', () => {
    const quiet = silent('FIBRE_OPTIC');
    const a = createRng(9).stream('rf:rf1');
    const b = createRng(9).stream('rf:rf1');
    rfScan(RF, rfPos, [contactWith(quiet)], new Map([[quiet.id, quiet]]), a);
    rfScan(RF, rfPos, [contactWith(quad)], new Map([[quad.id, quad]]), b);
    expect(a.next()).toBe(b.next());
  });
});

describe('RF badge on radar tracks', () => {
  const sensors = new Map([['rf1', { cfg: RF, pos: rfPos }]]);
  const strobe = (id: string, brg: number, code: string | null = null): RfStrobe => ({
    id,
    contactId: 'x',
    sensorId: 'rf1',
    bearingDeg: brg,
    band: '2.4GHz',
    friendlyIdCode: code,
    firstTMs: 0,
    lastTMs: 0,
  });
  const at = (brg: number) => {
    const r = (brg * Math.PI) / 180;
    return { x: 2000 * Math.sin(r), y: 50, z: 2000 * Math.cos(r) };
  };

  it('takes the nearest strobe within bearingErrDeg, else null', () => {
    expect(rfBadgeFor(at(10), [strobe('E01', 16.9)], sensors)?.strobeId).toBe('E01');
    expect(rfBadgeFor(at(10), [strobe('E01', 17.1)], sensors)).toBeNull();
    const two = [strobe('E01', 14, 'BLUE1'), strobe('E02', 9)];
    expect(rfBadgeFor(at(10), two, sensors)).toEqual({
      strobeId: 'E02',
      band: '2.4GHz',
      friendlyIdCode: null,
    });
    expect(rfBadgeFor(at(359), [strobe('E01', 3)], sensors)?.strobeId).toBe('E01'); // wraps
  });
});

describe('RF in the sim', () => {
  const withRf = (contacts: ContactSpec[]): Scenario => {
    const base = testScenario();
    return testScenario({ sensors: [...base.sensors, RF], contacts });
  };

  it.each([['AUTONOMOUS_GNSS'], ['FIBRE_OPTIC']] as const)(
    'a %s attack run never produces a strobe',
    (link) => {
      const sim = createSim(withRf([silent(link)]), flatTerrain);
      while (sim.getState().endReason === null) {
        sim.tick();
        expect(sim.getState().rfStrobes).toEqual([]);
      }
    },
  );

  it('strobes get ids E01…, badge the radar track and expire 3 s after the last detection', () => {
    // A civilian (non-threat), so the session keeps running after it despawns.
    const spec: ContactSpec = {
      ...attackQuad('c01', [300, 2500], 5000),
      class: 'CIVILIAN_HOBBY',
      isThreat: false,
      affiliation: 'NEUTRAL',
      behaviour: 'TRANSIT',
      despawnTMs: 40_000,
    };
    const sim = createSim(withRf([spec]), flatTerrain);
    let badged = false;
    let lastSeen = -1;
    while (sim.getState().endReason === null && sim.getState().clock.tMs < 50_000) {
      sim.tick();
      const { rfStrobes, tracks, clock } = sim.getState();
      if (rfStrobes.length > 0) {
        expect(rfStrobes.map((s) => s.id)).toEqual(['E01']);
        lastSeen = rfStrobes[0]!.lastTMs;
        expect(clock.tMs - lastSeen).toBeLessThan(RF_STROBE_TTL_MS);
      }
      if (tracks.some((t) => t.rf?.strobeId === 'E01' && t.rf.band === '2.4GHz')) badged = true;
    }
    expect(badged).toBe(true);
    expect(lastSeen).toBeLessThanOrEqual(40_000);
    expect(sim.getState().rfStrobes).toEqual([]);
  });

  it('is deterministic', () => {
    const run = () => {
      const sim = createSim(withRf([attackQuad('c01', [300, 2500], 5000)]), flatTerrain);
      const strobes: string[] = [];
      while (sim.getState().endReason === null) {
        sim.tick();
        strobes.push(JSON.stringify(sim.getState().rfStrobes));
      }
      return strobes.join('|') + JSON.stringify(sim.getState());
    };
    expect(run()).toBe(run());
  });
});
