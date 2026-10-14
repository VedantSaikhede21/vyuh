'use client';

import { useEffect, useRef } from 'react';
import type { SimRuntime } from './runtime';
import { snapshot, useHudStore } from './store';

/**
 * Runs the sim from requestAnimationFrame and publishes a HUD snapshot after
 * every frame that advanced at least one tick. Calls `onEnded` once and
 * `onFrame` with every frame's duration (for the FPS report).
 */
export function useSimLoop(
  rt: SimRuntime | null,
  onEnded?: () => void,
  onFrame?: (ms: number) => void,
): void {
  const onEndedRef = useRef(onEnded);
  const onFrameRef = useRef(onFrame);
  useEffect(() => {
    onEndedRef.current = onEnded;
    onFrameRef.current = onFrame;
  }, [onEnded, onFrame]);

  useEffect(() => {
    if (!rt) return;
    const { publish } = useHudStore.getState();
    publish(snapshot(rt));
    let raf = 0;
    let last = performance.now();
    let notified = false;
    const frame = (now: number) => {
      const ticks = rt.advance(now - last);
      onFrameRef.current?.(now - last);
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
