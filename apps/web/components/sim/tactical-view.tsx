'use client';

import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useMemo, type RefObject } from 'react';
import { BuildingsMesh } from './buildings-mesh';
import { Drones } from './drones';
import { Environment } from './environment';
import { useSimRuntime } from './sim-context';
import { SiteMarkers } from './site-markers';
import { TerrainMesh } from './terrain-mesh';
import { TrackMarkers } from './track-markers';

/** Starting camera offset from the defended position (x east, z north, metres). */
const CAMERA_START = { x: -1400, z: -1900, height: 1100 };

/**
 * Centre 3D view (SPEC §15): orbit camera over the defended position. Lives in
 * the tactical drei <View>; orbit input comes from the tracked panel element.
 */
export function TacticalScene({
  element,
  onSelectTrack,
}: {
  element: RefObject<HTMLDivElement | null>;
  onSelectTrack: (trackId: string) => void;
}) {
  const runtime = useSimRuntime();
  // Start above the terrain even in mountains (heights are relative to the origin).
  const start = useMemo((): [number, number, number] => {
    const ground = runtime.groundHeight(CAMERA_START.x, CAMERA_START.z);
    return [CAMERA_START.x, Math.max(CAMERA_START.height, ground + 600), -CAMERA_START.z];
  }, [runtime]);
  return (
    <>
      <PerspectiveCamera makeDefault position={start} fov={50} near={5} far={40_000} />
      <Environment env={runtime.sim.getState().environment} variant="tactical" />
      <TerrainMesh world={runtime.world} edgeFade />
      <BuildingsMesh index={runtime.world.buildings} />
      <SiteMarkers />
      <Drones />
      <TrackMarkers onSelect={onSelectTrack} labelPortal={element} />
      {element.current && (
        <OrbitControls
          domElement={element.current}
          target={[0, 0, 0]}
          maxPolarAngle={Math.PI / 2.15}
          minDistance={80}
          maxDistance={12_000}
          enableDamping
        />
      )}
    </>
  );
}
