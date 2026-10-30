'use client';

import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useMemo, type RefObject } from 'react';
import { QUALITY_FEATURES, resolveQuality } from '@/lib/gpu-tier';
import { useSettings } from '@/lib/settings';
import { environmentLook } from '@/lib/sim/environment-look';
import { BuildingsMesh, roofStyleOf } from './buildings-mesh';
import { Drones } from './drones';
import { Environment } from './environment';
import { useSimRuntime } from './sim-context';
import { SiteMarkers } from './site-markers';
import { TerrainMesh } from './terrain-mesh';
import { VegetationMesh } from './vegetation-mesh';
import { SelectedFraming } from './selected-framing';
import { TrackLabelAnchors } from './track-labels';
import { TrackMarkers } from './track-markers';
import { ZoneMarkers } from './zone-markers';

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
  const env = runtime.sim.getState().environment;
  const look = useMemo(() => environmentLook(env, 'tactical'), [env]);
  const quality = resolveQuality(useSettings().graphics);
  return (
    <>
      <PerspectiveCamera makeDefault position={start} fov={50} near={5} far={40_000} />
      <Environment env={env} variant="tactical" />
      <TerrainMesh world={runtime.world} look={look} quality={quality} edgeFade encoded />
      <BuildingsMesh index={runtime.world.buildings} roofStyle={roofStyleOf(runtime.world)} />
      <VegetationMesh world={runtime.world} viewM={QUALITY_FEATURES[quality].treeViewM} />
      <SiteMarkers />
      <ZoneMarkers />
      <Drones />
      <TrackMarkers onSelect={onSelectTrack} />
      <TrackLabelAnchors />
      <SelectedFraming />
      {element.current && (
        <OrbitControls
          makeDefault
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
