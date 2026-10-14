// Coordinate helpers. Sim positions use the scenario frame: x = east (m),
// z = north (m), y = height above the terrain datum (m, i.e. terrain + AGL).
// This file is the ONLY place the Three.js flip (z = -north) happens.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Scenario frame → Three.js world (x = east, y = up, z = -north). */
export function toThree(p: Readonly<Vec3>): Vec3 {
  return { x: p.x, y: p.y, z: -p.z };
}

/** Three.js world → scenario frame. */
export function fromThree(p: Readonly<Vec3>): Vec3 {
  return { x: p.x, y: p.y, z: -p.z };
}

/** Normalise an angle to [0, 360). */
export function wrapDeg(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d === 360 ? 0 : d;
}

/** Signed smallest difference a − b in (−180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  const d = wrapDeg(a - b);
  return d > 180 ? d - 360 : d;
}

/** Compass bearing (0 = north, clockwise) from one point to another, degrees in [0, 360). */
export function bearingDeg(from: Readonly<Vec3>, to: Readonly<Vec3>): number {
  return wrapDeg((Math.atan2(to.x - from.x, to.z - from.z) * 180) / Math.PI);
}

/** Heading (compass degrees) → unit [east, north]. */
export function headingVector(headingDeg: number): [number, number] {
  const r = (headingDeg * Math.PI) / 180;
  return [Math.sin(r), Math.cos(r)];
}

export function horizontalRange(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(b.x - a.x, b.z - a.z);
}

export function slantRange(a: Readonly<Vec3>, b: Readonly<Vec3>): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}
