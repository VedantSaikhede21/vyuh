import type { ContactClass, Roe } from '@vyuh/shared';
import type { EoTrackMode } from '@vyuh/sim-core';

// User-facing strings for the sim player, kept in one file so they can be
// translated later (SPEC §15.2).

/** Classify menu order: key 1–9, then 0. */
export const CLASS_MENU: { key: string; cls: ContactClass; label: string }[] = [
  { key: '1', cls: 'QUAD_SMALL', label: 'Small quadcopter' },
  { key: '2', cls: 'QUAD_HEAVY', label: 'Heavy multirotor' },
  { key: '3', cls: 'FPV', label: 'FPV drone' },
  { key: '4', cls: 'FIXED_WING_SMALL', label: 'Small fixed-wing' },
  { key: '5', cls: 'LOITERING_GENERIC', label: 'Loitering munition' },
  { key: '6', cls: 'BIRD_SMALL', label: 'Small bird' },
  { key: '7', cls: 'BIRD_LARGE', label: 'Large bird' },
  { key: '8', cls: 'FRIENDLY_QUAD', label: 'Friendly quad' },
  { key: '9', cls: 'CIVILIAN_HOBBY', label: 'Civilian hobby drone' },
  { key: '0', cls: 'HELICOPTER_FRIENDLY', label: 'Friendly helicopter' },
];

export const CLASS_LABEL = Object.fromEntries(CLASS_MENU.map((c) => [c.cls, c.label])) as Record<
  ContactClass,
  string
>;

export const ROE_LABEL: Record<Roe, string> = {
  WEAPONS_FREE: 'WEAPONS FREE',
  WEAPONS_TIGHT: 'WEAPONS TIGHT',
  WEAPONS_HOLD: 'WEAPONS HOLD',
};

export const ROE_HINT: Record<Roe, string> = {
  WEAPONS_FREE: 'Engage any track you assess as a threat.',
  WEAPONS_TIGHT: 'Engage only tracks you have declared HOSTILE.',
  WEAPONS_HOLD: 'Do not engage.',
};

export const RESULT_LABEL: Record<string, string> = {
  NEUTRALISED: 'target neutralised',
  MISSED: 'missed',
  NO_EFFECT: 'no effect',
  BLOCKED_BY_ROE: 'blocked by ROE',
  OUT_OF_RANGE: 'out of range',
  COOLDOWN: 'interceptor reloading',
  NO_AMMO: 'no rounds left',
};

export const SHORTCUTS: { keys: string; action: string; later?: boolean }[] = [
  { keys: 'Tab / Shift+Tab', action: 'Next / previous track' },
  { keys: 'Space', action: 'Lock EO camera on selected track' },
  { keys: '+ / -', action: 'Zoom EO camera' },
  { keys: 'T', action: 'Toggle day / thermal (IR)' },
  { keys: 'D', action: 'Mark detected' },
  { keys: 'C then 1–9, 0', action: 'Classify' },
  { keys: 'H F N U', action: 'Affiliation hostile / friendly / neutral / unknown' },
  { keys: 'M', action: 'Monitor' },
  { keys: 'J S', action: 'Jam / spoof', later: true },
  { keys: 'I then Enter', action: 'Intercept (confirm)' },
  { keys: 'R', action: 'Contact report', later: true },
  { keys: 'Y / X', action: 'Accept / reject AI suggestion', later: true },
  { keys: 'Esc', action: 'Cancel current action' },
  { keys: 'P', action: 'Pause (practice only)' },
  { keys: '?', action: 'Show / hide this list' },
];

export function formatClock(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function pad3(deg: number): string {
  return String(Math.round(deg) % 360).padStart(3, '0');
}

/** EO camera state shown on the EO view (decision 52). */
export const TRACK_MODE_LABEL: Readonly<Record<EoTrackMode, string>> = {
  MANUAL: 'MAN',
  CUE: 'CUE',
  TRACK: 'TRK',
};
