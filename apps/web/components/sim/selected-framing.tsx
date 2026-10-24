'use client';

import { useFrame, useThree } from '@react-three/fiber';
import { toThree } from '@vyuh/sim-core';
import { useEffect, useRef } from 'react';
import { PerspectiveCamera, Spherical, Vector3, type Camera } from 'three';
import {
  FRAMING_CHECK_MS,
  FRAMING_MS,
  HANDS_OFF_MS,
  azimuthBehind,
  inFrame,
  orbitAt,
  type Orbit,
} from '@/lib/sim/framing';
import { useHudStore } from '@/lib/sim/store';
import { useSimRuntime } from './sim-context';

/** What this needs of drei's OrbitControls (made default in the tactical scene). */
interface Orbiter {
  target: Vector3;
  update: () => void;
  addEventListener: (type: 'start', fn: () => void) => void;
  removeEventListener: (type: 'start', fn: () => void) => void;
}

/** Largest orbit radius the framing may pull back to (the controls' maxDistance). */
const MAX_RADIUS = 12_000;
/** Above the marker, where the label sits. */
const LIFT_M = 40;

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Keeps the selected track in the tactical view (audit P0-6). When a track is
 * selected — or checked once a second while the trainee is not orbiting — and
 * it is out of frame, the orbit camera eases around the defended position to
 * look past it at the track, pulling back only as far as needed. Orbit input
 * cancels the ease and holds the camera for HANDS_OFF_MS; reduced motion jumps.
 * It never moves while the track is in frame.
 */
export function SelectedFraming() {
  const rt = useSimRuntime();
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as Orbiter | null;
  const state = useRef({
    selected: null as string | null,
    nextCheck: 0,
    userAt: -Infinity,
    anim: null as { from: Orbit; to: Orbit; start: number; ms: number } | null,
  });
  const tmp = useRef({ v: new Vector3(), s: new Spherical(), cam: new PerspectiveCamera() });

  useEffect(() => {
    if (!controls) return;
    const onStart = () => {
      state.current.userAt = performance.now();
      state.current.anim = null;
    };
    controls.addEventListener('start', onStart);
    return () => controls.removeEventListener('start', onStart);
  }, [controls]);

  useFrame(() => {
    if (!controls) return;
    const st = state.current;
    const now = performance.now();
    const target = controls.target;

    if (st.anim) {
      const t = st.anim.ms <= 0 ? 1 : (now - st.anim.start) / st.anim.ms;
      const o = orbitAt(st.anim.from, st.anim.to, t);
      tmp.current.s.set(o.radius, o.phi, o.theta);
      camera.position.setFromSpherical(tmp.current.s).add(target);
      controls.update();
      if (t >= 1) st.anim = null;
      return;
    }

    const hud = useHudStore.getState().hud;
    const id = hud?.selectedTrackId ?? null;
    const changed = id !== st.selected;
    st.selected = id;
    if (!id || !hud) return;
    if (!changed && (now < st.nextCheck || now - st.userAt < HANDS_OFF_MS)) return;
    st.nextCheck = now + FRAMING_CHECK_MS;
    const track = hud.tracks.find((t) => t.id === id && t.status === 'ACTIVE');
    if (!track) return;

    const ground = rt.groundHeight(track.x, track.z);
    const p = toThree({ x: track.x, y: ground + track.altitudeAglM + LIFT_M, z: track.z });
    const point = new Vector3(p.x, p.y, p.z);
    if (inFrame(tmp.current.v.copy(point).project(camera))) return;

    const from = tmp.current.s.setFromVector3(tmp.current.v.copy(camera.position).sub(target));
    const start: Orbit = { theta: from.theta, phi: from.phi, radius: from.radius };
    const goal: Orbit = { ...start, theta: azimuthBehind(target, point) };
    goal.radius = radiusToFrame(tmp.current.cam, camera, target, goal, point);
    st.anim = { from: start, to: goal, start: now, ms: reducedMotion() ? 0 : FRAMING_MS };
  });
  return null;
}

/** The smallest radius (≥ the goal's, ≤ MAX_RADIUS) at which `point` is in frame. */
function radiusToFrame(
  probe: PerspectiveCamera,
  camera: Camera,
  target: Vector3,
  goal: Orbit,
  point: Vector3,
): number {
  if (camera instanceof PerspectiveCamera) probe.copy(camera);
  const s = new Spherical();
  const v = new Vector3();
  let r = goal.radius;
  for (let i = 0; i < 10; i++) {
    s.set(r, goal.phi, goal.theta);
    probe.position.setFromSpherical(s).add(target);
    probe.lookAt(target);
    probe.updateMatrixWorld();
    if (inFrame(v.copy(point).project(probe)) || r >= MAX_RADIUS) break;
    r = Math.min(r * 1.25, MAX_RADIUS);
  }
  return r;
}
