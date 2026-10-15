import type { Affiliation, ContactClass, ControlLink, EffectorKind, Scenario } from '@vyuh/shared';
import type { SimCommand, SimState } from './sim.ts';
import { angleDiffDeg, bearingDeg, slantRange, type Vec3 } from './coords.ts';
import { EW_SECTOR_HALF_DEG, type EffectorState } from './effectors.ts';
import { inNoKinetic, noKineticPolygons } from './zones.ts';

// A ground-truth defender (decision 68): it reads which contact each track
// really is and acts like a perfect operator — mark, classify and set the true
// affiliation on every new track, and intercept threats only. It never engages
// a non-threat, never orders an intercept the ROE or a NO_KINETIC zone would
// block (it judges the zone by the track estimate, as the sim does). It jams or
// spoofs a susceptible threat first (saving rounds) when no friendly or civilian
// drone it could also defeat is in the sector, and otherwise intercepts. Used for the landing-page recording now and the Phase 3a
// playability validator later. Pure and RNG-free: the same state always gives
// the same commands, so replays stay exact.

const FRIENDLY_CLASSES: ReadonlySet<ContactClass> = new Set([
  'FRIENDLY_QUAD',
  'HELICOPTER_FRIENDLY',
]);

/** Order EW, or intercept a hovering threat, inside this share of the effector's range. */
export const DEFENDER_RANGE_FRACTION = 0.85;
/**
 * Intercept a moving threat only inside this share of the range (Pkill ≈ 0.75
 * instead of ≈ 0.54 at 0.85): with limited rounds a competent operator holds
 * fire until the shot is good.
 */
export const DEFENDER_INTERCEPT_FRACTION = 0.55;
/** Below this speed a threat counts as hovering (e.g. at a drop point). */
export const DEFENDER_HOVER_MPS = 1;

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

function readyInRange(
  e: EffectorState,
  kind: EffectorKind,
  tMs: number,
  target: Vec3,
  fraction: number,
): boolean {
  return (
    e.kind === kind &&
    tMs >= e.readyAtMs &&
    (e.ammo === null || e.ammo > 0) &&
    slantRange(e.pos, target) <= e.rangeM * fraction
  );
}

export function createDefender(scenario: Scenario): Defender {
  const identified = new Set<string>();
  const threats = new Set(scenario.contacts.filter((c) => c.isThreat).map((c) => c.id));
  const classOf = new Map(scenario.contacts.map((c) => [c.id, c.class]));
  const linkOf = new Map(scenario.contacts.map((c) => [c.id, c.controlLink]));

  /** No active non-threat on the same link inside the EW sector (+2° margin) and range. */
  function sectorClear(
    state: Readonly<SimState>,
    eff: EffectorState,
    aim: Vec3,
    link: ControlLink,
  ): boolean {
    const sector = bearingDeg(eff.pos, aim);
    return !state.contacts.some(
      (c) =>
        !threats.has(c.id) &&
        c.status === 'ACTIVE' &&
        !c.defeated &&
        linkOf.get(c.id) === link &&
        slantRange(eff.pos, c.pos) <= eff.rangeM &&
        Math.abs(angleDiffDeg(bearingDeg(eff.pos, c.pos), sector)) <= EW_SECTOR_HALF_DEG + 2,
    );
  }
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
        const tMs = state.clock.tMs;
        const link = linkOf.get(t.contactId) ?? 'NONE';
        const ew = EW_FOR_LINK[link];
        const ewEff =
          ew === undefined
            ? undefined
            : state.effectors.find(
                (e) =>
                  readyInRange(e, ew, tMs, contact.pos, DEFENDER_RANGE_FRACTION) &&
                  sectorClear(state, e, t.pos, link),
              );
        const kineticOk = state.roe !== 'WEAPONS_HOLD' && !inNoKinetic(noKinetic, t.pos.x, t.pos.z);
        const fraction =
          contact.speedMps >= DEFENDER_HOVER_MPS
            ? DEFENDER_INTERCEPT_FRACTION
            : DEFENDER_RANGE_FRACTION;
        const eff =
          ewEff ??
          (kineticOk
            ? state.effectors.find((e) => readyInRange(e, 'INTERCEPT', tMs, contact.pos, fraction))
            : undefined);
        if (eff) {
          out.push({
            type: 'RESPONSE_ORDERED',
            trackId: t.id,
            payload: { response: eff.kind, effectorId: eff.id },
          });
          break; // one order per tick; the cooldown spaces the rest
        }
      }
      return out;
    },
  };
}
