import type { Point2, Zone } from '@vyuh/shared';

// Zone geometry (SPEC §8). NO_KINETIC polygons block INTERCEPT orders on a
// track whose estimated position is inside (decision 69): intercepts resolve
// instantly, so the intercept point is the track position.

/** Distance below which a point counts as on a polygon edge (inside). */
const EDGE_EPS_M = 1e-6;

function onSegment(px: number, pz: number, a: Point2, b: Point2): boolean {
  const [ax, az] = a;
  const [bx, bz] = b;
  const cross = (bx - ax) * (pz - az) - (bz - az) * (px - ax);
  if (Math.abs(cross) > EDGE_EPS_M * Math.hypot(bx - ax, bz - az)) return false;
  return (
    px >= Math.min(ax, bx) - EDGE_EPS_M &&
    px <= Math.max(ax, bx) + EDGE_EPS_M &&
    pz >= Math.min(az, bz) - EDGE_EPS_M &&
    pz <= Math.max(az, bz) + EDGE_EPS_M
  );
}

/** Point-in-polygon (even-odd ray cast); a point on an edge counts as inside. */
export function pointInPolygon(x: number, z: number, polygon: readonly Point2[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    if (a === undefined || b === undefined) continue;
    if (onSegment(x, z, a, b)) return true;
    if (a[1] > z !== b[1] > z && x < ((b[0] - a[0]) * (z - a[1])) / (b[1] - a[1]) + a[0]) {
      inside = !inside;
    }
  }
  return inside;
}

/** NO_KINETIC polygons of a scenario, in zone order. */
export function noKineticPolygons(zones: readonly Zone[]): Point2[][] {
  return zones.flatMap((z) => (z.kind === 'NO_KINETIC' ? [z.polygon] : []));
}

/** True when (x, z) is inside any of the given NO_KINETIC polygons. */
export function inNoKinetic(polygons: readonly (readonly Point2[])[], x: number, z: number) {
  return polygons.some((p) => pointInPolygon(x, z, p));
}
