'use client';

import { OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import type { SimRuntime } from '@/lib/sim/runtime';
import { BuildingsMesh } from './buildings-mesh';
import { Drones } from './drones';
import { Environment } from './environment';
import { SimRuntimeContext } from './sim-context';
import { SiteMarkers } from './site-markers';
import { TerrainMesh } from './terrain-mesh';
import { TrackMarkers } from './track-markers';

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
        <Environment env={runtime.sim.getState().environment} variant="tactical" />
        <TerrainMesh world={runtime.world} />
        <BuildingsMesh index={runtime.world.buildings} />
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
