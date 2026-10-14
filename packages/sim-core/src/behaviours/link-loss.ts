import { CLASS_PROFILES, type ContactSpec } from '@vyuh/shared';
import type { ContactState, ContactStepContext } from '../contacts.ts';
import { bearingDeg, headingVector, horizontalRange } from '../coords.ts';
import type { EventDraft } from '../events.ts';
import { sampleHeight } from '../terrain.ts';

// Reactions of a defeated contact (decision 54). Representative commercial
// failsafe behaviour: on link loss a drone hovers and lands, or returns home;
// a spoofed GNSS drone drifts off its route. None of these reach an asset.

/** HOVER_LAND: hover this long, then descend. */
export const LINK_LOSS_HOVER_MS = 5000;
/** HOVER_LAND descent rate cap, m/s. */
export const LAND_RATE_MPS = 2;
/** Height at which a landing contact counts as down. */
export const TOUCHDOWN_AGL_M = 0.5;
/** DRIFT: lateral offset reached by the end of the route. */
export const DRIFT_MAX_M = 400;
/** RTH: arrival radius at the home point. */
export const RTH_ARRIVAL_M = 10;

function despawn(c: ContactState, tMs: number, out: EventDraft[]): void {
  c.status = 'DESPAWNED';
  c.speedMps = 0;
  out.push({ tMs, type: 'CONTACT_DESPAWNED', contactId: c.id, payload: {} });
}

/** Hover in place, then descend vertically and despawn on touchdown. */
export function stepHoverLand(
  c: ContactState,
  spec: ContactSpec,
  ctx: ContactStepContext,
  out: EventDraft[],
): void {
  c.speedMps = 0;
  c.holdUntilMs ??= ctx.tMs + LINK_LOSS_HOVER_MS;
  if (ctx.tMs < c.holdUntilMs) return;
  const rate = Math.min(LAND_RATE_MPS, CLASS_PROFILES[spec.class].maxClimbMps);
  c.agl = Math.max(c.agl - rate * ctx.dtS, 0);
  c.pos = { ...c.pos, y: sampleHeight(ctx.terrain, c.pos.x, c.pos.z) + c.agl };
  if (c.agl <= TOUCHDOWN_AGL_M) despawn(c, ctx.tMs, out);
}

/** Fly straight back to the first waypoint at the current AGL, then despawn. */
export function stepRth(
  c: ContactState,
  spec: ContactSpec,
  ctx: ContactStepContext,
  out: EventDraft[],
): void {
  const home = spec.path[0];
  if (home === undefined) return despawn(c, ctx.tMs, out);
  const profile = CLASS_PROFILES[spec.class];
  const speed = Math.min(home.speedMps, profile.maxSpeedMps);
  const dist = horizontalRange(c.pos, { x: home.x, y: 0, z: home.z });
  c.speedMps = speed;
  if (dist <= Math.max(RTH_ARRIVAL_M, speed * ctx.dtS)) return despawn(c, ctx.tMs, out);
  c.headingDeg = bearingDeg(c.pos, { x: home.x, y: 0, z: home.z });
  const [east, north] = headingVector(c.headingDeg);
  const x = c.pos.x + east * speed * ctx.dtS;
  const z = c.pos.z + north * speed * ctx.dtS;
  c.pos = { x, y: sampleHeight(ctx.terrain, x, z) + c.agl, z };
}

/** Remaining horizontal route length from the contact through its unflown waypoints. */
export function remainingRouteM(c: ContactState, spec: ContactSpec): number {
  let len = 0;
  let from = c.pos;
  for (const wp of spec.path.slice(c.wpIndex)) {
    const to = { x: wp.x, y: 0, z: wp.z };
    len += horizontalRange(from, to);
    from = to;
  }
  return len;
}

/**
 * Start a GNSS drift: the route is shifted to the right of the current heading
 * by an offset growing linearly to DRIFT_MAX_M over the remaining route.
 */
export function startDrift(c: ContactState, spec: ContactSpec, tMs: number): void {
  const speed = Math.max(c.speedMps, 1);
  const durS = Math.max(remainingRouteM(c, spec) / speed, 1);
  const [east, north] = headingVector(c.headingDeg + 90);
  c.drift = { ex: east, ez: north, rateMps: DRIFT_MAX_M / durS, startMs: tMs };
}

/** Current lateral drift offset [dx, dz] in metres (0 without drift). */
export function driftOffset(c: Readonly<ContactState>, tMs: number): [number, number] {
  if (c.drift === null) return [0, 0];
  const d = Math.min(DRIFT_MAX_M, (c.drift.rateMps * (tMs - c.drift.startMs)) / 1000);
  return [c.drift.ex * d, c.drift.ez * d];
}
