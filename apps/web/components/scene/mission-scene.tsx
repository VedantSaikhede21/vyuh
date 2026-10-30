'use client';

import { PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Scenario } from '@vyuh/shared';
import { sampleHeight, type World } from '@vyuh/sim-core';
import { useEffect, useMemo, type ReactNode } from 'react';
import { BuildingsMesh, roofStyleOf } from '@/components/sim/buildings-mesh';
import { Environment } from '@/components/sim/environment';
import { SimRuntimeContext } from '@/components/sim/sim-context';
import { SiteMarkers } from '@/components/sim/site-markers';
import { TerrainMesh } from '@/components/sim/terrain-mesh';
import { VegetationMesh } from '@/components/sim/vegetation-mesh';
import { ZoneMarkers } from '@/components/sim/zone-markers';
import { QUALITY_FEATURES, resolveQuality } from '@/lib/gpu-tier';
import { shotPose, type Shot } from '@/lib/scene/shots';
import { useSettings } from '@/lib/settings';
import { environmentLook } from '@/lib/sim/environment-look';
import { SimRuntime } from '@/lib/sim/runtime';

/** Radians per second of the slow orbit around the look-at point. */
const ORBIT_RATE = 0.012;

function CameraRig({ world, scenario, shot, orbit }: Props) {
  const camera = useThree((s) => s.camera);
  const invalidate = useThree((s) => s.invalidate);
  const pose = useMemo(() => shotPose(scenario, shot), [scenario, shot]);
  const map = world.heightmap;
  useEffect(() => {
    const y = sampleHeight(map, pose.x, pose.z) + pose.aboveGroundM;
    camera.position.set(pose.x, y, -pose.z);
    camera.lookAt(pose.targetX, sampleHeight(map, pose.targetX, pose.targetZ), -pose.targetZ);
    invalidate();
  }, [camera, map, pose, invalidate]);
  useFrame((_, dt) => {
    if (!orbit) return;
    const tx = pose.targetX;
    const tz = -pose.targetZ;
    const a = ORBIT_RATE * dt;
    const dx = camera.position.x - tx;
    const dz = camera.position.z - tz;
    camera.position.x = tx + dx * Math.cos(a) - dz * Math.sin(a);
    camera.position.z = tz + dx * Math.sin(a) + dz * Math.cos(a);
    camera.lookAt(tx, sampleHeight(map, pose.targetX, pose.targetZ), tz);
  });
  return null;
}

interface Props {
  scenario: Scenario;
  world: World;
  shot: Shot;
  /** Slow orbit (the briefing). False holds the frame: stills use less GPU. */
  orbit?: boolean;
}

/**
 * A scenario's place with no drones and no HUD: terrain, zones, assets, under
 * its own sun and weather. Renders the stills (`/dev/render`) and the live
 * briefing, so both show the same frame. The sim is built but never ticked: it
 * only supplies the environment and site positions.
 */
export function MissionScene({
  scenario,
  world,
  shot,
  orbit = false,
  children,
}: Props & { children?: ReactNode }) {
  const runtime = useMemo(() => new SimRuntime(scenario, world, 'PRACTICE'), [scenario, world]);
  const env = runtime.sim.getState().environment;
  const look = useMemo(() => environmentLook(env, 'tactical'), [env]);
  const quality = resolveQuality(useSettings().graphics);
  const pose = useMemo(() => shotPose(scenario, shot), [scenario, shot]);
  return (
    <Canvas
      dpr={1}
      gl={{ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true }}
      style={{ position: 'absolute', inset: 0 }}
    >
      <SimRuntimeContext.Provider value={runtime}>
        <PerspectiveCamera makeDefault fov={pose.fovDeg} near={5} far={40_000} />
        <CameraRig scenario={scenario} world={world} shot={shot} orbit={orbit} />
        <Environment env={env} variant="tactical" />
        <TerrainMesh world={world} look={look} quality={quality} edgeFade encoded />
        <BuildingsMesh index={world.buildings} roofStyle={roofStyleOf(world)} />
        <VegetationMesh world={world} viewM={QUALITY_FEATURES[quality].treeViewM} />
        <SiteMarkers />
        <ZoneMarkers />
        {children}
      </SimRuntimeContext.Provider>
    </Canvas>
  );
}
