// Selected-track framing for the tactical view (audit P0-6). Pure maths, so it
// is unit-tested; the scene component (components/sim/selected-framing.tsx)
// applies it to the orbit camera.
//
// Three.js frame: x east, y up, z = −north. The orbit camera sits on a sphere
// around its target: position = target + r · (sin φ sin θ, cos φ, sin φ cos θ).

export interface Orbit {
  /** Azimuth θ, radians (three.js Spherical convention). */
  theta: number;
  /** Polar angle φ from straight up, radians. */
  phi: number;
  radius: number;
}

/** Ease length: under 300 ms, since Tab triggers it often; reduced motion jumps (DESIGN §7). */
export const FRAMING_MS = 300;
/** No automatic re-aim this long after the trainee last orbited or zoomed. */
export const HANDS_OFF_MS = 5_000;
/** How often an already selected track is checked for being out of frame. */
export const FRAMING_CHECK_MS = 1_000;
/** A track counts as in frame inside this share of the view (NDC), not at its very edge. */
export const IN_FRAME_NDC = 0.85;

/**
 * Azimuth that puts the camera behind the target, looking towards the track
 * (the defended position in the foreground, the track beyond it).
 */
export function azimuthBehind(target: { x: number; z: number }, track: { x: number; z: number }) {
  return Math.atan2(-(track.x - target.x), -(track.z - target.z));
}

/** Shortest signed turn from `from` to `to`, radians in (−π, π]. */
export function shortestTurn(from: number, to: number): number {
  let d = (to - from) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}

/** Strong ease-out (quint): the move starts at once and settles softly. */
export const easeOut = (t: number) => 1 - (1 - Math.min(Math.max(t, 0), 1)) ** 5;

/** The orbit at `t` (0..1) of an ease from `a` to `b`, turning the short way round. */
export function orbitAt(a: Orbit, b: Orbit, t: number): Orbit {
  const k = easeOut(t);
  return {
    theta: a.theta + shortestTurn(a.theta, b.theta) * k,
    phi: a.phi + (b.phi - a.phi) * k,
    radius: a.radius + (b.radius - a.radius) * k,
  };
}

export function inFrame(ndc: { x: number; y: number; z: number }): boolean {
  return (
    ndc.z > -1 && ndc.z < 1 && Math.abs(ndc.x) <= IN_FRAME_NDC && Math.abs(ndc.y) <= IN_FRAME_NDC
  );
}

/**
 * Label placement inside the view: the label's top-left so a `w × h` label
 * centred above (px, py) never leaves a `vw × vh` view (`pad` px margin).
 */
export function clampLabel(
  px: number,
  py: number,
  w: number,
  h: number,
  vw: number,
  vh: number,
  pad = 4,
): { left: number; top: number } {
  const left = Math.min(Math.max(px - w / 2, pad), Math.max(pad, vw - w - pad));
  const top = Math.min(Math.max(py - h, pad), Math.max(pad, vh - h - pad));
  return { left, top };
}
