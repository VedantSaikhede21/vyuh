import type { AltitudeBand, Asset, Roe } from '@vyuh/shared';
import type { EoTrackMode } from '@vyuh/sim-core';
import type { EffectorView, HudSnapshot, RfStrobeView, TrackView } from '@/lib/sim/store';

// Pure HUD derivations for the sim player (decision 66). Everything here uses
// only what the operator can see — track estimates, RF strobes, the trainee's
// own calls and effector status — never contact ids or ground truth.

/** SPEC §4.3 altitude bands: LOW < 50 m, MEDIUM 50–150 m, HIGH > 150 m AGL. */
export function altitudeBand(aglM: number): AltitudeBand {
  if (aglM < 50) return 'LOW';
  if (aglM <= 150) return 'MEDIUM';
  return 'HIGH';
}

export const ALTITUDE_BAND_LABEL: Record<AltitudeBand, string> = {
  LOW: 'LOW',
  MEDIUM: 'MED',
  HIGH: 'HIGH',
};

/** Bearing from a to b, degrees clockwise from north, [0, 360). */
export function bearingDeg(a: { x: number; z: number }, b: { x: number; z: number }): number {
  const deg = (Math.atan2(b.x - a.x, b.z - a.z) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/** Signed smallest difference a − b in degrees, (−180, 180]. */
export function angleDiffDeg(a: number, b: number): number {
  const d = ((((a - b) % 360) + 540) % 360) - 180;
  return d === -180 ? 180 : d;
}

/** Estimated slant range from an effector to a track (track estimate, not truth). */
export function slantRangeM(eff: { x: number; z: number }, track: TrackView): number {
  return Math.hypot(track.x - eff.x, track.z - eff.z, track.altitudeAglM);
}

export function formatKm(m: number): string {
  return (m / 1000).toFixed(2);
}

export function formatBearing(deg: number): string {
  return `${String(Math.round(((deg % 360) + 360) % 360) % 360).padStart(3, '0')}°`;
}

// ---- banners ---------------------------------------------------------------------------

/** A track counts as leaking when its estimate is this close to an asset edge and closing. */
export const LEAK_WARNING_M = 800;
/** Heading within this of the bearing to the asset counts as closing. */
export const CLOSING_CONE_DEG = 45;
/** EW sector half-width (SPEC §8, decision 54). */
export const EW_SECTOR_DEG = 10;

export interface Banner {
  tone: 'warn' | 'crit';
  text: string;
}

/** Closest active, not-friendly/neutral track inside LEAK_WARNING_M of an asset and closing. */
export function leakImminent(
  tracks: readonly TrackView[],
  assets: readonly Asset[],
): Banner | null {
  let best: { t: TrackView; a: Asset; gap: number } | null = null;
  for (const t of tracks) {
    if (t.status !== 'ACTIVE' || t.affiliation === 'FRIENDLY' || t.affiliation === 'NEUTRAL')
      continue;
    if (t.headingDeg === null || t.speedMps === null || t.speedMps < 1) continue;
    for (const a of assets) {
      const gap = Math.max(0, Math.hypot(t.x - a.x, t.z - a.z) - a.radiusM);
      if (gap > LEAK_WARNING_M) continue;
      if (Math.abs(angleDiffDeg(t.headingDeg, bearingDeg(t, a))) > CLOSING_CONE_DEG) continue;
      if (!best || gap < best.gap) best = { t, a, gap };
    }
  }
  if (!best) return null;
  return {
    tone: 'crit',
    text: `LEAK IMMINENT — ${best.t.id} ${formatKm(best.gap)} km from ${best.a.name}, closing`,
  };
}

/**
 * A friendly the trainee knows about inside the jam sector toward the selected
 * track: a track they marked FRIENDLY, or an RF strobe carrying a friendly ID.
 */
export function friendlyInJamSector(
  selected: TrackView | null,
  tracks: readonly TrackView[],
  strobes: readonly RfStrobeView[],
  jammer: EffectorView | null,
  jammerPos: { x: number; z: number } | null,
): Banner | null {
  if (!selected || selected.status !== 'ACTIVE' || !jammer || !jammerPos) return null;
  const sector = bearingDeg(jammerPos, selected);
  for (const t of tracks) {
    if (t.id === selected.id || t.status !== 'ACTIVE' || t.affiliation !== 'FRIENDLY') continue;
    if (slantRangeM(jammerPos, t) > jammer.rangeM) continue;
    const brg = bearingDeg(jammerPos, t);
    if (Math.abs(angleDiffDeg(brg, sector)) <= EW_SECTOR_DEG) {
      return {
        tone: 'warn',
        text: `FRIENDLY IN JAM SECTOR — ${t.id} marked friendly at ${formatBearing(brg)}`,
      };
    }
  }
  for (const s of strobes) {
    if (!s.friendlyIdCode) continue;
    if (Math.abs(angleDiffDeg(s.bearingDeg, sector)) <= EW_SECTOR_DEG) {
      return {
        tone: 'warn',
        text: `FRIENDLY IN JAM SECTOR — friendly ID ${s.friendlyIdCode} heard at ${formatBearing(s.bearingDeg)}`,
      };
    }
  }
  return null;
}

// ---- action availability ---------------------------------------------------------------

export type ActionId =
  'MARK' | 'CLASSIFY' | 'AFFILIATION' | 'MONITOR' | 'EW_JAM' | 'EW_SPOOF' | 'INTERCEPT';

export interface ActionState {
  enabled: boolean;
  /** Why it is disabled, in operator terms (DESIGN §8/§9). */
  reason: string | null;
}

const ok: ActionState = { enabled: true, reason: null };
const no = (reason: string): ActionState => ({ enabled: false, reason });

export interface EffectorSite {
  view: EffectorView;
  x: number;
  z: number;
}

const EFFECTOR_NAME = { EW_JAM: 'jammer', EW_SPOOF: 'spoofer', INTERCEPT: 'interceptor' } as const;

function effectorState(
  kind: 'EW_JAM' | 'EW_SPOOF' | 'INTERCEPT',
  site: EffectorSite | null,
  track: TrackView,
  tMs: number,
): ActionState {
  const name = EFFECTOR_NAME[kind];
  if (!site) return no(`No ${name} in this scenario`);
  const left = site.view.readyAtMs - tMs;
  if (left > 0) return no(`${capitalise(name)} reloading — ${(left / 1000).toFixed(1)} s`);
  if (site.view.ammo !== null && site.view.ammo <= 0) return no(`No ${name} rounds left`);
  const range = slantRangeM(site, track);
  if (range > site.view.rangeM) {
    return no(`Out of range — ${formatKm(range)} km > ${formatKm(site.view.rangeM)} km`);
  }
  return ok;
}

function capitalise(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function roeBlocksIntercept(roe: Roe, track: TrackView): string | null {
  if (roe === 'WEAPONS_HOLD') return 'ROE: weapons hold — no intercept';
  if (roe === 'WEAPONS_TIGHT' && track.affiliation !== 'HOSTILE') {
    return 'ROE: weapons tight — declare the track HOSTILE first (H)';
  }
  return null;
}

/** Enabled state + disabled reason for every action on the selected track. */
export function actionStates(
  hud: HudSnapshot,
  sites: Partial<Record<'EW_JAM' | 'EW_SPOOF' | 'INTERCEPT', EffectorSite>>,
): Record<ActionId, ActionState> {
  const track = hud.tracks.find((t) => t.id === hud.selectedTrackId) ?? null;
  let common: ActionState = ok;
  if (hud.endReason !== null) common = no('Session over');
  else if (!track) common = no('Select a track first (Tab or click)');
  else if (track.status !== 'ACTIVE') common = no(`${track.id} lost — select an active track`);
  if (!common.enabled || !track) {
    return {
      MARK: common,
      CLASSIFY: common,
      AFFILIATION: common,
      MONITOR: common,
      EW_JAM: common,
      EW_SPOOF: common,
      INTERCEPT: common,
    };
  }
  const roe = roeBlocksIntercept(hud.roe, track);
  return {
    MARK: track.markedDetected ? no(`${track.id} already marked detected`) : ok,
    CLASSIFY: ok,
    AFFILIATION: ok,
    MONITOR: ok,
    EW_JAM: effectorState('EW_JAM', sites.EW_JAM ?? null, track, hud.tMs),
    EW_SPOOF: effectorState('EW_SPOOF', sites.EW_SPOOF ?? null, track, hud.tMs),
    INTERCEPT: sites.INTERCEPT
      ? roe
        ? no(roe)
        : effectorState('INTERCEPT', sites.INTERCEPT, track, hud.tMs)
      : no('No interceptor in this scenario'),
  };
}

// ---- EO state chip ----------------------------------------------------------------------

/** CUE held this long without a video lock shows as ACQ (UI-only, decision 66). */
export const ACQ_AFTER_MS = 1500;

export type EoChip = 'MAN' | 'CUE' | 'ACQ' | 'TRK';

export const ACQ_REASON = 'No video lock — target below detection threshold at this zoom/range';

export function eoChip(mode: EoTrackMode, cueSinceTMs: number | null, tMs: number): EoChip {
  if (mode === 'TRACK') return 'TRK';
  if (mode === 'MANUAL') return 'MAN';
  return cueSinceTMs !== null && tMs - cueSinceTMs >= ACQ_AFTER_MS ? 'ACQ' : 'CUE';
}
