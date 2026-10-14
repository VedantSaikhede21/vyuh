import { CLASS_PROFILES, type Asset, type ContactSpec, type Waypoint } from '@vyuh/shared';
import {
  angleDiffDeg,
  bearingDeg,
  headingVector,
  horizontalRange,
  slantRange,
  wrapDeg,
  type Vec3,
} from './coords.ts';
import type { EventDraft } from './events.ts';
import { sampleHeight, type Heightmap } from './terrain.ts';

// Waypoint kinematics (SPEC §5): fly toward the next waypoint at its speed with
// a per-class turn-rate and climb-rate limit; altitude is held AGL over the
// heightmap. A DIVE waypoint ends the path with a straight terminal dive.

export type ContactStatus = 'PENDING' | 'ACTIVE' | 'NEUTRALISED' | 'REACHED_ASSET' | 'DESPAWNED';

export interface ContactState {
  readonly id: string;
  status: ContactStatus;
  /** Scenario frame; y = terrain height + agl. */
  pos: Vec3;
  agl: number;
  headingDeg: number;
  speedMps: number;
  /** Index into spec.path of the waypoint being flown to; ≥ path.length = path done. */
  wpIndex: number;
  /** Hovering at a waypoint until this sim time. */
  holdUntilMs: number | null;
  diving: boolean;
}

/** Terminal dive starts when horizontal distance ≤ AGL × this (≈ 34° dive). */
export const DIVE_START_RATIO = 1.5;

export interface ContactStepContext {
  readonly terrain: Heightmap;
  /** Preset origin elevation (m MSL), for `altRef: 'MSL'` waypoints. */
  readonly originElevM?: number;
  /** Sorted by id. */
  readonly assets: readonly Asset[];
  readonly tMs: number;
  readonly dtS: number;
}

export function createContactState(spec: ContactSpec): ContactState {
  return {
    id: spec.id,
    status: 'PENDING',
    pos: { x: 0, y: 0, z: 0 },
    agl: 0,
    headingDeg: 0,
    speedMps: 0,
    wpIndex: 0,
    holdUntilMs: null,
    diving: false,
  };
}

/** Waypoint height in the scenario frame: AGL over the terrain, or MSL − origin elevation. */
function waypointY(terrain: Heightmap, wp: Waypoint, originElevM: number): number {
  return wp.altRef === 'MSL' ? wp.y - originElevM : sampleHeight(terrain, wp.x, wp.z) + wp.y;
}

function waypointPos(terrain: Heightmap, wp: Waypoint, originElevM: number): Vec3 {
  return { x: wp.x, y: waypointY(terrain, wp, originElevM), z: wp.z };
}

/** Height above ground the contact should hold at (x, z) while flying to wp. */
function targetAglAt(
  terrain: Heightmap,
  wp: Waypoint,
  originElevM: number,
  x: number,
  z: number,
): number {
  if (wp.altRef !== 'MSL') return wp.y;
  return Math.max(wp.y - originElevM - sampleHeight(terrain, x, z), 0);
}

function spawn(c: ContactState, spec: ContactSpec, ctx: ContactStepContext): void {
  const first = spec.path[0];
  if (first === undefined) throw new RangeError(`Contact ${spec.id} has an empty path`);
  c.status = 'ACTIVE';
  c.agl = targetAglAt(ctx.terrain, first, ctx.originElevM ?? 0, first.x, first.z);
  c.pos = {
    x: first.x,
    y: sampleHeight(ctx.terrain, first.x, first.z) + c.agl,
    z: first.z,
  };
  c.speedMps = 0;
  c.wpIndex = 1;
  const next = spec.path[1];
  c.headingDeg = next ? bearingDeg(c.pos, next) : 0;
}

/** Arrival radius: never smaller than one tick of travel or the turning radius. */
function arrivalRadius(speedMps: number, turnRateDegS: number, dtS: number): number {
  const turnRadius = speedMps / ((turnRateDegS * Math.PI) / 180);
  return Math.max(speedMps * dtS, turnRadius * 1.1, 3);
}

function finishPath(
  c: ContactState,
  spec: ContactSpec,
  ctx: ContactStepContext,
  out: EventDraft[],
): void {
  const last = spec.path.at(-1);
  if (last?.action !== 'DIVE') return; // hover at the last waypoint until despawn
  const asset = ctx.assets.find((a) => Math.hypot(a.x - c.pos.x, a.z - c.pos.z) <= a.radiusM);
  if (asset) {
    c.status = 'REACHED_ASSET';
    out.push({
      tMs: ctx.tMs,
      type: 'CONTACT_REACHED_ASSET',
      contactId: c.id,
      payload: { assetId: asset.id },
    });
  } else {
    c.status = 'DESPAWNED';
    out.push({ tMs: ctx.tMs, type: 'CONTACT_DESPAWNED', contactId: c.id, payload: {} });
  }
  c.speedMps = 0;
}

function arrive(
  c: ContactState,
  spec: ContactSpec,
  wp: Waypoint,
  ctx: ContactStepContext,
  out: EventDraft[],
): void {
  c.wpIndex += 1;
  c.diving = false;
  if (wp.holdS !== undefined && wp.holdS > 0) {
    c.holdUntilMs = ctx.tMs + Math.round(wp.holdS * 1000);
    c.speedMps = 0;
  }
  if (c.wpIndex >= spec.path.length) finishPath(c, spec, ctx, out);
}

/** Advance one contact by one tick; returns the events it produced. */
export function stepContact(
  c: ContactState,
  spec: ContactSpec,
  ctx: ContactStepContext,
): EventDraft[] {
  const out: EventDraft[] = [];
  if (c.status === 'PENDING') {
    if (ctx.tMs >= spec.spawnTMs) {
      spawn(c, spec, ctx);
      out.push({ tMs: ctx.tMs, type: 'CONTACT_SPAWNED', contactId: c.id, payload: {} });
    }
    return out;
  }
  if (c.status !== 'ACTIVE') return out;

  if (spec.despawnTMs !== undefined && ctx.tMs >= spec.despawnTMs) {
    c.status = 'DESPAWNED';
    c.speedMps = 0;
    out.push({ tMs: ctx.tMs, type: 'CONTACT_DESPAWNED', contactId: c.id, payload: {} });
    return out;
  }

  if (c.holdUntilMs !== null) {
    if (ctx.tMs < c.holdUntilMs) return out;
    c.holdUntilMs = null;
  }
  const wp = spec.path[c.wpIndex];
  if (wp === undefined) {
    c.speedMps = 0;
    return out;
  }

  const profile = CLASS_PROFILES[spec.class];
  const speed = Math.min(wp.speedMps, profile.maxSpeedMps);
  const target = waypointPos(ctx.terrain, wp, ctx.originElevM ?? 0);
  const step = speed * ctx.dtS;
  c.speedMps = speed;

  if (
    wp.action === 'DIVE' &&
    !c.diving &&
    horizontalRange(c.pos, target) <=
      Math.max(wp.altRef === 'MSL' ? c.pos.y - target.y : c.agl - wp.y, 10) * DIVE_START_RATIO
  ) {
    c.diving = true;
  }

  if (c.diving) {
    // Straight-line terminal dive; no turn or climb limit.
    const dist = slantRange(c.pos, target);
    if (horizontalRange(c.pos, target) > 1e-6) c.headingDeg = bearingDeg(c.pos, target);
    if (dist <= step) {
      c.pos = target;
    } else {
      const f = step / dist;
      c.pos = {
        x: c.pos.x + (target.x - c.pos.x) * f,
        y: c.pos.y + (target.y - c.pos.y) * f,
        z: c.pos.z + (target.z - c.pos.z) * f,
      };
    }
    c.agl = c.pos.y - sampleHeight(ctx.terrain, c.pos.x, c.pos.z);
    if (dist <= step) arrive(c, spec, wp, ctx, out);
    return out;
  }

  const maxTurn = profile.maxTurnRateDegS * ctx.dtS;
  const turn = angleDiffDeg(bearingDeg(c.pos, target), c.headingDeg);
  c.headingDeg = wrapDeg(c.headingDeg + Math.max(-maxTurn, Math.min(maxTurn, turn)));
  const [east, north] = headingVector(c.headingDeg);
  const x = c.pos.x + east * step;
  const z = c.pos.z + north * step;
  // Cruise altitude is held toward a DIVE waypoint; the dive itself descends.
  const targetAgl =
    wp.action === 'DIVE' ? c.agl : targetAglAt(ctx.terrain, wp, ctx.originElevM ?? 0, x, z);
  const maxClimb = profile.maxClimbMps * ctx.dtS;
  c.agl += Math.max(-maxClimb, Math.min(maxClimb, targetAgl - c.agl));
  c.pos = { x, y: sampleHeight(ctx.terrain, x, z) + c.agl, z };

  if (horizontalRange(c.pos, target) <= arrivalRadius(speed, profile.maxTurnRateDegS, ctx.dtS)) {
    arrive(c, spec, wp, ctx, out);
  }
  return out;
}
