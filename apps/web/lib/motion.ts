'use client';

import { useEffect, useRef, useSyncExternalStore, type RefObject } from 'react';
import { prefersReducedMotion, useSettings } from '@/lib/settings';

/** DESIGN §7 ease-out, for Web Animations (CSS uses `--ease-ui`). */
export const EASE_UI = 'cubic-bezier(0.2, 0, 0, 1)';

/**
 * Radar sweep trail behind the beam, in radians. Reduced motion drops the trail
 * (DESIGN §7) and leaves a plain beam line: the beam keeps turning because it
 * shows where the radar is looking.
 */
export function sweepTrailRad(reduced: boolean): number {
  return reduced ? 0 : 0.6;
}

const QUERY = '(prefers-reduced-motion: reduce)';
function subscribeSystem(onChange: () => void): () => void {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** Reduced motion from the Settings toggle or the system, re-rendering on either change. */
export function useReducedMotion(): boolean {
  const { motion } = useSettings();
  const system = useSyncExternalStore(
    subscribeSystem,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
  return motion === 'REDUCE' || system;
}

/**
 * Fades `ref` in (opacity only) whenever `key` changes, but not on first mount
 * and not under reduced motion. Web Animations, not a remount, so the panel's
 * children keep their state and scroll (tab switch, §7). The global CSS
 * reduced-motion override does not reach WAAPI, hence the explicit check.
 */
export function useFadeOnChange(
  ref: RefObject<HTMLElement | null>,
  key: string,
  durationMs = 120,
): void {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const el = ref.current;
    if (!el || typeof el.animate !== 'function' || prefersReducedMotion()) return;
    const a = el.animate([{ opacity: 0 }, { opacity: 1 }], {
      duration: durationMs,
      easing: EASE_UI,
    });
    return () => a.cancel();
  }, [ref, key, durationMs]);
}
