import type { Point2, Scenario, SimEvent } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  bearingDeg,
  createSim,
  defenderLeaks,
  horizontalRange,
  pointInRing,
  validateScenario,
  wrapDeg,
  type Sim,
} from '../src/index.ts';
import { loadScripted, playDefender } from './fixture-logs.ts';
import { presetWorld } from './fixtures.ts';
import { playTrainee } from './trainee-policy.ts';

// Phase 3b library guard tests (plan Step 8): every library scenario passes the
// validator (D2–D3 include "the ground-truth defender wins"), and each one trains
// what its briefing says. Ground truth is read here only to check the scenario.

const LIBRARY = ['S04', 'S05', 'S06', 'S07', 'S08', 'S09', 'S10', 'S15'] as const;

function passive(s: Scenario, each?: (sim: Sim) => void): Sim {
  const sim = createSim(s, presetWorld(s.terrain.preset));
  while (sim.getState().endReason === null) {
    sim.tick();
    each?.(sim);
  }
  return sim;
}

/** Smallest angle between two bearings, degrees. */
const angleBetween = (a: number, b: number) => {
  const d = wrapDeg(a - b);
  return Math.min(d, 360 - d);
};

const contact = (sim: Sim, id: string) => sim.getState().contacts.find((c) => c.id === id);
const active = (sim: Sim, id: string) => contact(sim, id)?.status === 'ACTIVE';

/** Segment ab crosses the polyline. */
function crosses(a: Point2, b: Point2, line: readonly Point2[]): boolean {
  const side = (p: Point2, q: Point2, r: Point2) =>
    Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  for (let i = 0; i + 1 < line.length; i++) {
    const c = line[i]!;
    const d = line[i + 1]!;
    if (side(a, b, c) !== side(a, b, d) && side(c, d, a) !== side(c, d, b)) return true;
  }
  return false;
}

/** Lock the EO camera, fully zoomed, on contact `id`'s first track. */
function lockOn(s: Scenario, id: string, mode: 'DAY' | 'IR'): Sim {
  const sim = createSim(s, presetWorld(s.terrain.preset));
  let locked = false;
  while (sim.getState().endReason === null) {
    const t = sim.getState().tracks.find((x) => x.contactId === id && x.status === 'ACTIVE');
    if (t && !locked) {
      locked = true;
      sim.dispatch({
        type: 'CAMERA_SLEWED',
        trackId: t.id,
        payload: { azDeg: t.bearingDeg, elDeg: 0, zoom: 20, mode },
      });
    }
    sim.tick();
  }
  return sim;
}

const identifiedIds = (sim: Sim) =>
  new Set(
    sim
      .getEvents()
      .filter((e) => e.type === 'EO_IDENTIFIABLE' && e.payload.level === 'IDENTIFY')
      .map((e) => (e as Extract<SimEvent, { contactId: string }>).contactId),
  );

describe('library: every scenario passes the validator', () => {
  for (const id of LIBRARY) {
    it(
      id,
      () => {
        const s = loadScripted(id);
        const result = validateScenario(s, presetWorld(s.terrain.preset));
        expect(result.checks.filter((c) => !c.ok)).toEqual([]);
        expect(result.ok).toBe(true);
        if (s.difficulty <= 3) {
          expect(result.checks.find((c) => c.name === 'DEFENDER_WINS')?.ok).toBe(true);
        } else {
          // D4-D5: not required, recorded. 2026-10-17: the ground-truth defender loses nothing.
          expect(defenderLeaks(s, presetWorld(s.terrain.preset))).toEqual([]);
        }
      },
      60_000,
    );
  }
});

describe('S04 Night Drop (PUNJAB_PLAINS, night)', () => {
  const s = loadScripted('S04');

  it('a heavy, RF-linked courier crosses the border and drops on our side', () => {
    const c01 = s.contacts.find((c) => c.id === 'c01')!;
    expect([c01.class, c01.behaviour, c01.controlLink]).toEqual([
      'QUAD_HEAVY',
      'SMUGGLING_DROP',
      'RF_MANUAL',
    ]);
    const border = s.zones.find((z) => z.kind === 'BORDER_LINE');
    expect(border).toBeDefined();
    const sim = passive(s);
    expect(sim.getState().environment.isNight).toBe(true);
    const drop = sim.getEvents().find((e) => e.type === 'CONTACT_DROPPED' && e.contactId === 'c01');
    expect(drop).toBeDefined();
    const start: Point2 = [c01.path[0]!.x, c01.path[0]!.z];
    const at = (drop as Extract<SimEvent, { type: 'CONTACT_DROPPED' }>).payload;
    expect(
      crosses(start, [at.x, at.z], border?.kind === 'BORDER_LINE' ? border.polyline : []),
    ).toBe(true);
  });

  it('is RF-strobed, and identified in IR but never with the day camera', () => {
    let strobed = false;
    passive(s, (sim) => {
      if (sim.getState().rfStrobes.some((r) => r.contactId === 'c01')) strobed = true;
    });
    expect(strobed).toBe(true);
    expect(identifiedIds(lockOn(s, 'c01', 'DAY')).has('c01')).toBe(false);
    expect(identifiedIds(lockOn(s, 'c01', 'IR')).has('c01')).toBe(true);
  }, 60_000);
});

describe('S04 contact report exercise (Phase 4a Step 13)', () => {
  const s = loadScripted('S04');

  it('is scored with default_v4 and its briefing asks for reports', () => {
    expect(s.scoringTreeId).toBe('default_v4');
    expect(s.briefing).toContain(
      'Contact reports are expected: send one for every threat track (R).',
    );
  });

  it('a report on the courier logs its hidden truth; a run without reports logs none', () => {
    const events = playTrainee(s, presetWorld(s.terrain.preset), 'ASSESSMENT').getEvents();
    const courierTracks = new Set(
      events
        .filter(
          (e): e is Extract<SimEvent, { type: 'SENSOR_TRACK_CREATED' }> =>
            e.type === 'SENSOR_TRACK_CREATED' && e.contactId === 'c01',
        )
        .map((e) => e.trackId),
    );
    const reports = events.filter(
      (e): e is Extract<SimEvent, { type: 'REPORT_SUBMITTED' }> =>
        e.type === 'REPORT_SUBMITTED' && e.payload.trackIds.some((t) => courierTracks.has(t)),
    );
    expect(reports.length).toBeGreaterThan(0);
    for (const r of reports) {
      const truth = events.find(
        (e): e is Extract<SimEvent, { type: 'REPORT_TRUTH' }> =>
          e.type === 'REPORT_TRUTH' && e.payload.reportSeq === r.seq,
      );
      expect(truth?.tMs).toBe(r.tMs);
      expect(truth?.payload.contacts.map((c) => c.contactId)).toEqual(['c01']);
    }
    const silent = playDefender(s, 'ASSESSMENT').getEvents();
    expect(silent.some((e) => e.type === 'REPORT_SUBMITTED' || e.type === 'REPORT_TRUTH')).toBe(
      false,
    );
  }, 60_000);
});

describe('S05 Silent Approach (JK_MOUNTAIN, day)', () => {
  const s = loadScripted('S05');

  it('the fibre-optic FPV is never RF-strobed', () => {
    expect(s.contacts.find((c) => c.id === 'c01')?.controlLink).toBe('FIBRE_OPTIC');
    let strobed = false;
    passive(s, (sim) => {
      if (sim.getState().rfStrobes.some((r) => r.contactId === 'c01')) strobed = true;
    });
    expect(strobed).toBe(false);
  });

  it('jamming its track has no effect; the jammer is there to be tempting', () => {
    expect(s.effectors.some((e) => e.kind === 'EW_JAM')).toBe(true);
    const sim = createSim(s, presetWorld(s.terrain.preset), { mode: 'PRACTICE' });
    let ordered = false;
    while (sim.getState().endReason === null) {
      const t = sim
        .getState()
        .tracks.find((x) => x.contactId === 'c01' && x.status === 'ACTIVE' && x.rangeM < 1800);
      if (t && !ordered) {
        ordered = true;
        sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
        sim.dispatch({ type: 'MARKED_DETECTED', trackId: t.id, payload: {} });
        sim.dispatch({ type: 'RESPONSE_ORDERED', trackId: t.id, payload: { response: 'EW_JAM' } });
      }
      sim.tick();
    }
    expect(ordered).toBe(true);
    const outcome = sim
      .getEvents()
      .find((e) => e.type === 'RESPONSE_OUTCOME' && e.payload.response === 'EW_JAM');
    expect(outcome).toMatchObject({ contactId: 'c01', payload: { result: 'NO_EFFECT' } });
    expect(contact(sim, 'c01')?.status).toBe('REACHED_ASSET');
  });
});

describe('S06 Crowded Skies (URBAN_GENERIC, day)', () => {
  const s = loadScripted('S06');

  it('civilian drones over a town with no-kinetic zones, one RF-linked hostile', () => {
    const threats = s.contacts.filter((c) => c.isThreat);
    expect(threats.map((c) => [c.class, c.controlLink])).toEqual([['QUAD_SMALL', 'RF_MANUAL']]);
    const civilians = s.contacts.filter((c) => c.class === 'CIVILIAN_HOBBY');
    expect(civilians.length).toBeGreaterThanOrEqual(3);
    expect(civilians.length).toBeLessThanOrEqual(4);
    expect(s.zones.some((z) => z.kind === 'NO_KINETIC')).toBe(true);
  });

  it('the hostile flies over a no-kinetic zone and a civilian is in its jam sector', () => {
    const jammer = s.effectors.find((e) => e.kind === 'EW_JAM')!;
    const rings = s.zones.flatMap((z) => (z.kind === 'NO_KINETIC' ? [z.polygon] : []));
    const civilians = s.contacts.filter((c) => c.class === 'CIVILIAN_HOBBY').map((c) => c.id);
    const at = { x: jammer.x, y: 0, z: jammer.z };
    let overZone = false;
    let inSector = false;
    passive(s, (sim) => {
      const h = contact(sim, 'c01');
      if (h?.status !== 'ACTIVE') return;
      if (rings.some((r) => pointInRing(r, h.pos.x, h.pos.z))) overZone = true;
      if (horizontalRange(at, h.pos) > jammer.rangeM) return;
      const bh = bearingDeg(at, h.pos);
      for (const id of civilians) {
        const c = contact(sim, id);
        if (!c || !active(sim, id) || horizontalRange(at, c.pos) > jammer.rangeM) continue;
        if (angleBetween(bearingDeg(at, c.pos), bh) <= 10) inSector = true;
      }
    });
    expect({ overZone, inSector }).toEqual({ overZone: true, inSector: true });
  });
});

const tracksCreated = (sim: Sim) =>
  sim
    .getEvents()
    .filter(
      (e): e is Extract<SimEvent, { type: 'SENSOR_TRACK_CREATED' }> =>
        e.type === 'SENSOR_TRACK_CREATED',
    );

describe('S07 Look Over There (PUNJAB_PLAINS, dusk)', () => {
  const s = loadScripted('S07');
  const decoy = s.contacts.find((c) => c.behaviour === 'DECOY')!;
  const strike = s.contacts.find((c) => c.class === 'LOITERING_GENERIC')!;

  it('a loud high decoy and a silent low loitering munition on another axis', () => {
    expect(s.contacts.filter((c) => c.isThreat).map((c) => c.id)).toEqual([decoy.id, strike.id]);
    expect(decoy.controlLink).toBe('RF_MANUAL');
    expect(strike.controlLink).not.toBe('RF_MANUAL');
    expect(decoy.path[0]!.y).toBeGreaterThan(150);
    expect(strike.path[0]!.y).toBeLessThan(60);
    const a = s.assets[0]!;
    const from = (c: typeof decoy) => bearingDeg({ x: a.x, y: 0, z: a.z }, { ...c.path[0]!, y: 0 });
    expect(angleBetween(from(decoy), from(strike))).toBeGreaterThan(90);
  });

  it('the decoy is RF-strobed before the loitering munition is first tracked', () => {
    let strobeT: number | null = null;
    let strikeStrobed = false;
    const sim = passive(s, (x) => {
      for (const r of x.getState().rfStrobes) {
        if (r.contactId === decoy.id && strobeT === null) strobeT = x.getState().clock.tMs;
        if (r.contactId === strike.id) strikeStrobed = true;
      }
    });
    const firstStrike = tracksCreated(sim).find((e) => e.contactId === strike.id);
    expect(strobeT).not.toBeNull();
    expect(firstStrike).toBeDefined();
    expect(strobeT!).toBeLessThan(firstStrike!.tMs);
    expect(strikeStrobed).toBe(false);
  });
});

describe('S08 Fog Line (PUNJAB_PLAINS, January fog)', () => {
  const s = loadScripted('S08');

  it('is a winter day in 0.8 km fog with a friendly patrol and birds', () => {
    expect(s.environment.date.slice(5, 7)).toBe('01');
    expect(s.environment.weather.visibilityM).toBe(800);
    expect(createSim(s, presetWorld(s.terrain.preset)).getState().environment.isNight).toBe(false);
    expect(s.contacts.some((c) => c.class === 'FRIENDLY_QUAD')).toBe(true);
    expect(s.contacts.some((c) => c.behaviour === 'BIRD_FLOCK')).toBe(true);
  });

  it('the camera never identifies anything beyond 0.8 km, day or thermal', () => {
    const target = s.contacts.find((c) => c.isThreat && c.behaviour === 'ATTACK_RUN')!;
    for (const mode of ['DAY', 'IR'] as const) {
      const ids = lockOn(s, target.id, mode)
        .getEvents()
        .filter((e) => e.type === 'EO_IDENTIFIABLE' && e.payload.level === 'IDENTIFY');
      expect(ids.length).toBeGreaterThan(0);
      for (const e of ids)
        expect((e.payload as { rangeM: number }).rangeM).toBeLessThanOrEqual(800);
    }
  }, 60_000);
});

describe('S09 Dusk Swarm (PUNJAB_PLAINS, dusk)', () => {
  const s = loadScripted('S09');

  it('8 swarm drones in two groups on two axes, one out of the sun', () => {
    const swarm = s.contacts.filter((c) => c.behaviour === 'SWARM_SATURATION');
    expect(swarm).toHaveLength(8);
    const groups = new Map<string, typeof swarm>();
    for (const c of swarm) groups.set(c.groupId!, [...(groups.get(c.groupId!) ?? []), c]);
    expect([...groups.values()].map((g) => g.length)).toEqual([4, 4]);
    const a = s.assets[0]!;
    const sun = createSim(s, presetWorld(s.terrain.preset)).getState().environment.sun;
    expect(sun.elDeg).toBeGreaterThan(-6);
    // Bearing of each group's final straight approach (last waypoint before the dive).
    const axes = [...groups.values()].map((g) => {
      const w = g[0]!.path[g[0]!.path.length - 2]!;
      return bearingDeg({ x: a.x, y: 0, z: a.z }, { x: w.x, y: 0, z: w.z });
    });
    expect(angleBetween(axes[0]!, axes[1]!)).toBeGreaterThan(60);
    expect(Math.min(...axes.map((b) => angleBetween(b, sun.azDeg)))).toBeLessThanOrEqual(15);
  });
});

describe('S10 Saturation (PUNJAB_PLAINS, night, rain)', () => {
  const s = loadScripted('S10');

  it('swarms, two decoys, birds and a friendly helicopter; fewer rounds than threats', () => {
    const threats = s.contacts.filter((c) => c.isThreat);
    const swarms = new Set(
      threats.filter((c) => c.behaviour === 'SWARM_SATURATION').map((c) => c.groupId),
    );
    expect(swarms.size).toBeGreaterThanOrEqual(2);
    expect(swarms.size).toBeLessThanOrEqual(3);
    expect(threats.filter((c) => c.behaviour === 'DECOY')).toHaveLength(2);
    expect(s.contacts.some((c) => c.behaviour === 'BIRD_FLOCK')).toBe(true);
    expect(s.contacts.some((c) => c.class === 'HELICOPTER_FRIENDLY')).toBe(true);
    expect(s.contacts.length).toBeLessThanOrEqual(60);
    const ammo = s.effectors.find((e) => e.kind === 'INTERCEPT')?.ammo ?? 0;
    expect(ammo).toBeLessThan(threats.length);
    expect(s.environment.weather.rainMmph).toBeGreaterThan(0);
    expect(createSim(s, presetWorld(s.terrain.preset)).getState().environment.isNight).toBe(true);
  });
});

describe('S15 Birds or Drone? (PUNJAB_PLAINS, day)', () => {
  const s = loadScripted('S15');

  it('two flocks are tracked before the quad, on bearings within 15 degrees of it', () => {
    const quad = s.contacts.find((c) => c.isThreat)!;
    expect(s.contacts.filter((c) => c.isThreat)).toHaveLength(1);
    expect(quad.class).toBe('QUAD_SMALL');
    const flocks = new Set(
      s.contacts.filter((c) => c.behaviour === 'BIRD_FLOCK').map((c) => c.groupId),
    );
    expect(flocks.size).toBe(2);
    const created = tracksCreated(passive(s));
    const first = created.find((e) => e.contactId === quad.id)!;
    expect(first).toBeDefined();
    const bird = (id: string) => s.contacts.find((c) => c.id === id)?.behaviour === 'BIRD_FLOCK';
    const before = created.filter(
      (e) =>
        e.tMs < first.tMs &&
        bird(e.contactId) &&
        angleBetween(e.payload.bearingDeg, first.payload.bearingDeg) <= 15,
    );
    const groupsBefore = new Set(
      before.map((e) => s.contacts.find((c) => c.id === e.contactId)!.groupId),
    );
    expect(groupsBefore.size).toBe(2);
  });
});
