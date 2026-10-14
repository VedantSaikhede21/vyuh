'use client';

import { useEffect, useRef } from 'react';
import type { SimRuntime } from './runtime';
import { snapshot, useHudStore } from './store';

/**
 * Runs the sim from requestAnimationFrame and publishes a HUD snapshot after
 * every frame that advanced at least one tick. Calls `onEnded` once.
 */
export function useSimLoop(rt: SimRuntime | null, onEnded?: () => void): void {
  const onEndedRef = useRef(onEnded);
  useEffect(() => {
    onEndedRef.current = onEnded;
  }, [onEnded]);

  useEffect(() => {
    if (!rt) return;
    const { publish } = useHudStore.getState();
    publish(snapshot(rt));
    let raf = 0;
    let last = performance.now();
    let notified = false;
    const frame = (now: number) => {
      const ticks = rt.advance(now - last);
      last = now;
      if (ticks > 0) publish(snapshot(rt));
      if (rt.ended && !notified) {
        notified = true;
        onEndedRef.current?.();
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      publish(null);
    };
  }, [rt]);
}
