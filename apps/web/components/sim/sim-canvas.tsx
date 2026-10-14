'use client';

import { View } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { RefObject } from 'react';
import { EoScene } from '@/components/hud/eo-view';
import type { SimRuntime } from '@/lib/sim/runtime';
import { SimRuntimeContext } from './sim-context';
import { TacticalScene } from './tactical-view';

/**
 * One WebGL canvas for the whole player (decision 40): the tactical view and
 * the EO/IR view are drei <View>s that track their DOM panels, so terrain and
 * buildings live on the GPU once. The canvas ignores pointer events; R3F reads
 * them from the player container.
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
  return (
    <Canvas
      eventSource={container as RefObject<HTMLElement>}
      dpr={[1, 1.5]}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 5 }}
    >
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
