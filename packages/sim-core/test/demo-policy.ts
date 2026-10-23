import type {
  Affiliation,
  ContactClass,
  ContactReport,
  ControlLink,
  EffectorKind,
  Scenario,
} from '@vyuh/shared';
import { altitudeBandOf } from '@vyuh/shared';
import {
  createRng,
  createSim,
  inNoKinetic,
  noKineticPolygons,
  slantRange,
  trueAffiliation,
  wrapDeg,
  type Heightmap,
  type RandomStream,
  type Sim,
  type SimCommand,
  type SimState,
  type TrackState,
  type World,
} from '../src/index.ts';

// A scripted trainee with a skill level, for the seeded demo history (SPEC §22,
// decision 125). Skill 0 is a new operator, 1 a practised one. The policy reads
// the truth like the ground-truth defender but acts on it imperfectly: it marks
// tracks late or never, misclassifies (a bird as a quad, a heavy quad as small),
// engages what it believes hostile — non-threats included — fires at long range,
// sometimes jams links it cannot affect or tries to intercept over a no-kinetic
// zone, and sends fewer contact reports. Its own RNG drives every choice, so a
// (scenario, skill, seed) gives the same log every run; the sim stays exact.

const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.min(Math.max(t, 0), 1);

/** What a careless operator calls each class. */
const CONFUSED_WITH: Record<ContactClass, ContactClass> = {
  QUAD_SMALL: 'QUAD_HEAVY',
  QUAD_HEAVY: 'QUAD_SMALL',
  FPV: 'QUAD_SMALL',
  FIXED_WING_SMALL: 'LOITERING_GENERIC',
  LOITERING_GENERIC: 'FIXED_WING_SMALL',
  BIRD_SMALL: 'QUAD_SMALL',
  BIRD_LARGE: 'FIXED_WING_SMALL',
  FRIENDLY_QUAD: 'QUAD_SMALL',
  CIVILIAN_HOBBY: 'QUAD_SMALL',
  HELICOPTER_FRIENDLY: 'HELICOPTER_FRIENDLY',
};
const THREAT_CLASSES: ReadonlySet<ContactClass> = new Set([
  'QUAD_SMALL',
  'QUAD_HEAVY',
  'FPV',
  'FIXED_WING_SMALL',
  'LOITERING_GENERIC',
]);
const EW_FOR_LINK: Partial<Record<ControlLink, EffectorKind>> = {
  RF_MANUAL: 'EW_JAM',
  AUTONOMOUS_GNSS: 'EW_SPOOF',
};

interface TrackPlan {
  markAt: number | null;
  classifyAt: number;
  cls: ContactClass;
  affiliation: Affiliation;
  report: boolean;
  /** Will try one intercept over a no-kinetic zone (blocked by the sim). */
  zoneSlip: boolean;
  /** Will first order a jam whatever the link. */
  jamFirst: boolean;
  marked: boolean;
  classified: boolean;
  reported: boolean;
}

function plan(
  rng: RandomStream,
  skill: number,
  t: TrackState,
  scenario: Scenario,
  tMs: number,
): TrackPlan {
  const spec = scenario.contacts.find((c) => c.id === t.contactId);
  const truth = spec?.class ?? 'QUAD_SMALL';
  const missed = rng.chance(lerp(0.3, 0.03, skill));
  const markAt = missed ? null : tMs + Math.round(lerp(30_000, 2_500, skill) * rng.range(0.5, 1.5));
  const right = rng.chance(lerp(0.4, 0.95, skill));
  const cls = right ? truth : CONFUSED_WITH[truth];
  const truthAff = trueAffiliation(scenario, t.contactId);
  const affiliation: Affiliation = right
    ? truthAff
    : THREAT_CLASSES.has(cls)
      ? 'HOSTILE'
      : 'NEUTRAL';
  return {
    markAt,
    classifyAt: (markAt ?? tMs) + Math.round(lerp(18_000, 2_000, skill) * rng.range(0.5, 1.5)),
    cls,
    affiliation,
    report: rng.chance(lerp(0.15, 0.9, skill)),
    zoneSlip: rng.chance(lerp(0.5, 0.02, skill)),
    jamFirst: rng.chance(lerp(0.45, 0.03, skill)),
    marked: false,
    classified: false,
    reported: false,
  };
}

function report(t: TrackState, p: TrackPlan, tMs: number): ContactReport {
  return {
    trackIds: [t.id],
    count: 1,
    class: p.cls,
    affiliation: p.affiliation,
    location: { bearingDeg: wrapDeg(t.bearingDeg), rangeM: t.rangeM, fromSensorId: t.sensorId },
    headingDeg: wrapDeg(t.headingDeg ?? 0),
    altitudeBand: altitudeBandOf(t.altitudeAglM),
    activity: 'APPROACHING',
    tMs,
  };
}

/** One order per tick at most, as a person would. */
function engage(
  st: Readonly<SimState>,
  scenario: Scenario,
  skill: number,
  plans: Map<string, TrackPlan>,
  tried: Set<string>,
  zones: ReturnType<typeof noKineticPolygons>,
): SimCommand | null {
  const fraction = lerp(0.95, 0.6, skill);
  const linkOf = new Map(scenario.contacts.map((c) => [c.id, c.controlLink]));
  for (const t of st.tracks) {
    const p = plans.get(t.id);
    if (t.status !== 'ACTIVE' || !p?.classified || p.affiliation !== 'HOSTILE') continue;
    const contact = st.contacts.find((c) => c.id === t.contactId);
    if (!contact || contact.status !== 'ACTIVE' || contact.defeated) continue;
    const tMs = st.clock.tMs;
    const ready = (kind: EffectorKind, frac: number) =>
      st.effectors.find(
        (e) =>
          e.kind === kind &&
          tMs >= e.readyAtMs &&
          (e.ammo === null || e.ammo > 0) &&
          slantRange(e.pos, contact.pos) <= e.rangeM * frac,
      );
    const order = (kind: EffectorKind, id: string): SimCommand => ({
      type: 'RESPONSE_ORDERED',
      trackId: t.id,
      payload: { response: kind, effectorId: id },
    });
    if (p.jamFirst && !tried.has(`jam:${t.id}`)) {
      const jam = ready('EW_JAM', 0.85);
      if (jam) {
        tried.add(`jam:${t.id}`);
        return order('EW_JAM', jam.id);
      }
    }
    const ew = EW_FOR_LINK[linkOf.get(t.contactId) ?? 'NONE'];
    const ewEff = ew && ready(ew, 0.85);
    if (ewEff && !tried.has(`ew:${t.id}:${Math.floor(tMs / 20_000)}`)) {
      tried.add(`ew:${t.id}:${Math.floor(tMs / 20_000)}`);
      return order(ewEff.kind, ewEff.id);
    }
    const overZone = inNoKinetic(zones, t.pos.x, t.pos.z);
    if (st.roe === 'WEAPONS_HOLD') continue;
    if (overZone && !(p.zoneSlip && !tried.has(`zone:${t.id}`))) continue;
    const int = ready('INTERCEPT', fraction);
    if (int) {
      if (overZone) tried.add(`zone:${t.id}`);
      return order('INTERCEPT', int.id);
    }
  }
  return null;
}

export function playDemoTrainee(
  scenario: Scenario,
  world: World | Heightmap,
  skill: number,
  seed: number,
): Sim {
  const sim = createSim(scenario, world, { mode: 'ASSESSMENT' });
  const rng = createRng(seed).stream('demo-trainee');
  const plans = new Map<string, TrackPlan>();
  const tried = new Set<string>();
  const zones = noKineticPolygons(scenario.zones);
  const reports = scenario.scoringTreeId === 'default_v4';
  while (sim.getState().endReason === null) {
    const st = sim.getState();
    const tMs = st.clock.tMs;
    for (const t of st.tracks) {
      if (t.status !== 'ACTIVE') continue;
      let p = plans.get(t.id);
      if (!p) {
        p = plan(rng, skill, t, scenario, tMs);
        plans.set(t.id, p);
      }
      if (p.markAt !== null && !p.marked && tMs >= p.markAt) {
        p.marked = true;
        sim.dispatch({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
        sim.dispatch({ type: 'MARKED_DETECTED', trackId: t.id, payload: {} });
      }
      if (p.marked && !p.classified && tMs >= p.classifyAt) {
        p.classified = true;
        sim.dispatch({ type: 'CLASSIFIED', trackId: t.id, payload: { class: p.cls } });
        sim.dispatch({
          type: 'AFFILIATION_SET',
          trackId: t.id,
          payload: { affiliation: p.affiliation },
        });
      }
      if (reports && p.report && p.classified && !p.reported && t.headingDeg !== null) {
        p.reported = true;
        sim.dispatch({ type: 'REPORT_SUBMITTED', payload: report(t, p, tMs) });
      }
    }
    const cmd = engage(st, scenario, skill, plans, tried, zones);
    if (cmd) sim.dispatch(cmd);
    sim.tick();
  }
  return sim;
}

/** Seeded demo history (SPEC §22): six trainees in two units, seven Assessment runs each. */
export interface DemoRun {
  email: string;
  index: number;
  scenarioCode: string;
  skill: number;
  seed: number;
}

const DEMO_TRAINEES: { email: string; from: number; to: number; order: string[] }[] = [
  {
    email: 'trainee1@demo',
    from: 0.35,
    to: 0.92,
    order: ['S15', 'S04', 'S05', 'S06', 'S07', 'S09', 'S08'],
  },
  {
    email: 'trainee2@demo',
    from: 0.15,
    to: 0.6,
    order: ['S15', 'S05', 'S04', 'S07', 'S06', 'S08', 'S09'],
  },
  {
    email: 'trainee3@demo',
    from: 0.55,
    to: 0.85,
    order: ['S04', 'S15', 'S05', 'S07', 'S09', 'S06', 'S10'],
  },
  {
    email: 'trainee4@demo',
    from: 0.1,
    to: 0.78,
    order: ['S15', 'S04', 'S05', 'S06', 'S07', 'S08', 'S09'],
  },
  {
    email: 'trainee5@demo',
    from: 0.4,
    to: 0.55,
    order: ['S15', 'S05', 'S04', 'S06', 'S09', 'S07', 'S08'],
  },
  {
    email: 'trainee6@demo',
    from: 0.25,
    to: 0.88,
    order: ['S04', 'S15', 'S05', 'S07', 'S06', 'S09', 'S10'],
  },
];

export function demoRuns(): DemoRun[] {
  return DEMO_TRAINEES.flatMap((t, ti) =>
    t.order.map((scenarioCode, index) => ({
      email: t.email,
      index,
      scenarioCode,
      skill: Math.round(lerp(t.from, t.to, index / (t.order.length - 1)) * 100) / 100,
      seed: 7_000 + ti * 100 + index,
    })),
  );
}
