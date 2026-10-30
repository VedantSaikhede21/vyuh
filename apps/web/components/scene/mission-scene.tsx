'use client';

import { PerspectiveCamera } from '@react-three/drei';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import type { Scenario } from '@vyuh/shared';
import { sampleHeight, type World } from '@vyuh/sim-core';
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Vector3 } from 'three';
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
import { CAMERA_START } from '@/lib/sim/framing';
import { SimRuntime } from '@/lib/sim/runtime';

/** Radians per second of the slow orbit around the look-at point. */
const ORBIT_RATE = 0.012;
const FLIGHT_S = 1.2;

const easeInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

function CameraRig({ world, scenario, shot, orbit, flying }: Props) {
  const get = useThree((s) => s.get);
  const pose = useMemo(() => shotPose(scenario, shot), [scenario, shot]);
  const map = world.heightmap;
  useEffect(() => {
    const { camera } = get();
    const y = sampleHeight(map, pose.x, pose.z) + pose.aboveGroundM;
    camera.position.set(pose.x, y, -pose.z);
    camera.lookAt(pose.targetX, sampleHeight(map, pose.targetX, pose.targetZ), -pose.targetZ);
  }, [get, map, pose]);
  const flight = useRef<{ from: Vector3; lookFrom: Vector3; t: number } | null>(null);
  useFrame(({ camera }, dt) => {
    if (flying) {
      // To the player's first camera, so the cut into the session is invisible.
      flight.current ??= {
        from: camera.position.clone(),
        lookFrom: new Vector3(
          pose.targetX,
          sampleHeight(map, pose.targetX, pose.targetZ),
          -pose.targetZ,
        ),
        t: 0,
      };
      const f = flight.current;
      f.t = Math.min(1, f.t + dt / FLIGHT_S);
      const k = easeInOut(f.t);
      const ground = sampleHeight(map, CAMERA_START.x, CAMERA_START.z);
      camera.position.lerpVectors(
        f.from,
        new Vector3(CAMERA_START.x, Math.max(CAMERA_START.height, ground + 600), -CAMERA_START.z),
        k,
      );
      camera.lookAt(new Vector3().lerpVectors(f.lookFrom, new Vector3(0, 0, 0), k));
      return;
    }
    flight.current = null;
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
  /** Begin was pressed: fly to the player's start pose. */
  flying?: boolean;
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
  flying = false,
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
        <CameraRig scenario={scenario} world={world} shot={shot} orbit={orbit} flying={flying} />
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
