'use client';

import { OrbitControls, Sky } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { SimRuntime } from '@/lib/sim/runtime';
import { Drones } from './drones';
import { SimRuntimeContext } from './sim-context';
import { SiteMarkers } from './site-markers';
import { TerrainMesh } from './terrain-mesh';
import { TrackMarkers } from './track-markers';

const HORIZON = '#9fb4c4';

/** Centre 3D view: orbit camera over the defended position (SPEC §15). */
export function TacticalView({
  runtime,
  onSelectTrack,
}: {
  runtime: SimRuntime;
  onSelectTrack: (trackId: string) => void;
}) {
  return (
    <Canvas
      dpr={[1, 1.5]}
      camera={{ position: [-1400, 1100, 1900], fov: 50, near: 5, far: 40_000 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      className="h-full w-full"
    >
      <SimRuntimeContext.Provider value={runtime}>
        <color attach="background" args={[HORIZON]} />
        <fog attach="fog" args={[HORIZON, 4000, 16_000]} />
        <Sky distance={45_000} sunPosition={[-0.4, 0.6, -0.5]} turbidity={6} rayleigh={1.2} />
        <hemisphereLight args={['#dfe9f0', '#3a3a2a', 0.9]} />
        <directionalLight position={[-3000, 5000, 2000]} intensity={1.6} />
        <TerrainMesh map={runtime.terrain} />
        <SiteMarkers />
        <Drones />
        <TrackMarkers onSelect={onSelectTrack} />
        <OrbitControls
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI / 2.15}
          minDistance={80}
          maxDistance={12_000}
          enableDamping
        />
      </SimRuntimeContext.Provider>
    </Canvas>
  );
}
