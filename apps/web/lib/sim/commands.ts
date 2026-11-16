'use client';

import type { Affiliation, ContactClass } from '@vyuh/shared';
import type { CommsStatus } from '@/components/hud/primitives/comms-log';
import { CLASS_LABEL, EFFECTOR_LABEL } from '@/lib/strings';
import type { SimCommand } from '@vyuh/sim-core';
import { useEffect, useMemo } from 'react';
import type { SimRuntime } from './runtime';
import { effectorSites } from '@/components/hud/use-hud-derived';
import { actionStates, roeBlocksIntercept, type ActionId } from '@/lib/hud/derive';
import { reportText } from '@/lib/hud/comms';
import { frameFovDeg, pickStep, searchFovDeg } from '@/lib/hud/cue-zoom';
import { weaponsTightHint } from '@/lib/hud/hints';
import { prefillReport, reportPayload, type ReportDraft } from '@/lib/hud/report';
import { snapshot, useHudStore } from './store';
import { useUiStore } from './ui-store';
import type { EoTrackMode } from '@vyuh/sim-core';

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

/** Radar range used to choose the cue zoom when a track has none to read (m). */
const CUE_DEFAULT_RANGE_M = 2000;

export function useCommands(rt: SimRuntime | null) {
  const commands = useMemo(() => {
    if (!rt) return null;
    const ui = useUiStore.getState;
    let lastSlewLog = -Infinity;
    let trailing: ReturnType<typeof setTimeout> | null = null;

    const now = () => rt.sim.getState().clock.tMs;
    const say = (text: string, status: CommsStatus = 'warn') => ui().say(now(), text, status);

    /** Comms echo for an accepted command (DESIGN §9: acknowledged within 100 ms). */
    const echoText = (cmd: SimCommand): string | null => {
      switch (cmd.type) {
        case 'MARKED_DETECTED':
          return `${cmd.trackId} MARKED DETECTED`;
        case 'CLASSIFIED':
          return `${cmd.trackId} CLASSIFIED  ${CLASS_LABEL[cmd.payload.class].toUpperCase()}`;
        case 'AFFILIATION_SET':
          return `${cmd.trackId} AFFILIATION  ${cmd.payload.affiliation}`;
        case 'RESPONSE_ORDERED': {
          const r = cmd.payload.response;
          const name =
            r === 'EW_JAM' || r === 'EW_SPOOF' || r === 'INTERCEPT' ? EFFECTOR_LABEL[r] : r;
          return `${name} ORDERED  ${cmd.trackId}`;
        }
        case 'REPORT_SUBMITTED':
          return reportText(cmd.payload);
        default:
          return null; // selection and camera moves are acknowledged visually
      }
    };

    const send = (cmd: SimCommand): boolean => {
      const res = rt.dispatch(cmd);
      if (!res.ok) {
        say(res.reason);
        return false;
      }
      const text = echoText(cmd);
      if (text) ui().echo(now(), text);
      return true;
    };

    // A selection is applied on the sim's next tick; until then commands must
    // still act on it, or a key pressed right after a click is rejected.
    let pendingSelect: string | null = null;
    const selected = (): string | null => {
      const id = pendingSelect ?? rt.sim.getState().selectedTrackId;
      if (!id) say('Select a track first (Tab or click).');
      return id;
    };

    /**
     * A shortcut for a disabled control answers with the same reason the
     * button's tooltip gives, instead of sending an order (DESIGN §9).
     */
    const allowed = (action: ActionId): boolean => {
      const hud = snapshot(rt);
      if (pendingSelect) hud.selectedTrackId = pendingSelect;
      const state = actionStates(hud, effectorSites(rt, hud), rt.scenario.zones, rt.mode)[action];
      if (!state.enabled && state.reason) say(state.reason);
      // Practice: a refused intercept under WEAPONS_TIGHT also gets a hint (decision 82).
      const track = hud.tracks.find((t) => t.id === hud.selectedTrackId);
      if (
        !state.enabled &&
        action === 'INTERCEPT' &&
        rt.mode === 'PRACTICE' &&
        hud.roe === 'WEAPONS_TIGHT' &&
        track &&
        roeBlocksIntercept(hud.roe, track)
      ) {
        const h = weaponsTightHint(track.id);
        ui().hint(now(), h.key, h.text);
      }
      return state.enabled;
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

    /** Zoom steps of this scenario's EO sensor, widest first (empty without one). */
    const steps = () => {
      const eo = eoSensor(rt);
      return eo?.kind === 'EO_IR' ? eoFovSteps(eo.fovDegMax, eo.fovDegMin) : [];
    };
    /** Radar range of a track as the HUD shows it (no truth). */
    const rangeOf = (trackId: string) =>
      useHudStore.getState().hud?.tracks.find((t) => t.id === trackId)?.rangeM ??
      CUE_DEFAULT_RANGE_M;

    const select = (trackId: string) => {
      ui().set({ classifyMenu: false, interceptArmed: false });
      if (send({ type: 'TRACK_SELECTED', trackId, payload: {} })) {
        pendingSelect = trackId;
        // Cleared once the sim has applied it (next tick).
        const at = now();
        const clear = () => {
          if (now() > at || rt.ended) pendingSelect = null;
          else setTimeout(clear, 25);
        };
        setTimeout(clear, 25);
      }
    };

    return {
      select,
      cycle(dir: 1 | -1) {
        const tracks = activeTracks();
        if (tracks.length === 0) return say('No active tracks.', 'info');
        const cur = tracks.findIndex(
          (t) => t.id === (pendingSelect ?? rt.sim.getState().selectedTrackId),
        );
        const next = tracks[(cur + dir + tracks.length) % tracks.length]!;
        select(next.id);
      },
      markDetected() {
        const id = selected();
        if (id && allowed('MARK')) send({ type: 'MARKED_DETECTED', trackId: id, payload: {} });
      },
      classify(cls: ContactClass) {
        const id = selected();
        ui().set({ classifyMenu: false });
        if (id) send({ type: 'CLASSIFIED', trackId: id, payload: { class: cls } });
      },
      /** Y: accept the AI suggestion — logs the answer and classifies as suggested. */
      acceptAi() {
        const id = selected();
        const ai = id ? rt.sim.getState().tracks.find((t) => t.id === id) : undefined;
        if (!id || !ai?.aiShown || !ai.aiSuggestion) return say('No AI suggestion on this track.');
        if (ai.aiDecision) return say(`AI suggestion already ${ai.aiDecision.toLowerCase()}.`);
        const payload = { ...ai.aiSuggestion };
        if (send({ type: 'AI_SUGGESTION_ACCEPTED', trackId: id, payload }))
          send({ type: 'CLASSIFIED', trackId: id, payload: { class: payload.suggestedClass } });
      },
      /** X: reject the AI suggestion (the track keeps its own classification). */
      rejectAi() {
        const id = selected();
        const ai = id ? rt.sim.getState().tracks.find((t) => t.id === id) : undefined;
        if (!id || !ai?.aiShown || !ai.aiSuggestion) return say('No AI suggestion on this track.');
        if (ai.aiDecision) return say(`AI suggestion already ${ai.aiDecision.toLowerCase()}.`);
        send({ type: 'AI_SUGGESTION_REJECTED', trackId: id, payload: { ...ai.aiSuggestion } });
      },
      setAffiliation(affiliation: Affiliation) {
        const id = selected();
        if (id) send({ type: 'AFFILIATION_SET', trackId: id, payload: { affiliation } });
      },
      monitor() {
        const id = selected();
        if (id && allowed('MONITOR'))
          send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'MONITOR' } });
      },
      /** EW is non-kinetic and not ROE-gated, so it needs no confirm step (decision 54). */
      jam() {
        const id = selected();
        if (id && allowed('EW_JAM'))
          send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'EW_JAM' } });
      },
      spoof() {
        const id = selected();
        if (id && allowed('EW_SPOOF'))
          send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'EW_SPOOF' } });
      },
      armIntercept() {
        if (selected() && allowed('INTERCEPT'))
          ui().set({ interceptArmed: true, classifyMenu: false });
      },
      confirmIntercept() {
        const id = selected();
        ui().set({ interceptArmed: false });
        if (id && allowed('INTERCEPT'))
          send({ type: 'RESPONSE_ORDERED', trackId: id, payload: { response: 'INTERCEPT' } });
      },
      cancel() {
        ui().set({
          classifyMenu: false,
          interceptArmed: false,
          endArmed: false,
          cheatSheet: false,
          report: null,
        });
      },
      /** Open the contact report form, prefilled from the selected track (R). */
      openReport() {
        const id = selected();
        if (!id || !allowed('REPORT')) return;
        const hud = snapshot(rt);
        const draft = prefillReport(hud, [id]);
        if (draft) ui().set({ report: draft, classifyMenu: false, interceptArmed: false });
      },
      updateReport(draft: ReportDraft) {
        ui().set({ report: draft });
      },
      submitReport() {
        const draft = ui().report;
        if (!draft) return;
        if (send({ type: 'REPORT_SUBMITTED', payload: reportPayload(draft, now()) })) {
          ui().set({ report: null });
        }
      },
      /** Threat-library entry for the selected track's class, or the picker (L). */
      openLibrary(cls?: ContactClass | null) {
        const hud = snapshot(rt);
        const id = pendingSelect ?? hud.selectedTrackId;
        const track = hud.tracks.find((t) => t.id === id);
        ui().set({
          library: { cls: cls !== undefined ? cls : (track?.classifiedAs ?? null) },
          classifyMenu: false,
          interceptArmed: false,
        });
      },
      togglePause() {
        if (rt.mode !== 'PRACTICE') return say('Pause is only available in practice mode.');
        rt.setPaused(!rt.paused);
        say(rt.paused ? 'PAUSED' : 'RESUMED', 'info');
        useHudStore.getState().publish(snapshot(rt));
      },
      /**
       * Lock the camera on the selected track; sim-core slews and follows it. The
       * field of view opens wide enough for the EO tracker to find the target despite
       * the radar's pointing error, then `advanceCue` zooms in once it holds it.
       */
      slewToSelected() {
        const id = selected();
        if (!id) return;
        // Already holding this target: nothing to search for.
        if (ui().eo.lockTrackId === id && ui().eo.trackMode === 'TRACK') return;
        const s = steps();
        ui().setEo({
          lockTrackId: id,
          ...(s.length ? { hfovDeg: pickStep(s, searchFovDeg(rangeOf(id))) } : {}),
          autoFrame: s.length ? { trackId: id, stage: 'SEARCH' } : null,
        });
        logSlew();
      },
      /** Cue framing step on a camera mode change (decision 176): TRACK → frame, lost → search. */
      advanceCue(next: EoTrackMode, prev: EoTrackMode) {
        const { eo } = ui();
        const af = eo.autoFrame;
        if (!af) return;
        if (next === 'MANUAL' || af.trackId !== eo.lockTrackId) {
          ui().setEo({ autoFrame: null });
          return;
        }
        const s = steps();
        if (next === 'TRACK' && af.stage === 'SEARCH') {
          const hfov = pickStep(s, frameFovDeg(rangeOf(af.trackId)));
          ui().setEo({ autoFrame: { ...af, stage: 'FRAMED' } });
          if (hfov < eo.hfovDeg) {
            ui().setEo({ hfovDeg: hfov });
            logSlew();
          }
        } else if (next === 'CUE' && prev === 'TRACK' && af.stage === 'FRAMED') {
          const hfov = pickStep(s, searchFovDeg(rangeOf(af.trackId)));
          ui().setEo({ autoFrame: { ...af, stage: 'SEARCH' } });
          if (hfov > eo.hfovDeg) {
            ui().setEo({ hfovDeg: hfov });
            logSlew();
          }
        }
      },
      slewBy(dAzDeg: number, dElDeg: number) {
        const { eo } = ui();
        ui().setEo({
          azDeg: (((eo.azDeg + dAzDeg) % 360) + 360) % 360,
          elDeg: Math.max(-10, Math.min(60, eo.elDeg + dElDeg)),
          lockTrackId: null,
          autoFrame: null,
        });
        logSlew();
      },
      toggleEoMode() {
        const mode = ui().eo.mode === 'DAY' ? 'IR' : 'DAY';
        ui().setEo({ mode });
        say(mode === 'IR' ? 'EO THERMAL (WHITE-HOT)' : 'EO DAY CAMERA', 'info');
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
        // A manual zoom takes over from cue framing.
        ui().setEo({ hfovDeg: next, autoFrame: null });
        logSlew();
      },
      /** End session is irreversible: first press arms, second (or Enter) confirms (DESIGN §9). */
      armEnd() {
        ui().set({ endArmed: true, interceptArmed: false, classifyMenu: false });
      },
      abort() {
        ui().set({ endArmed: false });
        rt.sim.end('ABORTED');
      },
    };
  }, [rt]);

  // Cue framing follows the camera's mode, which the EO view mirrors from the sim.
  useEffect(() => {
    if (!commands) return;
    return useUiStore.subscribe((s, prev) => {
      if (s.eo.trackMode !== prev.eo.trackMode)
        commands.advanceCue(s.eo.trackMode, prev.eo.trackMode);
    });
  }, [commands]);

  return commands;
}

export type Commands = NonNullable<ReturnType<typeof useCommands>>;
