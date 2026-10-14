'use client';

import { createPortal, useFrame, type RootState } from '@react-three/fiber';
import { toThree, type Vec3 } from '@vyuh/sim-core';
import { forwardRef, useEffect, useMemo, useRef } from 'react';
import { PerspectiveCamera, Scene, ShaderMaterial, WebGLRenderTarget } from 'three';
import { BuildingsMesh } from '@/components/sim/buildings-mesh';
import { Drones } from '@/components/sim/drones';
import { Environment } from '@/components/sim/environment';
import { useSimRuntime } from '@/components/sim/sim-context';
import { TerrainMesh } from '@/components/sim/terrain-mesh';
import { eoSensor, type Commands } from '@/lib/sim/commands';
import { swapToIr } from '@/lib/sim/ir-materials';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useUiStore } from '@/lib/sim/ui-store';
import { TRACK_MODE_LABEL, pad3 } from '@/lib/strings';

// EO/IR view (SPEC §6.2). The camera on the EO mast renders the world into a
// 640×360 target (the sensor resolution, so what the trainee sees matches the
// sim's pixels-on-target), shown through a display shader: day = slight noise
// (more when dark), IR = white-hot palette + noise + blur. In IR mode meshes
// swap to their heat materials for the pass. The view is a drei <View> on the
// shared canvas; the DOM panel handles drag/wheel and the readout.

const RT_W = 640;
const RT_H = 360;
const ASPECT = RT_W / RT_H;

export function vfovDeg(hfovDeg: number): number {
  const h = (hfovDeg * Math.PI) / 180;
  return (2 * Math.atan(Math.tan(h / 2) / ASPECT) * 180) / Math.PI;
}

const VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const FRAGMENT = /* glsl */ `
uniform sampler2D tDiffuse;
uniform float uMode;   // 0 = day, 1 = IR
uniform float uTime;
uniform float uNoise;
uniform vec2 uTexel;
varying vec2 vUv;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float n = rand(floor(vUv / uTexel) + fract(uTime * 7.31)) - 0.5;
  if (uMode < 0.5) {
    gl_FragColor = vec4(c + n * uNoise, 1.0);
  } else {
    vec3 b = c * 4.0
      + texture2D(tDiffuse, vUv + vec2(uTexel.x, 0.0)).rgb
      + texture2D(tDiffuse, vUv - vec2(uTexel.x, 0.0)).rgb
      + texture2D(tDiffuse, vUv + vec2(0.0, uTexel.y)).rgb
      + texture2D(tDiffuse, vUv - vec2(0.0, uTexel.y)).rgb;
    float l = dot(b / 8.0, vec3(0.299, 0.587, 0.114));
    l = clamp(l * 1.2 + n * 0.035, 0.0, 1.0);
    gl_FragColor = vec4(vec3(l), 1.0);
  }
  #include <colorspace_fragment>
}`;

interface EoFrame {
  rt: SimRuntime;
  mast: Vec3;
  fovMax: number;
  eoScene: Scene;
  camera: PerspectiveCamera;
  target: WebGLRenderTarget;
  material: ShaderMaterial;
  state: RootState;
}

/** Point the EO camera, render the world into the target (IR materials if thermal), update the shader. */
function renderEoFrame({ rt, mast, fovMax, eoScene, camera, target, material, state }: EoFrame) {
  const ui = useUiStore.getState();
  const simCam = rt.sim.getState().camera;
  if (ui.eo.trackMode !== simCam.trackMode) ui.setEo({ trackMode: simCam.trackMode });
  let { azDeg, elDeg } = ui.eo;
  if (simCam.lockTrackId) {
    // Locked: the sim slews and follows; mirror it so the readout and the next drag agree.
    ({ azDeg, elDeg } = rt.cameraPointing());
    ui.setEo({ azDeg, elDeg });
  } else if (ui.eo.lockTrackId) {
    // The lock command may not be applied yet (next tick); clear it only once the track is gone.
    const t = rt.sim.getState().tracks.find((x) => x.id === ui.eo.lockTrackId);
    if (t?.status !== 'ACTIVE') ui.setEo({ lockTrackId: null });
  }
  const p = toThree(mast);
  camera.position.set(p.x, p.y, p.z);
  const az = (azDeg * Math.PI) / 180;
  const el = (elDeg * Math.PI) / 180;
  const d = toThree({
    x: Math.sin(az) * Math.cos(el),
    y: Math.sin(el),
    z: Math.cos(az) * Math.cos(el),
  });
  camera.lookAt(p.x + d.x, p.y + d.y, p.z + d.z);
  // Zoom via camera.zoom so three's LOD picks finer terrain tiles when zoomed in.
  const zoom = fovMax / ui.eo.hfovDeg;
  if (Math.abs(camera.zoom - zoom) > 1e-6) {
    camera.zoom = zoom;
    camera.updateProjectionMatrix();
  }

  const gl = state.gl;
  const restore = ui.eo.mode === 'IR' ? swapToIr(eoScene) : null;
  const prev = gl.getRenderTarget();
  gl.setRenderTarget(target);
  gl.clear();
  gl.render(eoScene, camera);
  gl.setRenderTarget(prev);
  restore?.();

  const u = material.uniforms;
  u.uMode!.value = ui.eo.mode === 'IR' ? 1 : 0;
  u.uTime!.value = state.clock.elapsedTime;
  u.uNoise!.value = rt.sim.getState().environment.isNight ? 0.12 : 0.03;
}

/** In-canvas part: render target pass + display quad. Lives inside the EO <View>. */
export function EoScene() {
  const rt = useSimRuntime();
  const eo = eoSensor(rt);
  const mast = eo ? rt.sim.getState().sensorPositions[eo.id] : undefined;
  const fovMax = eo?.kind === 'EO_IR' ? eo.fovDegMax : 30;
  const mode = useUiStore((s) => s.eo.mode);
  const env = rt.sim.getState().environment;

  const eoScene = useMemo(() => new Scene(), []);
  const camera = useMemo(
    () => new PerspectiveCamera(vfovDeg(fovMax), ASPECT, 0.5, 30_000),
    [fovMax],
  );
  const target = useMemo(() => new WebGLRenderTarget(RT_W, RT_H), []);
  const material = useMemo(
    () =>
      new ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        depthTest: false,
        depthWrite: false,
        uniforms: {
          tDiffuse: { value: target.texture },
          uMode: { value: 0 },
          uTime: { value: 0 },
          uNoise: { value: 0.03 },
          uTexel: { value: [1 / RT_W, 1 / RT_H] },
        },
      }),
    [target],
  );
  useEffect(
    () => () => {
      target.dispose();
      material.dispose();
    },
    [target, material],
  );

  useFrame((state) => {
    if (mast) renderEoFrame({ rt, mast, fovMax, eoScene, camera, target, material, state });
  });

  return (
    <>
      {createPortal(
        <>
          <Environment env={env} variant="eo" ir={mode === 'IR'} />
          <TerrainMesh world={rt.world} />
          <BuildingsMesh index={rt.world.buildings} />
          <Drones />
        </>,
        eoScene,
      )}
      <mesh frustumCulled={false} material={material} raycast={() => null}>
        <planeGeometry args={[2, 2]} />
      </mesh>
    </>
  );
}

function EoReadout() {
  const eo = useUiStore((s) => s.eo);
  return (
    <div className="pointer-events-none absolute inset-0 z-[10] text-readout text-text-1">
      <div className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2">
        <div className="absolute left-1/2 top-0 h-2 w-px bg-current" />
        <div className="absolute bottom-0 left-1/2 h-2 w-px bg-current" />
        <div className="absolute left-0 top-1/2 h-px w-2 bg-current" />
        <div className="absolute right-0 top-1/2 h-px w-2 bg-current" />
      </div>
      <div className="absolute left-1.5 top-1 bg-bg-1 px-1">
        {eo.mode === 'IR' ? 'IR WHT' : 'EO DAY'} · AZ {pad3(eo.azDeg)} · EL {eo.elDeg.toFixed(1)} ·
        FOV {eo.hfovDeg.toFixed(1)}°
      </div>
      <div className="absolute bottom-1 left-1.5 bg-bg-1 px-1">
        {TRACK_MODE_LABEL[eo.trackMode]}
        {eo.lockTrackId ? ` ${eo.lockTrackId}` : ' · drag to slew'} · T day/IR
      </div>
    </div>
  );
}

/** DOM part: the panel the EO <View> tracks, with drag-to-slew, wheel zoom and readout. */
export const EoPanel = forwardRef<HTMLDivElement, { runtime: SimRuntime; commands: Commands }>(
  function EoPanel({ runtime, commands }, ref) {
    const drag = useRef<{ x: number; y: number } | null>(null);
    const eo = eoSensor(runtime);
    if (!eo || eo.kind !== 'EO_IR') {
      return <p className="text-label p-4">No EO/IR sensor in this scenario.</p>;
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
        ref={ref}
        className="relative aspect-video w-full cursor-grab touch-none select-none overflow-hidden active:cursor-grabbing"
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
        aria-label="EO/IR camera view. Drag to slew, scroll to zoom, Space to lock on the selected track, T for thermal."
      >
        <EoReadout />
      </div>
    );
  },
);
