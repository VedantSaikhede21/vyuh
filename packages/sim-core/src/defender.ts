import type { Affiliation, ContactClass, ControlLink, EffectorKind, Scenario } from '@vyuh/shared';
import type { SimCommand, SimState } from './sim.ts';
import { slantRange, type Vec3 } from './coords.ts';
import type { EffectorState } from './effectors.ts';
import { inNoKinetic, noKineticPolygons } from './zones.ts';

// A ground-truth defender (decision 68): it reads which contact each track
// really is and acts like a perfect operator — mark, classify and set the true
// affiliation on every new track, and intercept threats only. It never engages
// a non-threat, never orders an intercept the ROE or a NO_KINETIC zone would
// block (it judges the zone by the track estimate, as the sim does), and in
// those cases jams or spoofs a susceptible threat instead. Used for the landing-page recording now and the Phase 3a
// playability validator later. Pure and RNG-free: the same state always gives
// the same commands, so replays stay exact.

const FRIENDLY_CLASSES: ReadonlySet<ContactClass> = new Set([
  'FRIENDLY_QUAD',
  'HELICOPTER_FRIENDLY',
]);

/** Intercept once the threat is inside this share of the interceptor's range. */
export const DEFENDER_RANGE_FRACTION = 0.85;

export interface Defender {
  /** Commands to dispatch before the next tick. */
  step(state: Readonly<SimState>): SimCommand[];
}

export function trueAffiliation(scenario: Scenario, contactId: string): Affiliation {
  const c = scenario.contacts.find((x) => x.id === contactId);
  if (!c) return 'UNKNOWN';
  if (c.isThreat) return 'HOSTILE';
  return FRIENDLY_CLASSES.has(c.class) ? 'FRIENDLY' : 'NEUTRAL';
}

/** The EW effector that defeats a control link, if any (SPEC §8). */
const EW_FOR_LINK: Partial<Record<ControlLink, EffectorKind>> = {
  RF_MANUAL: 'EW_JAM',
  AUTONOMOUS_GNSS: 'EW_SPOOF',
};

function readyInRange(e: EffectorState, kind: EffectorKind, tMs: number, target: Vec3): boolean {
  return (
    e.kind === kind &&
    tMs >= e.readyAtMs &&
    (e.ammo === null || e.ammo > 0) &&
    slantRange(e.pos, target) <= e.rangeM * DEFENDER_RANGE_FRACTION
  );
}

export function createDefender(scenario: Scenario): Defender {
  const identified = new Set<string>();
  const threats = new Set(scenario.contacts.filter((c) => c.isThreat).map((c) => c.id));
  const classOf = new Map(scenario.contacts.map((c) => [c.id, c.class]));
  const linkOf = new Map(scenario.contacts.map((c) => [c.id, c.controlLink]));
  const noKinetic = noKineticPolygons(scenario.zones);
  return {
    step(state) {
      const out: SimCommand[] = [];
      for (const t of state.tracks) {
        if (t.status !== 'ACTIVE') continue;
        if (!identified.has(t.id)) {
          identified.add(t.id);
          const cls = classOf.get(t.contactId);
          out.push({ type: 'TRACK_SELECTED', trackId: t.id, payload: {} });
          out.push({ type: 'MARKED_DETECTED', trackId: t.id, payload: {} });
          if (cls) out.push({ type: 'CLASSIFIED', trackId: t.id, payload: { class: cls } });
          out.push({
            type: 'AFFILIATION_SET',
            trackId: t.id,
            payload: { affiliation: trueAffiliation(scenario, t.contactId) },
          });
        }
        if (!threats.has(t.contactId)) continue;
        const contact = state.contacts.find((c) => c.id === t.contactId);
        if (!contact || contact.status !== 'ACTIVE' || contact.defeated) continue;
        const kineticOk = state.roe !== 'WEAPONS_HOLD' && !inNoKinetic(noKinetic, t.pos.x, t.pos.z);
        const ew = EW_FOR_LINK[linkOf.get(t.contactId) ?? 'NONE'];
        const kind: EffectorKind | undefined = kineticOk ? 'INTERCEPT' : ew;
        if (kind === undefined) continue;
        const eff = state.effectors.find((e) =>
          readyInRange(e, kind, state.clock.tMs, contact.pos),
        );
        if (eff) {
          out.push({
            type: 'RESPONSE_ORDERED',
            trackId: t.id,
            payload: { response: kind, effectorId: eff.id },
          });
          break; // one order per tick; the cooldown spaces the rest
        }
      }
      return out;
    },
  };
}
