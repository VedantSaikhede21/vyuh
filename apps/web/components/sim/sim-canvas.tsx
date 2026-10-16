'use client';

import { PerformanceMonitor, View } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useState, type RefObject } from 'react';
import { EoScene } from '@/components/hud/eo-view';
import {
  ADAPTIVE_FPS_BOUNDS,
  adaptivePixelRatioEnabled,
  pixelRatioLevels,
  startPixelRatio,
} from '@/lib/sim/pixel-ratio';
import type { SimRuntime } from '@/lib/sim/runtime';
import { SimRuntimeContext } from './sim-context';
import { TacticalScene } from './tactical-view';

const deviceRatio = () => (typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1);
const fpsBounds = () => ADAPTIVE_FPS_BOUNDS;

/** Steps the canvas pixel ratio down when frame time stays high, and back up with hysteresis. */
function AdaptivePixelRatio() {
  const setDpr = useThree((s) => s.setDpr);
  const [levels] = useState(() => pixelRatioLevels(deviceRatio()));
  const [level, setLevel] = useState(levels.length - 1);
  useEffect(() => setDpr(levels[level]!), [levels, level, setDpr]);
  return (
    <PerformanceMonitor
      bounds={fpsBounds}
      flipflops={4}
      onDecline={() => setLevel((l) => Math.max(0, l - 1))}
      onIncline={() => setLevel((l) => Math.min(levels.length - 1, l + 1))}
    />
  );
}

/**
 * One WebGL canvas for the whole player (decision 40): the tactical view and
 * the EO/IR view are drei <View>s that track their DOM panels, so terrain and
 * buildings live on the GPU once. The canvas ignores pointer events; R3F reads
 * them from the player container. Its pixel ratio is capped at 1.25 and adapts
 * to frame time (lib/sim/pixel-ratio.ts).
 */
export function SimCanvas({
  runtime,
  container,
  tactical,
  eo,
  onSelectTrack,
}: {
  runtime: SimRuntime;
  container: RefObject<HTMLDivElement | null>;
  tactical: RefObject<HTMLDivElement | null>;
  eo: RefObject<HTMLDivElement | null>;
  onSelectTrack: (trackId: string) => void;
}) {
  const [adaptive] = useState(adaptivePixelRatioEnabled);
  const [dpr] = useState(() => startPixelRatio(deviceRatio()));
  return (
    <Canvas
      eventSource={container as RefObject<HTMLElement>}
      dpr={dpr}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
      {adaptive && <AdaptivePixelRatio />}
      <SimRuntimeContext.Provider value={runtime}>
        <View track={tactical as RefObject<HTMLElement>} index={1}>
          <TacticalScene element={tactical} onSelectTrack={onSelectTrack} />
        </View>
        <View track={eo as RefObject<HTMLElement>} index={2}>
          <EoScene />
        </View>
      </SimRuntimeContext.Provider>
    </Canvas>
  );
}
