import type { EffectorConfig, EffectorKind, ResponseResult, Roe } from '@vyuh/shared';
import type { ContactState } from './contacts.ts';
import { slantRange, type Vec3 } from './coords.ts';
import type { RandomStream } from './rng.ts';
import type { TrackState } from './tracks.ts';

// Abstract effectors (SPEC §8). Phase 1 implements INTERCEPT only: range,
// ammo, cooldown and a range-based Pkill rolled on the `effectors` stream.

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

/** ROE gate for kinetic responses. WEAPONS_TIGHT needs a trainee HOSTILE call. */
export function roeAllowsIntercept(roe: Roe, track: Readonly<TrackState>): boolean {
  if (roe === 'WEAPONS_FREE') return true;
  if (roe === 'WEAPONS_TIGHT') return track.affiliation === 'HOSTILE';
  return false;
}

/**
 * Resolve an INTERCEPT order against the contact behind a track. Mutates the
 * effector (ammo, cooldown) and the contact (status) and returns the result.
 * The Pkill roll is drawn only when a round is actually fired.
 */
export function resolveIntercept(
  eff: EffectorState,
  track: Readonly<TrackState>,
  contact: ContactState,
  roe: Roe,
  tMs: number,
  stream: RandomStream,
): ResponseResult {
  if (!roeAllowsIntercept(roe, track)) return 'BLOCKED_BY_ROE';
  if (tMs < eff.readyAtMs) return 'COOLDOWN';
  if (eff.ammo !== null && eff.ammo <= 0) return 'NO_AMMO';
  if (contact.status !== 'ACTIVE') return 'NO_EFFECT';
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
