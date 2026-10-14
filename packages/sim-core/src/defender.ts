import type { Affiliation, ContactClass, Scenario } from '@vyuh/shared';
import type { SimCommand, SimState } from './sim.ts';
import { slantRange } from './coords.ts';

// A ground-truth defender (decision 68): it reads which contact each track
// really is and acts like a perfect operator — mark, classify and set the true
// affiliation on every new track, and intercept threats only. It never engages
// a non-threat. Used for the landing-page recording now and the Phase 3a
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

export function createDefender(scenario: Scenario): Defender {
  const identified = new Set<string>();
  const threats = new Set(scenario.contacts.filter((c) => c.isThreat).map((c) => c.id));
  const classOf = new Map(scenario.contacts.map((c) => [c.id, c.class]));
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
        const eff = state.effectors.find(
          (e) =>
            e.kind === 'INTERCEPT' &&
            state.clock.tMs >= e.readyAtMs &&
            (e.ammo === null || e.ammo > 0) &&
            slantRange(e.pos, contact.pos) <= e.rangeM * DEFENDER_RANGE_FRACTION,
        );
        if (eff) {
          out.push({
            type: 'RESPONSE_ORDERED',
            trackId: t.id,
            payload: { response: 'INTERCEPT', effectorId: eff.id },
          });
          break; // one round per tick; the cooldown spaces the rest
        }
      }
      return out;
    },
  };
}
