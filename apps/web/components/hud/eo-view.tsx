'use client';

import { Sky } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { toThree } from '@vyuh/sim-core';
import { useRef } from 'react';
import type { PerspectiveCamera } from 'three';
import { BuildingsMesh } from '@/components/sim/buildings-mesh';
import { Drones } from '@/components/sim/drones';
import { SimRuntimeContext, useSimRuntime } from '@/components/sim/sim-context';
import { TerrainMesh } from '@/components/sim/terrain-mesh';
import { eoSensor, pointingToTrack, type Commands } from '@/lib/sim/commands';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useUiStore } from '@/lib/sim/ui-store';
import { pad3 } from '@/lib/strings';

// Simple EO view (SPEC §6.2, Phase 1): a second narrow camera on the EO mast,
// rendered at dpr 1 (the panel is smaller than the 640×360 budget). No noise /
// thermal shader until Phase 2.

const ASPECT = 16 / 9;
/** How fast a locked camera follows its track, per second (fraction of the gap). */
const FOLLOW_RATE = 4;

function vfovDeg(hfovDeg: number): number {
  const h = (hfovDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / ASPECT) * 180) / Math.PI;
}

function EoCamera() {
  const rt = useSimRuntime();
  const eo = eoSensor(rt);
  const mast = eo ? rt.sim.getState().sensorPositions[eo.id] : undefined;

  useFrame((state, dt) => {
    if (!mast) return;
    const camera = state.camera as PerspectiveCamera;
    const ui = useUiStore.getState();
    let { azDeg, elDeg } = ui.eo;
    if (ui.eo.lockTrackId) {
      const target = pointingToTrack(rt, ui.eo.lockTrackId);
      if (target) {
        const k = Math.min(1, dt * FOLLOW_RATE);
        const dAz = ((target.azDeg - azDeg + 540) % 360) - 180;
        azDeg = (azDeg + dAz * k + 360) % 360;
        elDeg += (target.elDeg - elDeg) * k;
        ui.setEo({ azDeg, elDeg });
      }
    }
    const p = toThree(mast);
    camera.position.set(p.x, p.y, p.z);
    const az = (azDeg * Math.PI) / 180;
    const el = (elDeg * Math.PI) / 180;
    const dir = toThree({
      x: Math.sin(az) * Math.cos(el),
      y: Math.sin(el),
      z: Math.cos(az) * Math.cos(el),
    });
    camera.lookAt(p.x + dir.x, p.y + dir.y, p.z + dir.z);
    const fov = vfovDeg(ui.eo.hfovDeg);
    if (Math.abs(camera.fov - fov) > 1e-3) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  });
  return null;
}

function EoReadout() {
  const eo = useUiStore((s) => s.eo);
  return (
    <div className="pointer-events-none absolute inset-0 font-mono text-xs text-[#d7ffe9]">
      <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-0 h-2 w-px bg-current" />
        <div className="absolute bottom-0 left-1/2 h-2 w-px bg-current" />
        <div className="absolute left-0 top-1/2 h-px w-2 bg-current" />
        <div className="absolute right-0 top-1/2 h-px w-2 bg-current" />
      </div>
      <div className="absolute left-1.5 top-1 bg-black/60 px-1">
        EO · AZ {pad3(eo.azDeg)} · EL {eo.elDeg.toFixed(1)} · FOV {eo.hfovDeg.toFixed(1)}°
      </div>
      <div className="absolute bottom-1 left-1.5 bg-black/60 px-1">
        {eo.lockTrackId ? `LOCK ${eo.lockTrackId}` : 'MANUAL · drag to slew'}
      </div>
    </div>
  );
}

export function EoView({ runtime, commands }: { runtime: SimRuntime; commands: Commands }) {
  const drag = useRef<{ x: number; y: number } | null>(null);
  const eo = eoSensor(runtime);
  if (!eo || eo.kind !== 'EO_IR') {
    return <p className="hud-label p-4">No EO/IR sensor in this scenario.</p>;
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { hfovDeg } = useUiStore.getState().eo;
    const dx = e.clientX - drag.current.x;
    const dy = e.clientY - drag.current.y;
    drag.current = { x: e.clientX, y: e.clientY };
    commands.slewBy((-dx / rect.width) * hfovDeg, (dy / rect.height) * vfovDeg(hfovDeg));
  };

  return (
    <div
      className="relative aspect-video w-full cursor-grab touch-none select-none overflow-hidden bg-black active:cursor-grabbing"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMove={onPointerMove}
      onPointerUp={() => {
        if (drag.current) commands.endSlew();
        drag.current = null;
      }}
      onWheel={(e) => commands.zoom(e.deltaY < 0 ? 1 : -1)}
      aria-label="EO camera view. Drag to slew, scroll to zoom, Space to slew to the selected track."
    >
      <Canvas
        dpr={1}
        gl={{ antialias: false, powerPreference: 'high-performance' }}
        camera={{ fov: vfovDeg(eo.fovDegMax), near: 0.5, far: 20_000 }}
        style={{ width: '100%', height: '100%' }}
      >
        <SimRuntimeContext.Provider value={runtime}>
          <color attach="background" args={['#9fb4c4']} />
          <fog attach="fog" args={['#9fb4c4', 3000, 14_000]} />
          <Sky distance={45_000} sunPosition={[-0.4, 0.6, -0.5]} turbidity={6} rayleigh={1.2} />
          <hemisphereLight args={['#dfe9f0', '#3a3a2a', 0.9]} />
          <directionalLight position={[-3000, 5000, 2000]} intensity={1.6} />
          <TerrainMesh world={runtime.world} />
          <BuildingsMesh index={runtime.world.buildings} />
          <Drones />
          <EoCamera />
        </SimRuntimeContext.Provider>
      </Canvas>
      <EoReadout />
    </div>
  );
}
