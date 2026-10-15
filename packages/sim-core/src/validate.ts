import {
  FIRST_TRACK_MAX_DIFFICULTY,
  FIRST_TRACK_MAX_S,
  MIN_WARNING_S,
  Scenario,
  type ContactSpec,
} from '@vyuh/shared';
import { horizontalRange } from './coords.ts';
import { createDefender } from './defender.ts';
import { createSim } from './sim.ts';
import { computeEnvironment } from './sun.ts';
import type { World } from './world.ts';

// Playability validator (Phase 3a, decision 75). Pure: the caller loads the
// scenario JSON and the preset World. Geometry checks mirror the API's runtime
// static checks; the sensor checks (detectable, warning time, defender wins)
// exist only here, so the sim itself is the judge (no second sensor model).

export type ValidationCheckName =
  | 'SCHEMA'
  | 'HAS_THREAT'
  | 'BOUNDS'
  | 'MIN_AGL'
  | 'SPAWN_DISTANCE'
  | 'NIGHT_FLAG'
  | 'DETECTABLE'
  | 'WARNING_TIME'
  | 'FIRST_TRACK'
  | 'DEFENDER_WINS';

export interface ValidationCheck {
  readonly name: ValidationCheckName;
  readonly ok: boolean;
  readonly detail?: string;
}

export interface ThreatWarning {
  readonly contactId: string;
  /** First radar track, ms; null if never tracked. */
  readonly firstTrackTMs: number | null;
  /**
   * Reached an asset or dropped, ms; for a threat that does neither, the first
   * time it came within CRITICAL_RANGE_M of an asset; null if never.
   */
  readonly criticalTMs: number | null;
  /** criticalTMs − firstTrackTMs in s (null if either is missing). */
  readonly warningS: number | null;
}

export interface ValidationResult {
  readonly ok: boolean;
  readonly checks: readonly ValidationCheck[];
  readonly warnings: readonly ThreatWarning[];
  /** Threats that leaked against the ground-truth defender (D1–D3 only; [] otherwise). */
  readonly defenderLeaks: readonly string[];
}

/** Waypoints stay this far inside the map edge (the generator uses 250 m). */
export const VALIDATE_EDGE_MARGIN_M = 200;
export const VALIDATE_MIN_AGL_M = 5;
/** Threat spawns at least this far from every asset; other non-friendlies 800 m. */
export const THREAT_SPAWN_MIN_M = 1500;
export const OTHER_SPAWN_MIN_M = 800;
/** A threat that never leaks is at its critical point this close to an asset (recon orbit). */
export const CRITICAL_RANGE_M = 1000;
/** The ground-truth defender must win at these difficulties (requirements 3a.3). */
export const DEFENDER_MAX_DIFFICULTY = 3;

const fail = (name: ValidationCheckName, detail: string): ValidationCheck => ({
  name,
  ok: false,
  detail,
});
const pass = (name: ValidationCheckName): ValidationCheck => ({ name, ok: true });
const check = (name: ValidationCheckName, bad: readonly string[]): ValidationCheck =>
  bad.length === 0 ? pass(name) : fail(name, bad.join('; '));

function geometry(s: Scenario, world: World): ValidationCheck[] {
  const half = world.heightmap.sizeM / 2 - VALIDATE_EDGE_MARGIN_M;
  const bounds: string[] = [];
  const agl: string[] = [];
  const spawn: string[] = [];
  for (const c of s.contacts) {
    c.path.forEach((w, i) => {
      if (Math.abs(w.x) > half || Math.abs(w.z) > half) bounds.push(`${c.id} wp${i}`);
      const lowOk = w.action === 'DIVE' || w.altRef === 'MSL';
      if (!lowOk && w.y < VALIDATE_MIN_AGL_M) agl.push(`${c.id} wp${i} ${w.y} m`);
    });
    const min = c.isThreat
      ? THREAT_SPAWN_MIN_M
      : c.affiliation === 'FRIENDLY'
        ? 0
        : OTHER_SPAWN_MIN_M;
    const first = c.path[0];
    for (const a of s.assets) {
      if (first && Math.hypot(first.x - a.x, first.z - a.z) < min) {
        spawn.push(`${c.id} within ${min} m of ${a.id}`);
      }
    }
  }
  return [check('BOUNDS', bounds), check('MIN_AGL', agl), check('SPAWN_DISTANCE', spawn)];
}

/** A passive run (no operator): first track and critical point of every threat. */
function measureWarnings(s: Scenario, world: World): ThreatWarning[] {
  const sim = createSim(s, world, { mode: 'ASSESSMENT' });
  const threats = s.contacts.filter((c) => c.isThreat);
  const firstTrack = new Map<string, number>();
  const leak = new Map<string, number>();
  const close = new Map<string, number>();
  const near = (c: { pos: { x: number; y: number; z: number } }) =>
    s.assets.some((a) => horizontalRange(c.pos, { x: a.x, y: 0, z: a.z }) <= CRITICAL_RANGE_M);
  let seen = 0;
  while (sim.getState().endReason === null) {
    sim.tick();
    const st = sim.getState();
    const events = sim.getEvents();
    for (; seen < events.length; seen++) {
      const e = events[seen];
      if (e === undefined) continue;
      if (e.type === 'SENSOR_TRACK_CREATED' && !firstTrack.has(e.contactId)) {
        firstTrack.set(e.contactId, e.tMs);
      }
      if (
        (e.type === 'CONTACT_REACHED_ASSET' || e.type === 'CONTACT_DROPPED') &&
        !leak.has(e.contactId)
      ) {
        leak.set(e.contactId, e.tMs);
      }
    }
    for (const t of threats) {
      if (close.has(t.id)) continue;
      const c = st.contacts.find((x) => x.id === t.id);
      if (c?.status === 'ACTIVE' && near(c)) close.set(t.id, st.clock.tMs);
    }
  }
  return threats.map((t) => {
    const first = firstTrack.get(t.id) ?? null;
    const crit = leak.get(t.id) ?? close.get(t.id) ?? null;
    return {
      contactId: t.id,
      firstTrackTMs: first,
      criticalTMs: crit,
      warningS: first !== null && crit !== null ? (crit - first) / 1000 : null,
    };
  });
}

/** Threats that reach an asset or drop a payload against the ground-truth defender. */
export function defenderLeaks(s: Scenario, world: World): string[] {
  const sim = createSim(s, world, { mode: 'ASSESSMENT' });
  const defender = createDefender(s);
  while (sim.getState().endReason === null) {
    for (const cmd of defender.step(sim.getState())) sim.dispatch(cmd);
    sim.tick();
  }
  const threats = new Set(s.contacts.filter((c) => c.isThreat).map((c) => c.id));
  const leaked = new Set<string>();
  for (const e of sim.getEvents()) {
    if (
      (e.type === 'CONTACT_REACHED_ASSET' || e.type === 'CONTACT_DROPPED') &&
      threats.has(e.contactId)
    ) {
      leaked.add(e.contactId);
    }
  }
  return [...leaked].sort();
}

/** Run every check on a scenario (unknown JSON is schema-checked first). */
export function validateScenario(input: unknown, world: World): ValidationResult {
  const parsed = Scenario.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`);
    return {
      ok: false,
      checks: [fail('SCHEMA', issues.join('; '))],
      warnings: [],
      defenderLeaks: [],
    };
  }
  const s = parsed.data;
  const threats: ContactSpec[] = s.contacts.filter((c) => c.isThreat);
  const checks: ValidationCheck[] = [pass('SCHEMA')];
  checks.push(threats.length > 0 ? pass('HAS_THREAT') : fail('HAS_THREAT', 'no threat contact'));
  checks.push(...geometry(s, world));

  const env = computeEnvironment(s, world.meta);
  checks.push(
    env.isNight === s.environment.isNight
      ? pass('NIGHT_FLAG')
      : fail('NIGHT_FLAG', `stored ${s.environment.isNight}, sun ${env.sun.elDeg.toFixed(1)}°`),
  );

  const warnings = measureWarnings(s, world);
  checks.push(
    check(
      'DETECTABLE',
      warnings.filter((w) => w.firstTrackTMs === null).map((w) => `${w.contactId} never tracked`),
    ),
  );
  const minWarning = MIN_WARNING_S[s.difficulty as keyof typeof MIN_WARNING_S];
  checks.push(
    check(
      'WARNING_TIME',
      warnings
        .filter((w) => w.warningS !== null && w.warningS < minWarning)
        .map((w) => `${w.contactId} ${w.warningS?.toFixed(1)} s < ${minWarning} s`),
    ),
  );

  // Generator pacing target (decision 79); frozen scripted scenarios predate it.
  if (s.generatorVersion !== undefined && s.difficulty <= FIRST_TRACK_MAX_DIFFICULTY) {
    const tracked = warnings.flatMap((w) => (w.firstTrackTMs === null ? [] : [w.firstTrackTMs]));
    const first = tracked.length ? Math.min(...tracked) / 1000 : null;
    checks.push(
      first !== null && first <= FIRST_TRACK_MAX_S
        ? pass('FIRST_TRACK')
        : fail(
            'FIRST_TRACK',
            `first threat track at ${first?.toFixed(1) ?? 'never'} s > ${FIRST_TRACK_MAX_S} s`,
          ),
    );
  }

  const leaks = s.difficulty <= DEFENDER_MAX_DIFFICULTY ? defenderLeaks(s, world) : [];
  if (s.difficulty <= DEFENDER_MAX_DIFFICULTY) {
    checks.push(
      check(
        'DEFENDER_WINS',
        leaks.map((id) => `${id} leaked`),
      ),
    );
  }
  return { ok: checks.every((c) => c.ok), checks, warnings, defenderLeaks: leaks };
}
