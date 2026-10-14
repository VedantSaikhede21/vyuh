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
import { ChevronRight } from 'lucide-react';
import { Panel, PanelHeader, StateChip, StatusNotice, Tooltip } from '@/components/hud/primitives';
import { ACQ_REASON, eoChip, formatBearing, type EoChip } from '@/lib/hud/derive';
import { edgePoint, projectToEo } from '@/lib/hud/eo-project';
import { useHudStore } from '@/lib/sim/store';

// EO/IR view (SPEC §6.2). The camera on the EO mast renders the world into a
// 640×360 target (the sensor resolution, so what the trainee sees matches the
// sim's pixels-on-target), shown through a display shader: day = slight noise
// (more when dark), IR = white-hot palette + noise + blur. In IR mode meshes
// swap to their heat materials for the pass. The view is a drei <View> on the
// shared canvas; the DOM panel handles drag/wheel and the readout.

const RT_W = 640;
const RT_H = 360;
const ASPECT = RT_W / RT_H;
/** Day-camera exposure into the filmic curve: keeps the ground mid-grey and the sky below white. */
const EO_DAY_EXPOSURE = 0.6;

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
uniform float uExposure;
uniform vec2 uTexel;
varying vec2 vUv;
float rand(vec2 co) { return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453); }
void main() {
  vec3 c = texture2D(tDiffuse, vUv).rgb;
  float n = rand(floor(vUv / uTexel) + fract(uTime * 7.31)) - 0.5;
  if (uMode < 0.5) {
    // The render target holds unclipped HDR (tone mapping only runs on screen
    // output), so the day sky blew out to white. A filmic curve (ACES fit,
    // Narkowicz 2015) with the camera's exposure rolls it off instead
    // (approved 3.0 exposure fix).
    vec3 x = c * uExposure;
    vec3 d = clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
    gl_FragColor = vec4(d + n * uNoise, 1.0);
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
  if (ui.eo.trackMode !== simCam.trackMode) {
    ui.setEo({
      trackMode: simCam.trackMode,
      cueSinceTMs: simCam.trackMode === 'CUE' ? rt.sim.getState().clock.tMs : null,
    });
  }
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
          uExposure: { value: EO_DAY_EXPOSURE },
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

const CUE_BOX_PX = 26;

/** The track the EO is cued to (lock), else the selected track — from track estimates only. */
function useCueTarget() {
  const lock = useUiStore((st) => st.eo.lockTrackId);
  const selected = useHudStore((st) => st.hud?.selectedTrackId ?? null);
  return lock ?? selected;
}

/**
 * Cue box in --cue at the projected track estimate (MAN/CUE/ACQ), or an edge
 * arrow when the track is outside the picture (DESIGN §11.5). In TRK the box is
 * the tracker gate on the boresight: the radar estimate is coarser than a
 * zoomed-in picture. Positioned every frame by
 * writing styles directly, so it costs no React renders.
 */
function EoCueOverlay({ rt }: { rt: SimRuntime }) {
  const box = useRef<HTMLDivElement>(null);
  const arrow = useRef<HTMLDivElement>(null);
  const targetId = useCueTarget();
  useEffect(() => {
    const eo = eoSensor(rt);
    if (!eo || !targetId) return;
    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      const b = box.current;
      const a = arrow.current;
      const host = b?.parentElement;
      if (!b || !a || !host) return;
      const track = useHudStore.getState().hud?.tracks.find((t) => t.id === targetId);
      const mast = rt.sim.getState().sensorPositions[eo.id];
      if (!track || track.status !== 'ACTIVE' || !mast) {
        b.style.display = 'none';
        a.style.display = 'none';
        return;
      }
      const ui = useUiStore.getState().eo;
      if (ui.trackMode === 'TRACK') {
        // The EO tracker holds the target on the boresight: the box is its gate.
        b.style.display = 'block';
        a.style.display = 'none';
        b.style.transform = `translate(${host.clientWidth / 2 - CUE_BOX_PX / 2}px, ${host.clientHeight / 2 - CUE_BOX_PX / 2}px)`;
        return;
      }
      const pointing = rt.sim.getState().camera.lockTrackId ? rt.cameraPointing() : ui;
      const target = {
        x: track.x,
        y: rt.groundHeight(track.x, track.z) + track.altitudeAglM,
        z: track.z,
      };
      const p = projectToEo(
        mast,
        target,
        pointing.azDeg,
        pointing.elDeg,
        ui.hfovDeg,
        vfovDeg(ui.hfovDeg),
      );
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (p.onScreen) {
        b.style.display = 'block';
        a.style.display = 'none';
        const x = ((p.ndcX + 1) / 2) * w - CUE_BOX_PX / 2;
        const y = ((1 - p.ndcY) / 2) * h - CUE_BOX_PX / 2;
        b.style.transform = `translate(${x}px, ${y}px)`;
      } else {
        b.style.display = 'none';
        a.style.display = 'block';
        const e = edgePoint(p.angleRad, w, h, 14);
        a.style.transform = `translate(${e.left - 8}px, ${e.top - 8}px) rotate(${-p.angleRad}rad)`;
      }
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [rt, targetId]);

  if (!targetId) return null;
  return (
    <>
      <div
        ref={box}
        aria-hidden
        data-eo-cue-box
        className="pointer-events-none absolute left-0 top-0 hidden border border-cue"
        style={{ width: CUE_BOX_PX, height: CUE_BOX_PX }}
      />
      <div
        ref={arrow}
        aria-hidden
        data-eo-cue-arrow
        className="pointer-events-none absolute left-0 top-0 hidden"
      >
        <ChevronRight size={16} strokeWidth={2} className="text-cue" />
      </div>
    </>
  );
}

const CHIP_TONE = { MAN: 'muted', CUE: 'cue', ACQ: 'neutral', TRK: 'active' } as const;

const CHIP_HINT: Record<EoChip, string> = {
  MAN: 'Manual pointing — drag to slew, Space to cue on the selected track',
  CUE: 'Cued by radar to the selected track',
  ACQ: ACQ_REASON,
  TRK: 'EO tracker holds the target',
};

function EoStateChip() {
  const trackMode = useUiStore((s) => s.eo.trackMode);
  const cueSince = useUiStore((s) => s.eo.cueSinceTMs);
  const tMs = useHudStore((s) => s.hud?.tMs ?? 0);
  const chip = eoChip(trackMode, cueSince, tMs);
  return (
    <Tooltip content={CHIP_HINT[chip]} align="end" side="bottom">
      <StateChip tone={CHIP_TONE[chip]} pulse={chip === 'ACQ'} tabIndex={0} data-eo-state={chip}>
        {chip}
      </StateChip>
    </Tooltip>
  );
}

function EoReadout({ fovMax }: { fovMax: number }) {
  const eo = useUiStore((s) => s.eo);
  const tMs = useHudStore((s) => s.hud?.tMs ?? 0);
  const acq = eoChip(eo.trackMode, eo.cueSinceTMs, tMs) === 'ACQ';
  return (
    <>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-text-1"
      >
        <div className="absolute left-1/2 top-0 h-2 w-px bg-current" />
        <div className="absolute bottom-0 left-1/2 h-2 w-px bg-current" />
        <div className="absolute left-0 top-1/2 h-px w-2 bg-current" />
        <div className="absolute right-0 top-1/2 h-px w-2 bg-current" />
      </div>
      {acq && (
        <div className="pointer-events-none absolute inset-x-0 top-0 truncate bg-bg-1 px-2 py-0.5 text-small text-text-1">
          {ACQ_REASON}
        </div>
      )}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 flex gap-3 whitespace-nowrap bg-bg-1 px-2 text-readout leading-5">
        <span>
          <span className="text-label">Az </span>
          {formatBearing(eo.azDeg)}
        </span>
        <span>
          <span className="text-label">El </span>
          {eo.elDeg.toFixed(1)}°
        </span>
        <span>
          <span className="text-label">FOV </span>
          {eo.hfovDeg.toFixed(1)}°
        </span>
        <span>
          <span className="text-label">Zoom </span>×{(fovMax / eo.hfovDeg).toFixed(1)}
        </span>
        <span className="ml-auto text-text-2">{eo.lockTrackId ?? 'Drag to slew'}</span>
      </div>
    </>
  );
}

/** DOM part: the panel the EO <View> tracks, with drag-to-slew, wheel zoom and readouts. */
export const EoPanel = forwardRef<HTMLDivElement, { runtime: SimRuntime; commands: Commands }>(
  function EoPanel({ runtime, commands }, ref) {
    const drag = useRef<{ x: number; y: number } | null>(null);
    const mode = useUiStore((s) => s.eo.mode);
    const eo = eoSensor(runtime);
    if (!eo || eo.kind !== 'EO_IR') {
      return (
        <Panel className="h-full border-0">
          <PanelHeader title="EO/IR" />
          <StatusNotice title="No EO/IR sensor in this scenario." />
        </Panel>
      );
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
      <Panel className="h-full border-0">
        <PanelHeader title={`EO/IR · ${eo.id}`}>
          <Tooltip content="Day camera or thermal (white-hot)" shortcut="T" side="bottom">
            <StateChip tone="neutral" tabIndex={0}>
              {mode === 'IR' ? 'IR WHT' : 'DAY'}
            </StateChip>
          </Tooltip>
          <EoStateChip />
        </PanelHeader>
        <div
          ref={ref}
          data-testid="eo-picture"
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
          aria-label="EO/IR camera view. Drag to slew, scroll to zoom, Space to cue on the selected track, T for thermal."
        >
          {/* Above the shared WebGL canvas (z-5, decision 40). */}
          <div className="pointer-events-none absolute inset-0 z-10">
            <EoCueOverlay rt={runtime} />
            <EoReadout fovMax={eo.fovDegMax} />
          </div>
        </div>
      </Panel>
    );
  },
);
