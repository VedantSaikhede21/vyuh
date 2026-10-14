// Where a track estimate falls in the EO picture (DESIGN §11.5 cue box and
// off-screen arrow). Pinhole camera on the EO mast; scenario frame x east,
// y up, z north (SPEC §4). Pure, unit-tested.

export interface EoProjection {
  /** Normalised device coords: −1..1 left→right, −1..1 bottom→top. */
  ndcX: number;
  ndcY: number;
  /** Inside the picture (and in front of the camera). */
  onScreen: boolean;
  /** Screen-space direction to the target, radians, 0 = right, π/2 = up (for the edge arrow). */
  angleRad: number;
}

const D = Math.PI / 180;

export function projectToEo(
  mast: { x: number; y: number; z: number },
  target: { x: number; y: number; z: number },
  azDeg: number,
  elDeg: number,
  hfovDeg: number,
  vfovDeg: number,
): EoProjection {
  const az = azDeg * D;
  const el = elDeg * D;
  const vx = target.x - mast.x;
  const vy = target.y - mast.y;
  const vz = target.z - mast.z;
  // Camera basis: forward, right, up.
  const f = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)] as const;
  const r = [Math.cos(az), 0, -Math.sin(az)] as const;
  const u = [-Math.sin(az) * Math.sin(el), Math.cos(el), -Math.cos(az) * Math.sin(el)] as const;
  const dot = (a: readonly number[]) => a[0]! * vx + a[1]! * vy + a[2]! * vz;
  const fwd = dot(f);
  const right = dot(r);
  const up = dot(u);
  const angleRad = Math.atan2(up, right);
  if (fwd <= 1e-6) {
    // Behind the camera: only the direction is meaningful.
    return {
      ndcX: Math.cos(angleRad) * 2,
      ndcY: Math.sin(angleRad) * 2,
      onScreen: false,
      angleRad,
    };
  }
  const ndcX = right / fwd / Math.tan((hfovDeg * D) / 2);
  const ndcY = up / fwd / Math.tan((vfovDeg * D) / 2);
  return { ndcX, ndcY, onScreen: Math.abs(ndcX) <= 1 && Math.abs(ndcY) <= 1, angleRad };
}

/**
 * Point on the picture border (pixels from the top-left) along the direction
 * to an off-screen target, inset so an arrow fits.
 */
export function edgePoint(
  angleRad: number,
  width: number,
  height: number,
  inset: number,
): { left: number; top: number } {
  const hw = width / 2 - inset;
  const hh = height / 2 - inset;
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const s = Math.min(hw / Math.max(Math.abs(dx), 1e-6), hh / Math.max(Math.abs(dy), 1e-6));
  return { left: width / 2 + dx * s, top: height / 2 - dy * s };
}
