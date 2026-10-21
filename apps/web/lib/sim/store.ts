import type { Affiliation, ContactClass, EffectorKind, Roe, SessionEndReason } from '@vyuh/shared';
import { create } from 'zustand';
import type { SimRuntime } from './runtime';

// Read-only HUD snapshot of the sim, published at most once per tick. Track
// views deliberately omit the ground-truth contact id.

export interface TrackView {
  id: string;
  /** Sensor that holds the track (its range and bearing are from there). */
  sensorId: string;
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
  /** RF strobe lined up with the track (band, friendly ID), or null. */
  rf: { band: string | null; friendlyIdCode: string | null } | null;
}

/** An RF bearing strobe as the operator sees it (no contact id, no range). */
export interface RfStrobeView {
  id: string;
  sensorId: string;
  bearingDeg: number;
  band: string | null;
  friendlyIdCode: string | null;
  /** Time since first heard. */
  ageMs: number;
}

export interface EffectorView {
  id: string;
  kind: EffectorKind;
  rangeM: number;
  ammo: number | null;
  readyAtMs: number;
  cooldownMs: number;
}

export interface HudAlert {
  tMs: number;
  text: string;
  tone: 'info' | 'good' | 'warn' | 'bad';
}

export interface HudSnapshot {
  tMs: number;
  durationMs: number;
  endReason: SessionEndReason | null;
  roe: Roe;
  paused: boolean;
  tracks: TrackView[];
  rfStrobes: RfStrobeView[];
  effectors: EffectorView[];
  selectedTrackId: string | null;
  /** Newest first; built only from what the operator could observe. */
  alerts: HudAlert[];
}

const MAX_ALERTS = 4;

function recentAlerts(rt: SimRuntime): HudAlert[] {
  const events = rt.sim.getEvents();
  const out: HudAlert[] = [];
  for (let i = events.length - 1; i >= 0 && out.length < MAX_ALERTS; i--) {
    const e = events[i]!;
    if (e.type === 'SENSOR_TRACK_CREATED') {
      out.push({ tMs: e.tMs, text: `New track ${e.trackId}`, tone: 'warn' });
    } else if (e.type === 'SENSOR_TRACK_LOST') {
      out.push({ tMs: e.tMs, text: `Track ${e.trackId} lost`, tone: 'info' });
    } else if (e.type === 'RESPONSE_OUTCOME') {
      const r = e.payload.result;
      const tone = r === 'NEUTRALISED' ? 'good' : r === 'MISSED' ? 'warn' : 'bad';
      out.push({ tMs: e.tMs, text: `${e.trackId} ${e.payload.response}: ${r}`, tone });
    } else if (e.type === 'CONTACT_REACHED_ASSET') {
      const asset = rt.scenario.assets.find((a) => a.id === e.payload.assetId);
      out.push({ tMs: e.tMs, text: `IMPACT at ${asset?.name ?? 'asset'}`, tone: 'bad' });
    }
  }
  return out;
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
      sensorId: t.sensorId,
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
      rf: t.rf && { band: t.rf.band, friendlyIdCode: t.rf.friendlyIdCode },
    })),
    rfStrobes: s.rfStrobes.map((r) => ({
      id: r.id,
      sensorId: r.sensorId,
      bearingDeg: r.bearingDeg,
      band: r.band,
      friendlyIdCode: r.friendlyIdCode,
      ageMs: s.clock.tMs - r.firstTMs,
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
    alerts: recentAlerts(rt),
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
