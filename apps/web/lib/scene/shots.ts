import type { Scenario } from '@vyuh/shared';

// Camera shots of a scenario (UI plan §3.8). Pure, so stills, the live briefing
// and tests agree on the same frame. Metres; x east, z north.

export type Shot = 'establishing' | 'low';

export interface ShotPose {
  /** Camera position: x east, z north, height above the local ground. */
  x: number;
  z: number;
  aboveGroundM: number;
  /** Look-at point on the ground. */
  targetX: number;
  targetZ: number;
  fovDeg: number;
}

/** Unit vector from the defended site toward where the first threat comes from. */
export function threatAxis(scenario: Scenario): { x: number; z: number } {
  const asset = scenario.assets[0];
  const threat = scenario.contacts.find((c) => c.isThreat) ?? scenario.contacts[0];
  const start = threat?.path[0];
  const ax = asset?.x ?? 0;
  const az = asset?.z ?? 0;
  if (!start) return { x: 0, z: 1 };
  const dx = start.x - ax;
  const dz = start.z - az;
  const len = Math.hypot(dx, dz);
  return len < 1 ? { x: 0, z: 1 } : { x: dx / len, z: dz / len };
}

export function shotPose(scenario: Scenario, shot: Shot): ShotPose {
  const asset = scenario.assets[0];
  const ax = asset?.x ?? 0;
  const az = asset?.z ?? 0;
  const axis = threatAxis(scenario);
  if (shot === 'low') {
    return {
      x: ax - axis.x * 260,
      z: az - axis.z * 260,
      aboveGroundM: 90,
      targetX: ax + axis.x * 2400,
      targetZ: az + axis.z * 2400,
      fovDeg: 42,
    };
  }
  return {
    x: ax - axis.x * 3400,
    z: az - axis.z * 3400,
    aboveGroundM: 1900,
    targetX: ax + axis.x * 600,
    targetZ: az + axis.z * 600,
    fovDeg: 42,
  };
}
