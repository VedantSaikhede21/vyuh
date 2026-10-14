'use client';

import type { Affiliation, ContactClass } from '@vyuh/shared';
import type { SimCommand } from '@vyuh/sim-core';
import { useMemo } from 'react';
import type { SimRuntime } from './runtime';
import { snapshot, useHudStore } from './store';
import { useUiStore } from './ui-store';

/** EO zoom steps as fractions between the sensor's widest and narrowest FOV. */
const ZOOM_STEPS = 5;
/**
 * SPEC §4.2: CAMERA_SLEWED is throttled to at most 2 per second. A trailing
 * event always follows the end of a gesture, so the sim's pointing settles on
 * exactly what the trainee sees (decision 37).
 */
const SLEW_LOG_INTERVAL_MS = 500;

export function eoFovSteps(fovMax: number, fovMin: number): number[] {
  const ratio = fovMin / fovMax;
  return Array.from({ length: ZOOM_STEPS }, (_, i) => fovMax * ratio ** (i / (ZOOM_STEPS - 1)));
}

export function eoSensor(rt: SimRuntime) {
  return rt.scenario.sensors.find((s) => s.kind === 'EO_IR') ?? null;
}

export function useCommands(rt: SimRuntime | null) {
  return useMemo(() => {
    if (!rt) return null;
    const ui = useUiStore.getState;
    let lastSlewLog = -Infinity;
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const say = (text: string, tone: 'info' | 'warn' | 'bad' = 'info') =>
      ui().set({ message: { text, tone } });

    const send = (cmd: SimCommand): boolean => {
      const res = rt.dispatch(cmd);
      if (!res.ok) say(res.reason, 'warn');
      return res.ok;
    };

    const selected = (): string | null => {
      const id = rt.sim.getState().selectedTrackId;
      if (!id) say('Select a track first (Tab or click).', 'warn');
      return id;
    };

    const activeTracks = () => rt.sim.getState().tracks.filter((t) => t.status === 'ACTIVE');

    const logSlew = () => {
      const { eo } = ui();
      const fovMax = eoSensor(rt)?.fovDegMax ?? eo.hfovDeg;
      const emit = () => {
        lastSlewLog = performance.now();
        trailing = null;
        const cur = ui().eo;
        rt.dispatch({
          type: 'CAMERA_SLEWED',
          ...(cur.lockTrackId ? { trackId: cur.lockTrackId } : {}),
          payload: {
            azDeg: ((cur.azDeg % 360) + 360) % 360,
            elDeg: Math.max(-90, Math.min(90, cur.elDeg)),
            zoom: fovMax / cur.hfovDeg,
            mode: cur.mode,
          },
        });
      };
      const wait = lastSlewLog + SLEW_LOG_INTERVAL_MS - performance.now();
      if (wait <= 0) emit();
      else trailing ??= setTimeout(emit, wait);
    };

    const select = (trackId: string) => {
      ui().set({ classifyMenu: false, interceptArmed: false });
      send({ type: 'TRACK_SELECTED', trackId, payload: {} });
    };

    return {
      select,
      cycle(dir: 1 | -1) {
        const tracks = activeTracks();
        if (tracks.length === 0) return say('No active tracks.', 'info');
        const cur = tracks.findIndex((t) => t.id === rt.sim.getState().selectedTrackId);
        const next = tracks[(cur + dir + tracks.length) % tracks.length]!;
        select(next.id);
      },
      markDetected() {
        const id = selected();
        if (id) send({ type: 'MARKED_DETECTED', trackId: id, payload: {} });
      },
      classify(cls: ContactClass) {
        const id = selected();
        ui().set({ classifyMenu: false });
        if (id) send({ type: 'CLASSIFIED', trackId: id, payload: { class: cls } });
      },
      setAffiliation(affiliation: Affiliation) {
        const id = selected();
        if (id) send({ type: 'AFFILIATION_SET', trackId: id, payload: { affiliation } });
      },
      monitor() {
        const id = selected();
        if (id) send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'MONITOR' } });
      },
      /** EW is non-kinetic and not ROE-gated, so it needs no confirm step (decision 54). */
      jam() {
        const id = selected();
        if (id) send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'EW_JAM' } });
      },
      spoof() {
        const id = selected();
        if (id) send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'EW_SPOOF' } });
      },
      armIntercept() {
        if (selected()) ui().set({ interceptArmed: true, classifyMenu: false });
      },
      confirmIntercept() {
        const id = selected();
        ui().set({ interceptArmed: false });
        if (id) send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'INTERCEPT' } });
      },
      cancel() {
        ui().set({ classifyMenu: false, interceptArmed: false, cheatSheet: false, message: null });
      },
      togglePause() {
        if (rt.mode !== 'PRACTICE') return say('Pause is only available in practice mode.', 'warn');
        rt.setPaused(!rt.paused);
        useHudStore.getState().publish(snapshot(rt));
      },
      /** Lock the camera on the selected track; sim-core slews and follows it. */
      slewToSelected() {
        const id = selected();
        if (!id) return;
        ui().setEo({ lockTrackId: id });
        logSlew();
      },
      slewBy(dAzDeg: number, dElDeg: number) {
        const { eo } = ui();
        ui().setEo({
          azDeg: (((eo.azDeg + dAzDeg) % 360) + 360) % 360,
          elDeg: Math.max(-10, Math.min(60, eo.elDeg + dElDeg)),
          lockTrackId: null,
        });
        logSlew();
      },
      toggleEoMode() {
        const mode = ui().eo.mode === 'DAY' ? 'IR' : 'DAY';
        ui().setEo({ mode });
        say(mode === 'IR' ? 'EO/IR: thermal (white-hot)' : 'EO/IR: day camera');
        logSlew();
      },
      endSlew: logSlew,
      zoom(dir: 1 | -1) {
        const eo = eoSensor(rt);
        if (!eo) return;
        const steps = eoFovSteps(eo.fovDegMax, eo.fovDegMin);
        const cur = ui().eo.hfovDeg;
        const idx = steps.reduce(
          (best, f, i) => (Math.abs(f - cur) < Math.abs(steps[best]! - cur) ? i : best),
          0,
        );
        const next = steps[Math.max(0, Math.min(steps.length - 1, idx + dir))]!;
        ui().setEo({ hfovDeg: next });
        logSlew();
      },
      abort() {
        rt.sim.end('ABORTED');
      },
    };
  }, [rt]);
}

export type Commands = NonNullable<ReturnType<typeof useCommands>>;
