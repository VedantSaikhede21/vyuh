import {
  ThreatClass,
  type Behaviour,
  type ContactSpec,
  type EffectorConfig,
  type EffectorKind,
  type Point2,
  type ResponseResult,
  type Roe,
} from '@vyuh/shared';
import { startDrift } from './behaviours/link-loss.ts';
import type { ContactControl, ContactState } from './contacts.ts';
import { angleDiffDeg, bearingDeg, slantRange, type Vec3 } from './coords.ts';
import type { RandomStream } from './rng.ts';
import type { TrackState } from './tracks.ts';
import { inNoKinetic } from './zones.ts';

// Abstract effectors (SPEC §8): INTERCEPT (range-based Pkill, ROE- and
// NO_KINETIC-gated) and
// EW_JAM / EW_SPOOF (a ±10° sector, not ROE-gated; decision 54). All rolls use
// the `effectors` stream and are drawn only when the effector actually fires.

export interface EffectorState {
  readonly id: string;
  readonly kind: EffectorKind;
  readonly pos: Vec3;
  readonly rangeM: number;
  readonly cooldownMs: number;
  /** Rounds left; null = unlimited. */
  ammo: number | null;
  /** Sim time at which the effector can fire again. */
  readyAtMs: number;
}

export function createEffectorState(cfg: EffectorConfig, groundY: number): EffectorState {
  return {
    id: cfg.id,
    kind: cfg.kind,
    pos: { x: cfg.x, y: groundY + (cfg.y ?? 0), z: cfg.z },
    rangeM: cfg.rangeM,
    cooldownMs: Math.round(cfg.cooldownS * 1000),
    ammo: cfg.ammo ?? null,
    readyAtMs: 0,
  };
}

export const PKILL_MAX = 0.9;
export const PKILL_MIN = 0.4;

/** Pkill falls off with the square of range fraction: 0.9 close in, 0.4 at max range. */
export function interceptPkill(rangeM: number, maxRangeM: number): number {
  const f = Math.min(Math.max(rangeM / maxRangeM, 0), 1);
  return PKILL_MAX - (PKILL_MAX - PKILL_MIN) * f * f;
}

const THREAT_CLASSES: ReadonlySet<string> = new Set(ThreatClass.options);

/**
 * ROE gate for kinetic responses (SPEC §8). WEAPONS_TIGHT needs the trainee to
 * have classified the track as a threat class and declared it HOSTILE.
 */
export function roeAllowsIntercept(roe: Roe, track: Readonly<TrackState>): boolean {
  if (roe === 'WEAPONS_FREE') return true;
  if (roe === 'WEAPONS_TIGHT') {
    return (
      track.affiliation === 'HOSTILE' &&
      track.classifiedAs !== null &&
      THREAT_CLASSES.has(track.classifiedAs)
    );
  }
  return false;
}

/**
 * Resolve an INTERCEPT order against the contact behind a track. Mutates the
 * effector (ammo, cooldown) and the contact (status) and returns the result.
 * Gates in order: ROE, then NO_KINETIC (the track's estimated position, which
 * the operator knows), then cooldown and ammo; a blocked order spends nothing.
 * The Pkill roll is drawn only when a round is actually fired.
 */
export function resolveIntercept(
  eff: EffectorState,
  track: Readonly<TrackState>,
  contact: ContactState,
  roe: Roe,
  tMs: number,
  stream: RandomStream,
  noKinetic: readonly (readonly Point2[])[] = [],
): ResponseResult {
  if (!roeAllowsIntercept(roe, track)) return 'BLOCKED_BY_ROE';
  if (noKinetic.length > 0 && inNoKinetic(noKinetic, track.pos.x, track.pos.z)) {
    return 'BLOCKED_NO_KINETIC';
  }
  if (tMs < eff.readyAtMs) return 'COOLDOWN';
  if (eff.ammo !== null && eff.ammo <= 0) return 'NO_AMMO';
  // A contact already defeated by EW is not worth a round (decision 54).
  if (contact.status !== 'ACTIVE' || contact.defeated) return 'NO_EFFECT';
  const range = slantRange(eff.pos, contact.pos);
  if (range > eff.rangeM) return 'OUT_OF_RANGE';

  if (eff.ammo !== null) eff.ammo -= 1;
  eff.readyAtMs = tMs + eff.cooldownMs;
  if (stream.next() < interceptPkill(range, eff.rangeM)) {
    contact.status = 'NEUTRALISED';
    contact.speedMps = 0;
    return 'NEUTRALISED';
  }
  return 'MISSED';
}

// ---- EW (SPEC §8, decision 54) ---------------------------------------------------

/** Half-width of the jam / spoof sector around the bearing to the ordered track. */
export const EW_SECTOR_HALF_DEG = 10;
export const JAM_P = 0.9;
export const SPOOF_P = 0.8;

/** Link-loss reaction to a successful jam, by behaviour (representative failsafes). */
export function jamReaction(behaviour: Behaviour): ContactControl {
  return behaviour === 'ATTACK_RUN' || behaviour === 'SWARM_SATURATION' ? 'HOVER_LAND' : 'RTH';
}

export interface EwOutcome {
  readonly result: ResponseResult;
  /** Every contact the effector defeated, in id order (the ordered one included). */
  readonly affected: readonly string[];
}

/**
 * Resolve an EW_JAM or EW_SPOOF order. The sector is ±10° around the bearing
 * from the effector to the ordered track's estimate, out to rangeM. Every
 * susceptible contact in it (jam: RF_MANUAL; spoof: AUTONOMOUS_GNSS) — friendly
 * and civilian included — is rolled in id order; a success defeats it (jam →
 * hover-land or RTH, spoof → drift). Result for the ordered contact: NEUTRALISED
 * if defeated, MISSED if susceptible but the roll failed, NO_EFFECT otherwise.
 */
export function resolveEw(
  eff: EffectorState,
  track: Readonly<TrackState>,
  contacts: readonly ContactState[],
  specs: ReadonlyMap<string, ContactSpec>,
  tMs: number,
  stream: RandomStream,
): EwOutcome {
  const none = (result: ResponseResult): EwOutcome => ({ result, affected: [] });
  if (tMs < eff.readyAtMs) return none('COOLDOWN');
  if (eff.ammo !== null && eff.ammo <= 0) return none('NO_AMMO');
  const target = contacts.find((c) => c.id === track.contactId);
  if (target === undefined || target.status !== 'ACTIVE' || target.defeated) {
    return none('NO_EFFECT');
  }
  if (slantRange(eff.pos, target.pos) > eff.rangeM) return none('OUT_OF_RANGE');

  if (eff.ammo !== null) eff.ammo -= 1;
  eff.readyAtMs = tMs + eff.cooldownMs;
  const link = eff.kind === 'EW_JAM' ? 'RF_MANUAL' : 'AUTONOMOUS_GNSS';
  const p = eff.kind === 'EW_JAM' ? JAM_P : SPOOF_P;
  const sectorDeg = bearingDeg(eff.pos, track.pos);
  const affected: string[] = [];
  let targetRolled = false;
  for (const c of contacts) {
    const spec = specs.get(c.id);
    if (spec === undefined || c.status !== 'ACTIVE' || c.defeated) continue;
    if (spec.controlLink !== link) continue;
    if (slantRange(eff.pos, c.pos) > eff.rangeM) continue;
    if (Math.abs(angleDiffDeg(bearingDeg(eff.pos, c.pos), sectorDeg)) > EW_SECTOR_HALF_DEG) {
      continue;
    }
    if (c.id === target.id) targetRolled = true;
    if (stream.next() >= p) continue;
    affected.push(c.id);
    c.defeated = true;
    c.holdUntilMs = null;
    c.pendingAction = null;
    c.diving = false;
    if (eff.kind === 'EW_JAM') {
      c.control = jamReaction(spec.behaviour);
    } else {
      c.control = 'DRIFT';
      startDrift(c, spec, tMs);
    }
  }
  const result = affected.includes(target.id)
    ? 'NEUTRALISED'
    : targetRolled
      ? 'MISSED'
      : 'NO_EFFECT';
  return { result, affected };
}
