// Colours drawn by WebGL (three.js) and 2D canvas, which cannot read CSS
// variables. UI groups come from lib/theme/tokens.ts, the one source (decision
// 164); only physical-look colours (sky, ground, IR) are defined here.

import { affiliation, interaction, status, surfaces, text } from './tokens';

/** DESIGN §3 values for canvas/WebGL UI overlays (PPI, track markers). */
export const UI = {
  bg0: surfaces['bg-0'],
  bg1: surfaces['bg-1'],
  bg2: surfaces['bg-2'],
  bg3: surfaces['bg-3'],
  line1: surfaces['line-1'],
  line2: surfaces['line-2'],
  text1: text['text-1'],
  text2: text['text-2'],
  text3: text['text-3'],
  select: interaction.select,
  cue: interaction.cue,
  ok: status.ok,
  warn: status.warn,
  crit: status.crit,
} as const;

/** DESIGN §3 affiliation colours (always paired with shape + letter). */
export const AFFILIATION_HEX = {
  HOSTILE: affiliation['aff-hostile'],
  FRIENDLY: affiliation['aff-friendly'],
  NEUTRAL: affiliation['aff-neutral'],
  UNKNOWN: affiliation['aff-unknown'],
} as const;

/** RF strobes: chrome, not a signal colour, so they never read as H/F/N/U (approved 3.0). */
export const RF_STROBE = UI.text2;

/** `rgba()` string from a `#rrggbb` token, for canvas gradients and fades. */
export function withAlpha(hex: string, alpha: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
}

/** Radar PPI (canvas). */
export const PPI = {
  background: UI.bg0,
  rings: UI.line2,
  ringLabels: UI.text2,
  north: UI.text2,
  assetRing: UI.text2,
  sweep: UI.text1,
  selected: UI.select,
  /** Defended asset square and its name. */
  asset: UI.select,
  assetLabel: UI.text1,
} as const;

/** Sky, haze and light colours for the 3D views (physical look, not UI). */
export const SKY = {
  day: '#9fb4c4',
  night: '#0b1020',
  dusk: '#b4876a',
  haze: '#a9adb0',
  hemiSkyDay: '#dfe9f0',
  hemiSkyNight: '#27324d',
  hemiGroundDay: '#3a3a2a',
  hemiGroundNight: '#0a0a0c',
  sunLow: '#ffb26b',
  sunHigh: '#fff6e8',
  /** Thermal sky is cold. */
  ir: '#050505',
} as const;

/** Terrain, buildings and drone bodies (physical look). */
export const GROUND = {
  fieldLow: '#3b5228',
  fieldHigh: '#6a6a3e',
  rock: '#6e6a62',
  snow: '#e6eaee',
  buildings: '#9a9284',
  droneBody: '#1a1d21',
} as const;

/** White-hot thermal materials. */
export const IR = {
  terrain: '#6a6a6a',
  buildings: '#8a8a8a',
  contacts: '#ffffff',
} as const;

/** Own-site markers in the tactical view: neutral chrome, never signal colours. */
export const SITES = {
  assetRing: UI.text1,
  assetMast: '#8a8f7a',
  effectorRing: UI.text3,
  sensorMast: '#c9ced3',
  /** Track marker stem / selection bracket. */
  markerStem: UI.select,
} as const;

/**
 * Zones (NO_KINETIC, BORDER_LINE) in the tactical view and on the PPI: neutral
 * chrome with hatching / dashes, never affiliation or status colours (Step 10).
 */
export const ZONES = {
  outline: UI.text2,
  hatch: UI.line2,
  /** Hatching on terrain needs more contrast than on the dark PPI. */
  hatchTerrain: UI.text3,
  label: UI.text2,
  border: UI.text3,
} as const;

/**
 * CSS font shorthand for canvas text in IBM Plex Mono. next/font generates the
 * family name at build time, so it is read from the `--font-plex-mono` variable.
 */
export function canvasMonoFont(px: number, weight = 500): string {
  const family =
    typeof document === 'undefined'
      ? ''
      : getComputedStyle(document.documentElement).getPropertyValue('--font-plex-mono').trim();
  return `${weight} ${px}px ${family ? `${family}, ` : ''}ui-monospace, monospace`;
}
