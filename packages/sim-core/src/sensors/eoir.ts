import type { EoIrSensor, EoLevel, EoMode } from '@vyuh/shared';
import type { Vec3 } from '../coords.ts';

// EO/IR camera (SPEC §6.2). Pixels on target = size / (range × IFOV), Johnson
// cycles = pixels / 2, scaled by the class's thermal contrast in IR mode.
// DETECT ≥ 1, RECOGNISE ≥ 4, IDENTIFY ≥ 6.4 cycles. The day camera is capped by
// visibility and useless at night; IR sees 1.5× further through haze.

export const JOHNSON_CYCLES: Readonly<Record<EoLevel, number>> = {
  DETECT: 1,
  RECOGNISE: 4,
  IDENTIFY: 6.4,
};
export const EO_LEVEL_RANK: Readonly<Record<EoLevel, number>> = {
  DETECT: 1,
  RECOGNISE: 2,
  IDENTIFY: 3,
};
/** IR range cap as a multiple of visibilityM (thermal sees better through haze, not fog). */
export const IR_VISIBILITY_FACTOR = 1.5;
/** A pointing episode ends after a contact has had no level for this long. */
export const EO_EPISODE_RESET_MS = 1000;
/** How fast a locked camera closes the gap to its track, per second. */
export const CAMERA_FOLLOW_RATE = 4;

// EO video auto-track (decision 52): radar cues the camera (CUE); once the cued
// contact is seen near the frame centre the EO tracker holds it (TRACK).
/** CUE → TRACK after the contact has been at ≥ DETECT inside the central half this long. */
export const EO_ACQUIRE_MS = 500;
/** TRACK → CUE after the contact has had no EO level for longer than this. */
export const EO_TRACK_DROP_MS = 1000;
/** Fraction of the frame half-size that counts as "central" for acquisition. */
export const EO_ACQUIRE_FRAME_FRACTION = 0.5;
/** Tracker jitter, 1σ per axis, as a fraction of the horizontal FOV. */
export const EO_TRACK_JITTER_FOV = 0.02;

/** MANUAL = trainee pointing; CUE = following a radar track; TRACK = EO tracker holds the contact. */
export type EoTrackMode = 'MANUAL' | 'CUE' | 'TRACK';

export interface EoCameraState {
  azDeg: number;
  elDeg: number;
  /** fovDegMax / current horizontal FOV (1 = widest). */
  zoom: number;
  mode: EoMode;
  /** Track the camera is locked on; null = manual pointing. */
  lockTrackId: string | null;
  trackMode: EoTrackMode;
}

export interface EoConditions {
  readonly isNight: boolean;
  readonly visibilityM: number;
}

export function eoHfovDeg(sensor: Pick<EoIrSensor, 'fovDegMin' | 'fovDegMax'>, zoom: number) {
  return Math.min(
    Math.max(sensor.fovDegMax / Math.max(zoom, 1e-6), sensor.fovDegMin),
    sensor.fovDegMax,
  );
}

/** Detector [width, height] for the mode. */
export function eoResolution(sensor: EoIrSensor, mode: EoMode): readonly [number, number] {
  return mode === 'IR' ? (sensor.irResolution ?? sensor.resolution) : sensor.resolution;
}

/** Instantaneous field of view of one pixel, radians. */
export function eoIfovRad(sensor: EoIrSensor, zoom: number, mode: EoMode): number {
  return (eoHfovDeg(sensor, zoom) * Math.PI) / 180 / eoResolution(sensor, mode)[0];
}

export function johnsonCycles(sizeM: number, rangeM: number, ifovRad: number): number {
  return sizeM / (Math.max(rangeM, 1) * ifovRad) / 2;
}

export function levelForCycles(cycles: number): EoLevel | null {
  if (cycles >= JOHNSON_CYCLES.IDENTIFY) return 'IDENTIFY';
  if (cycles >= JOHNSON_CYCLES.RECOGNISE) return 'RECOGNISE';
  if (cycles >= JOHNSON_CYCLES.DETECT) return 'DETECT';
  return null;
}

/** Level achievable on a target in view and in LOS, after visibility, night and contrast. */
export function eoLevel(
  sensor: EoIrSensor,
  camera: Pick<EoCameraState, 'zoom' | 'mode'>,
  target: { readonly sizeM: number; readonly thermalContrast: number; readonly rangeM: number },
  cond: EoConditions,
): EoLevel | null {
  const ir = camera.mode === 'IR';
  if (!ir && cond.isNight) return null;
  const cap = ir ? cond.visibilityM * IR_VISIBILITY_FACTOR : cond.visibilityM;
  if (target.rangeM > cap) return null;
  const cycles = johnsonCycles(
    target.sizeM,
    target.rangeM,
    eoIfovRad(sensor, camera.zoom, camera.mode),
  );
  return levelForCycles(ir ? cycles * target.thermalContrast : cycles);
}

/** Compass az / elevation (degrees) from one point to another. */
export function pointingTo(
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
): { azDeg: number; elDeg: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const az = (Math.atan2(dx, dz) * 180) / Math.PI;
  return {
    azDeg: az < 0 ? az + 360 : az,
    elDeg: (Math.atan2(to.y - from.y, Math.hypot(dx, dz)) * 180) / Math.PI,
  };
}

/**
 * Where `to` appears in the frame: [horizontal, vertical] as a fraction of the
 * half-frame (|value| ≤ 1 is in view), or null when it is behind the camera.
 */
export function frameOffset(
  sensor: EoIrSensor,
  camera: Pick<EoCameraState, 'azDeg' | 'elDeg' | 'zoom' | 'mode'>,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
): readonly [number, number] | null {
  const az = (camera.azDeg * Math.PI) / 180;
  const el = (camera.elDeg * Math.PI) / 180;
  // Camera basis in (east, up, north).
  const f = [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)] as const;
  const r = [Math.cos(az), 0, -Math.sin(az)] as const;
  const u = [-Math.sin(el) * Math.sin(az), Math.cos(el), -Math.sin(el) * Math.cos(az)] as const;
  const d = [to.x - from.x, to.y - from.y, to.z - from.z] as const;
  const fz = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (fz <= 0) return null;
  const rx = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const uy = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const [w, h] = eoResolution(sensor, camera.mode);
  const tanH = Math.tan((eoHfovDeg(sensor, camera.zoom) * Math.PI) / 360);
  return [rx / fz / tanH, uy / fz / ((tanH * h) / w)];
}

/** Whether `to` falls inside the camera's rectangular field of view. */
export function inEoFrustum(
  sensor: EoIrSensor,
  camera: Pick<EoCameraState, 'azDeg' | 'elDeg' | 'zoom' | 'mode'>,
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
): boolean {
  const o = frameOffset(sensor, camera, from, to);
  return o !== null && Math.abs(o[0]) <= 1 && Math.abs(o[1]) <= 1;
}

/** One tick of a locked camera following its target pointing (deterministic smoothing). */
export function followPointing(
  camera: EoCameraState,
  target: { azDeg: number; elDeg: number },
  dtS: number,
): void {
  const k = Math.min(1, dtS * CAMERA_FOLLOW_RATE);
  const dAz = ((((target.azDeg - camera.azDeg) % 360) + 540) % 360) - 180;
  const az = (camera.azDeg + dAz * k) % 360;
  camera.azDeg = az < 0 ? az + 360 : az;
  camera.elDeg += (target.elDeg - camera.elDeg) * k;
}
