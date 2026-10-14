import type { Affiliation, ContactClass, EffectorKind, Roe, SessionEndReason } from '@vyuh/shared';
import { create } from 'zustand';
import type { SimRuntime } from './runtime';

// Read-only HUD snapshot of the sim, published at most once per tick. Track
// views deliberately omit the ground-truth contact id.

export interface TrackView {
  id: string;
  status: 'ACTIVE' | 'LOST';
  rangeM: number;
  bearingDeg: number;
  altitudeAglM: number;
  headingDeg: number | null;
  speedMps: number | null;
  /** Scenario frame x (east) / z (north), metres. */
  x: number;
  z: number;
  createdTMs: number;
  markedDetected: boolean;
  classifiedAs: ContactClass | null;
  affiliation: Affiliation;
}

export interface EffectorView {
  id: string;
  kind: EffectorKind;
  rangeM: number;
  ammo: number | null;
  readyAtMs: number;
  cooldownMs: number;
}

export interface HudSnapshot {
  tMs: number;
  durationMs: number;
  endReason: SessionEndReason | null;
  roe: Roe;
  paused: boolean;
  tracks: TrackView[];
  effectors: EffectorView[];
  selectedTrackId: string | null;
}

export function snapshot(rt: SimRuntime): HudSnapshot {
  const s = rt.sim.getState();
  return {
    tMs: s.clock.tMs,
    durationMs: s.durationMs,
    endReason: s.endReason,
    roe: s.roe,
    paused: rt.paused,
    tracks: s.tracks.map((t) => ({
      id: t.id,
      status: t.status,
      rangeM: t.rangeM,
      bearingDeg: t.bearingDeg,
      altitudeAglM: t.altitudeAglM,
      headingDeg: t.headingDeg,
      speedMps: t.speedMps,
      x: t.pos.x,
      z: t.pos.z,
      createdTMs: t.createdTMs,
      markedDetected: t.markedDetected,
      classifiedAs: t.classifiedAs,
      affiliation: t.affiliation,
    })),
    effectors: s.effectors.map((e) => ({
      id: e.id,
      kind: e.kind,
      rangeM: e.rangeM,
      ammo: e.ammo,
      readyAtMs: e.readyAtMs,
      cooldownMs: e.cooldownMs,
    })),
    selectedTrackId: s.selectedTrackId,
  };
}

interface HudStore {
  hud: HudSnapshot | null;
  publish: (hud: HudSnapshot | null) => void;
}

export const useHudStore = create<HudStore>((set) => ({
  hud: null,
  publish: (hud) => set({ hud }),
}));
