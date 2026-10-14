import { CLASS_PROFILES, type ContactSpec } from '@vyuh/shared';
import type { ContactState } from './contacts.ts';
import { bearingDeg, headingVector } from './coords.ts';
import type { Rng, RandomStream } from './rng.ts';
import { sampleHeight, type Heightmap } from './terrain.ts';

// Bird flocks (SPEC §5, §7): the lowest-id member of each BIRD_FLOCK group is
// the leader and flies the group's path; the others are boids (Reynolds 1987):
// separation / alignment / cohesion + leader-follow with fixed weights, plus a
// random altitude wander on stream `birds:<groupId>` (one draw per active
// follower per tick). Two-phase update in id order, so the result does not
// depend on iteration order.

export const BOID_NEIGHBOUR_M = 80;
export const BOID_SEPARATION_M = 12;
/** Acceleration weights: separation (m/s²), alignment (1/s), cohesion and leader (1/s²). */
export const BOID_W_SEPARATION = 6;
export const BOID_W_ALIGNMENT = 0.8;
export const BOID_W_COHESION = 0.02;
export const BOID_W_LEADER = 0.03;
export const BOID_MIN_SPEED_MPS = 2;
/** Followers never fly below this height above ground. */
export const BIRD_MIN_AGL_M = 5;
/** Altitude wander: random-walk step per tick and its limit around the leader's AGL. */
export const BIRD_WANDER_STEP_M = 0.5;
export const BIRD_WANDER_MAX_M = 15;

export interface Flock {
  readonly groupId: string;
  readonly leaderId: string;
  /** Sorted by id. */
  readonly followerIds: readonly string[];
  readonly stream: RandomStream;
  /** Follower id → current altitude offset from the leader's AGL. */
  readonly wander: Map<string, number>;
}

/** One flock per BIRD_FLOCK groupId (contacts must be sorted by id). */
export function createFlocks(specs: readonly ContactSpec[], rng: Rng): Flock[] {
  const groups = new Map<string, string[]>();
  for (const s of specs) {
    if (s.behaviour !== 'BIRD_FLOCK' || s.groupId === undefined) continue;
    const ids = groups.get(s.groupId) ?? [];
    ids.push(s.id);
    groups.set(s.groupId, ids);
  }
  return [...groups.keys()].sort().flatMap((groupId) => {
    const ids = [...(groups.get(groupId) ?? [])].sort();
    const [leaderId, ...followerIds] = ids;
    if (leaderId === undefined || followerIds.length === 0) return [];
    return [
      {
        groupId,
        leaderId,
        followerIds,
        stream: rng.stream(`birds:${groupId}`),
        wander: new Map(followerIds.map((id) => [id, 0])),
      },
    ];
  });
}

interface Snap {
  readonly x: number;
  readonly z: number;
  readonly vx: number;
  readonly vz: number;
}

function snapOf(c: ContactState): Snap {
  const [e, n] = headingVector(c.headingDeg);
  return { x: c.pos.x, z: c.pos.z, vx: e * c.speedMps, vz: n * c.speedMps };
}

/** Advance the active followers of one flock by one tick. */
export function stepFlock(
  flock: Flock,
  contactsById: ReadonlyMap<string, ContactState>,
  specsById: ReadonlyMap<string, ContactSpec>,
  terrain: Heightmap,
  dtS: number,
): void {
  const leader = contactsById.get(flock.leaderId);
  const leaderActive = leader?.status === 'ACTIVE';
  const members = [flock.leaderId, ...flock.followerIds]
    .map((id) => contactsById.get(id))
    .filter((c): c is ContactState => c?.status === 'ACTIVE');
  const snaps = new Map(members.map((c) => [c.id, snapOf(c)]));

  // Phase 1: new velocities from the snapshot.
  const next = new Map<string, { vx: number; vz: number }>();
  for (const id of flock.followerIds) {
    const me = snaps.get(id);
    if (me === undefined) continue;
    let sepX = 0;
    let sepZ = 0;
    let n = 0;
    let sumVx = 0;
    let sumVz = 0;
    let sumX = 0;
    let sumZ = 0;
    for (const other of members) {
      if (other.id === id) continue;
      const o = snaps.get(other.id);
      if (o === undefined) continue;
      const dx = me.x - o.x;
      const dz = me.z - o.z;
      const d = Math.hypot(dx, dz);
      if (d < BOID_NEIGHBOUR_M) {
        n++;
        sumVx += o.vx;
        sumVz += o.vz;
        sumX += o.x;
        sumZ += o.z;
      }
      if (d < BOID_SEPARATION_M && d > 1e-6) {
        const w = (BOID_SEPARATION_M - d) / BOID_SEPARATION_M / d;
        sepX += dx * w;
        sepZ += dz * w;
      }
    }
    let ax = BOID_W_SEPARATION * sepX;
    let az = BOID_W_SEPARATION * sepZ;
    if (n > 0) {
      ax += BOID_W_ALIGNMENT * (sumVx / n - me.vx) + BOID_W_COHESION * (sumX / n - me.x);
      az += BOID_W_ALIGNMENT * (sumVz / n - me.vz) + BOID_W_COHESION * (sumZ / n - me.z);
    }
    if (leaderActive && leader !== undefined) {
      ax += BOID_W_LEADER * (leader.pos.x - me.x);
      az += BOID_W_LEADER * (leader.pos.z - me.z);
    }
    let vx = me.vx + ax * dtS;
    let vz = me.vz + az * dtS;
    const spec = specsById.get(id);
    const maxSpeed = spec ? CLASS_PROFILES[spec.class].maxSpeedMps : BOID_MIN_SPEED_MPS;
    const speed = Math.hypot(vx, vz);
    const clamped = Math.min(Math.max(speed, BOID_MIN_SPEED_MPS), maxSpeed);
    if (speed > 1e-9) {
      vx *= clamped / speed;
      vz *= clamped / speed;
    } else if (leaderActive && leader !== undefined) {
      [vx, vz] = headingVector(leader.headingDeg).map((v) => v * clamped) as [number, number];
    }
    next.set(id, { vx, vz });
  }

  // Phase 2: move, then altitude wander (one draw per active follower, id order).
  for (const id of flock.followerIds) {
    const c = contactsById.get(id);
    const v = next.get(id);
    if (c === undefined || v === undefined) continue;
    const spec = specsById.get(id);
    const maxClimb = spec ? CLASS_PROFILES[spec.class].maxClimbMps : 2;
    const u = flock.stream.next();
    const w = Math.max(
      -BIRD_WANDER_MAX_M,
      Math.min(BIRD_WANDER_MAX_M, (flock.wander.get(id) ?? 0) + (2 * u - 1) * BIRD_WANDER_STEP_M),
    );
    flock.wander.set(id, w);
    const refAgl = leaderActive && leader !== undefined ? leader.agl : c.agl;
    const targetAgl = Math.max(refAgl + w, BIRD_MIN_AGL_M);
    const climb = maxClimb * dtS;
    c.agl = Math.max(c.agl + Math.max(-climb, Math.min(climb, targetAgl - c.agl)), BIRD_MIN_AGL_M);
    const x = c.pos.x + v.vx * dtS;
    const z = c.pos.z + v.vz * dtS;
    c.speedMps = Math.hypot(v.vx, v.vz);
    if (c.speedMps > 1e-9)
      c.headingDeg = bearingDeg({ x: 0, y: 0, z: 0 }, { x: v.vx, y: 0, z: v.vz });
    c.pos = { x, y: sampleHeight(terrain, x, z) + c.agl, z };
  }
}
