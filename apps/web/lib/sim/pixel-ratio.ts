// 3D canvas pixel ratio (Phase 3b Step 2a). The shared canvas renders at most
// MAX_PIXEL_RATIO device pixels per CSS pixel: at 1080p an integrated GPU is
// fill-rate bound (Phase 3b Step 1 trace), and HUD text is DOM, so only the 3D
// views get softer. When frame time stays high the ratio steps down through
// pixelRatioLevels() and back up with hysteresis (drei PerformanceMonitor).
// Under automation the ratio is fixed (deterministic screenshots) unless a test
// opts in with ADAPTIVE_PIXEL_RATIO_KEY = '1' (the FPS spec measures both).

export const MAX_PIXEL_RATIO = 1.25;
/** Steps the adaptive ratio may take, before capping at the device ratio. */
const STEPS = [0.85, 1, MAX_PIXEL_RATIO] as const;
/** Decline below the first, incline above the second (mean fps over drei's sample window). */
export const ADAPTIVE_FPS_BOUNDS: [number, number] = [40, 55];
export const ADAPTIVE_PIXEL_RATIO_KEY = 'vyuh.adaptivePixelRatio';

/** Ascending distinct pixel ratios for a device: the steps capped at its own ratio. */
export function pixelRatioLevels(devicePixelRatio: number): number[] {
  const device = devicePixelRatio > 0 ? devicePixelRatio : 1;
  return [...new Set(STEPS.map((s) => Math.min(s, device)))].sort((a, b) => a - b);
}

/** Start (and fixed) ratio: the device ratio capped at MAX_PIXEL_RATIO. */
export function startPixelRatio(devicePixelRatio: number): number {
  const levels = pixelRatioLevels(devicePixelRatio);
  return levels[levels.length - 1]!;
}

/** Adaptive unless under automation; a test can opt back in through localStorage. */
export function adaptivePixelRatioEnabled(): boolean {
  if (typeof navigator === 'undefined' || !navigator.webdriver) return true;
  try {
    return window.localStorage.getItem(ADAPTIVE_PIXEL_RATIO_KEY) === '1';
  } catch {
    return false;
  }
}
