import { CLASS_PROFILES, type EoIrSensor, type EoLevel, type EoMode } from '@vyuh/shared';
import { INHERENT_CONTRAST, betaFor } from '../atmosphere.ts';
import type { Vec3 } from '../coords.ts';
import { datan2, dcos, dexp, dsin, dtan } from '../dmath.ts';

// EO/IR camera (SPEC §6.2). Pixels on target = size / (range × IFOV), Johnson
// cycles = pixels / 2. DETECT ≥ 1, RECOGNISE ≥ 4, IDENTIFY ≥ 6.4 cycles.
//
// Day camera (SIM_VERSION 8, eo-haze plan §2): the haze between camera and contact
// lowers the contact's apparent contrast (Koschmieder against the sky; Duntley's
// sky-to-ground ratio against terrain, with a far background hazed by the gap), and
// the Johnson cycles are scaled by a targeting-task-performance (TTP) ratio of that
// contrast: none below the 2 % threshold. Still capped at the visibility, and
// useless at night. IR is unchanged: cycles × the class's thermal contrast, up to
// 1.5× the visibility through haze, no further than the day camera in dense fog
// (decision 94).

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
/** Largest IR range cap as a multiple of visibilityM (haze; decision 94). */
export const IR_VISIBILITY_FACTOR = 1.5;
/** At or below this visibility (fog) IR is capped like the day camera (factor 1). */
export const IR_FOG_VISIBILITY_M = 1000;
/** At or above this visibility (haze, clear) IR gets the full IR_VISIBILITY_FACTOR. */
export const IR_HAZE_VISIBILITY_M = 3000;

/** IR range cap ÷ visibility: 1 in fog, rising linearly to IR_VISIBILITY_FACTOR through haze. */
export function irVisibilityFactor(visibilityM: number): number {
  const t = (visibilityM - IR_FOG_VISIBILITY_M) / (IR_HAZE_VISIBILITY_M - IR_FOG_VISIBILITY_M);
  return 1 + (IR_VISIBILITY_FACTOR - 1) * Math.min(Math.max(t, 0), 1);
}
/** A pointing episode ends after a contact has had no level for this long. */
export const EO_EPISODE_RESET_MS = 1000;
/** How fast a locked camera closes the gap to its track, per second. */
export const CAMERA_FOLLOW_RATE = 4;

// EO video auto-track (decision 52): radar cues the camera (CUE); once the cued
// contact is seen in the frame the EO tracker holds it (TRACK).
/** CUE → TRACK after the contact has been at ≥ DETECT inside the acquisition window this long. */
export const EO_ACQUIRE_MS = 500;
/** TRACK → CUE after the contact has had no EO level for longer than this. */
export const EO_TRACK_DROP_MS = 1000;
/**
 * Fraction of the frame half-size the tracker searches for the cued contact. 0.85
 * (SIM_VERSION 7, decision 176): a video tracker acquires a target anywhere but the
 * frame edge; at 0.5 a cue at full zoom almost never locked, because the radar's
 * pointing error (p95 1.6–1.9° beyond 1 km) is wider than the central half.
 */
export const EO_ACQUIRE_FRAME_FRACTION = 0.85;
/**
 * Tracker jitter, 1σ per axis, as a fraction of the horizontal FOV. 0.006 (SIM_VERSION
 * 7, decision 176; was 0.02): at 2 % the target jumped ~27 px per tick on a full-width
 * picture, which hid its shape; a video tracker holds far steadier than that.
 */
export const EO_TRACK_JITTER_FOV = 0.006;

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
  /**
   * What the EO tracker sees of its target (TRACK only; else null): the level the
   * picture supports right now (SIM_VERSION 7, decision 176). Shown to the trainee
   * as the camera verdict; it is what the picture already shows, not ground truth.
   */
  targetLevel: EoLevel | null;
}

export interface EoConditions {
  readonly isNight: boolean;
  readonly visibilityM: number;
  /** Mean haze density (0–1) on the path to the target: 1 inside the haze layer (atmosphere.ts). */
  readonly pathHaze: number;
  /** Sky-to-ground ratio of the terrain behind ground-backed targets (atmosphere.ts). */
  readonly skyGroundRatio: number;
}

/** What the day camera needs to know about a target besides its size. */
export interface EoTarget {
  readonly sizeM: number;
  readonly thermalContrast: number;
  readonly rangeM: number;
  /** Inherent |contrast| against the sky and against the ground (INHERENT_CONTRAST). */
  readonly inherentContrast: { readonly sky: number; readonly ground: number };
  /** Distance from the target to the terrain behind it (m); null = seen against the sky. */
  readonly backgroundGapM: number | null;
}

// ---- Day-camera contrast (SIM_VERSION 8) -----------------------------------------

/** The eye's contrast threshold behind Koschmieder's 3.912 (decision 178). */
export const EO_CONTRAST_THRESHOLD = 0.02;
/**
 * How much more contrast the finest detail the pixels show needs than coarse
 * detail: the contrast threshold function rises from ε to G·ε at the pixel limit.
 * Representative (eo-haze plan Q1).
 */
export const CTF_RISE = 10;
/**
 * Contrast at which Johnson's cycles hold unchanged: a drone against a clear sky
 * at short range, so today's identification ranges stay exact for that case.
 */
export const CONTRAST_REF = INHERENT_CONTRAST.DRONE.sky;

/**
 * Apparent |contrast| of a target through the haze (Duntley 1948, as in Gordon
 * 1980 Eq. 29). Against the sky: C₀·T. Against the ground: C₀ / (1 + S·(1/T − 1)),
 * where the background is first seen through the gap behind the target, so a far,
 * hazed ridge acts almost like sky: S' = S / (Tg + S·(1 − Tg)) and C₀ moves from
 * the ground value towards the sky value by (1 − Tg) (eo-haze plan [C3]).
 */
export function apparentContrast(
  target: Pick<EoTarget, 'rangeM' | 'inherentContrast' | 'backgroundGapM'>,
  cond: Pick<EoConditions, 'visibilityM' | 'pathHaze' | 'skyGroundRatio'>,
): number {
  const beta = betaFor(cond.visibilityM) * cond.pathHaze;
  const t = dexp(-beta * Math.max(target.rangeM, 0));
  const c0 = target.inherentContrast;
  if (target.backgroundGapM === null) return c0.sky * t;
  const tg = dexp(-beta * Math.max(target.backgroundGapM, 0));
  const s = cond.skyGroundRatio / (tg + cond.skyGroundRatio * (1 - tg));
  const inherent = c0.ground + (c0.sky - c0.ground) * (1 - tg);
  return t <= 0 ? 0 : inherent / (1 + s * (1 / t - 1));
}

/**
 * Targeting task performance for a target contrast, up to a constant factor
 * (Vollmerhausen & Jacobs 2004: TTP = ∫ √(C / CTF(ξ)) dξ while C > CTF). With
 * CTF(ξ) = ε·G^(ξ/ξN) the integral is closed: √(C/ε) − 1 below the pixel limit,
 * √(C/ε)·(1 − 1/√G) once the contrast reaches it. Zero at or below ε.
 */
export function ttp(contrast: number): number {
  const q = Math.sqrt(Math.max(contrast, 0) / EO_CONTRAST_THRESHOLD);
  return contrast >= EO_CONTRAST_THRESHOLD * CTF_RISE
    ? q * (1 - 1 / Math.sqrt(CTF_RISE))
    : Math.max(q - 1, 0);
}

/** Factor (0–1) on the Johnson cycles for a contrast; never above 1, so nothing gets easier. */
export function ttpRatio(contrast: number): number {
  return Math.min(1, ttp(contrast) / ttp(CONTRAST_REF));
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
  target: EoTarget,
  cond: EoConditions,
): EoLevel | null {
  const ir = camera.mode === 'IR';
  if (!ir && cond.isNight) return null;
  // The day camera keeps its hard cap at the visibility (eo-haze plan [C2]).
  const cap = ir ? cond.visibilityM * irVisibilityFactor(cond.visibilityM) : cond.visibilityM;
  if (target.rangeM > cap) return null;
  const cycles = johnsonCycles(
    target.sizeM,
    target.rangeM,
    eoIfovRad(sensor, camera.zoom, camera.mode),
  );
  if (ir) return levelForCycles(cycles * target.thermalContrast);
  const k = ttpRatio(apparentContrast(target, cond));
  return k > 0 ? levelForCycles(cycles * k) : null;
}

/** Size of the nominal target the cue plans for: a small quad (eo-haze plan [C1]). */
export const CUE_NOMINAL_SIZE_M = CLASS_PROFILES.QUAD_SMALL.sizeM;

/**
 * Farthest range at which the day camera still DETECTs a small quad at this field
 * of view in the worst case: seen against the ground right behind it, inside the
 * haze layer. Used by the cue to pick a field of view from the radar range alone
 * (no truth about the contact). 0 at night.
 */
export function worstCaseDetectRangeM(
  sensor: EoIrSensor,
  hfovDeg: number,
  cond: Pick<EoConditions, 'isNight' | 'visibilityM' | 'skyGroundRatio'>,
): number {
  const camera = { zoom: sensor.fovDegMax / hfovDeg, mode: 'DAY' as const };
  const full = { ...cond, pathHaze: 1 };
  const detects = (rangeM: number) =>
    eoLevel(
      sensor,
      camera,
      {
        sizeM: CUE_NOMINAL_SIZE_M,
        thermalContrast: 1,
        rangeM,
        inherentContrast: INHERENT_CONTRAST.DRONE,
        backgroundGapM: 0,
      },
      full,
    ) !== null;
  let lo = 1;
  let hi = Math.max(cond.visibilityM, 1);
  if (!detects(lo)) return 0;
  if (detects(hi)) return hi;
  // Level falls with range, so bisect to a metre.
  while (hi - lo > 1) {
    const mid = (lo + hi) / 2;
    if (detects(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** Compass az / elevation (degrees) from one point to another. */
export function pointingTo(
  from: Readonly<Vec3>,
  to: Readonly<Vec3>,
): { azDeg: number; elDeg: number } {
  const dx = to.x - from.x;
  const dz = to.z - from.z;
  const az = (datan2(dx, dz) * 180) / Math.PI;
  return {
    azDeg: az < 0 ? az + 360 : az,
    elDeg: (datan2(to.y - from.y, Math.hypot(dx, dz)) * 180) / Math.PI,
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
  const f = [dsin(az) * dcos(el), dsin(el), dcos(az) * dcos(el)] as const;
  const r = [dcos(az), 0, -dsin(az)] as const;
  const u = [-dsin(el) * dsin(az), dcos(el), -dsin(el) * dcos(az)] as const;
  const d = [to.x - from.x, to.y - from.y, to.z - from.z] as const;
  const fz = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (fz <= 0) return null;
  const rx = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const uy = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const [w, h] = eoResolution(sensor, camera.mode);
  const tanH = dtan((eoHfovDeg(sensor, camera.zoom) * Math.PI) / 360);
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
