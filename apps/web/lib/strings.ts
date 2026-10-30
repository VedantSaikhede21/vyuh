import type { ContactClass, EffectorKind, ErrorCode, Roe } from '@vyuh/shared';
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

/** Three- or four-letter class codes for narrow columns; the full label goes in a tooltip. */
export const CLASS_CODE: Record<ContactClass, string> = {
  QUAD_SMALL: 'QDS',
  QUAD_HEAVY: 'QDH',
  FPV: 'FPV',
  FIXED_WING_SMALL: 'FWS',
  LOITERING_GENERIC: 'LOIT',
  BIRD_SMALL: 'BRDS',
  BIRD_LARGE: 'BRDL',
  FRIENDLY_QUAD: 'FQD',
  CIVILIAN_HOBBY: 'CIV',
  HELICOPTER_FRIENDLY: 'HELO',
};

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
  BLOCKED_NO_KINETIC: 'blocked: no-kinetic zone',
  OUT_OF_RANGE: 'out of range',
  COOLDOWN: 'interceptor reloading',
  NO_AMMO: 'no rounds left',
};

export const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: 'Tab / Shift+Tab', action: 'Next / previous track' },
  { keys: 'Space', action: 'Cue EO camera to the selected track' },
  { keys: '+ / -', action: 'Zoom EO camera' },
  { keys: 'T', action: 'Toggle day / thermal (IR)' },
  { keys: 'D', action: 'Mark detected' },
  { keys: 'C then 1–9, 0', action: 'Classify' },
  { keys: 'H F N U', action: 'Affiliation hostile / friendly / neutral / unknown' },
  { keys: 'M', action: 'Monitor' },
  { keys: 'J / S', action: 'EW jam / spoof (sector toward the track; hits everything in it)' },
  { keys: 'I then Enter', action: 'Intercept (confirm)' },
  { keys: 'R, 1–5, Enter', action: 'Contact report: open, activity, send' },
  { keys: 'Y / X', action: 'Accept / reject the AI suggestion (it can be wrong)' },
  { keys: 'Enter', action: 'Confirm End session once armed' },
  { keys: 'Esc', action: 'Cancel current action' },
  { keys: 'P', action: 'Pause (practice only)' },
  { keys: 'L', action: 'Threat library entry for the selected track' },
  { keys: 'V', action: 'Swap the map and the camera' },
  { keys: 'W', action: 'Wide radar' },
  { keys: '.', action: 'More actions' },
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

export const EFFECTOR_LABEL: Readonly<Record<EffectorKind, string>> = {
  INTERCEPT: 'INT',
  EW_JAM: 'JAM',
  EW_SPOOF: 'SPF',
};

/** What a failed API call means to the user (DESIGN §8–§9): cause and next step, never raw API wording. */
export interface ErrorCopy {
  title: string;
  detail: string;
  /** A not-found or a permission notice is not an alarm: neutral tone, no --crit. */
  tone: 'neutral' | 'error';
  /** Trying again can help. */
  retry: boolean;
}

/**
 * One map from API error codes to plain copy (audit P1-8). `subject` names the
 * thing that was being loaded ("scenario", "session"); it defaults to "page".
 */
export function errorCopy(
  code: ErrorCode | 'NETWORK' | 'BAD_RESPONSE' | undefined,
  subject = 'page',
): ErrorCopy {
  switch (code) {
    case 'NOT_FOUND':
      return {
        title: `This ${subject} does not exist.`,
        detail:
          'The link may be out of date, or the item was deleted. Go back and choose it again.',
        tone: 'neutral',
        retry: false,
      };
    case 'VALIDATION_ERROR':
      return {
        title: `This ${subject} could not be opened.`,
        detail: 'The address or the request is not valid. Go back and open it from the list.',
        tone: 'neutral',
        retry: false,
      };
    case 'UNAUTHORIZED':
      return {
        title: 'Your sign-in has expired.',
        detail: 'Sign in again to continue.',
        tone: 'neutral',
        retry: false,
      };
    case 'FORBIDDEN':
      return {
        title: `You do not have access to this ${subject}.`,
        detail: 'It belongs to another trainee or needs an instructor account.',
        tone: 'neutral',
        retry: false,
      };
    case 'RATE_LIMITED':
      return {
        title: 'Too many requests.',
        detail: 'Wait a minute, then try again.',
        tone: 'error',
        retry: true,
      };
    case 'SESSION_NOT_ACTIVE':
      return {
        title: 'This session has already ended.',
        detail: 'Open its after-action review, or start a new run from Training.',
        tone: 'neutral',
        retry: false,
      };
    case 'LLM_UNAVAILABLE':
      return {
        title: 'The language model is not available.',
        detail: 'The template version is used instead; nothing is lost.',
        tone: 'neutral',
        retry: true,
      };
    case 'NETWORK':
      return {
        title: 'The server did not answer.',
        detail: 'Check the network connection, then try again.',
        tone: 'error',
        retry: true,
      };
    default:
      return {
        title: `The ${subject} could not be loaded.`,
        detail:
          'The server reported an internal error. Try again; if it repeats, tell your instructor.',
        tone: 'error',
        retry: true,
      };
  }
}

/** ISO date + local time, "2026-10-25 14:05" (DESIGN §8: outside sessions). */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** ISO date in local time, "2026-10-25". */
export const formatDate = (iso: string): string => formatDateTime(iso).slice(0, 10);

/** Counts with a thousands separator: 1,284 (break-ui 6C). */
export const formatCount = (n: number): string => n.toLocaleString('en-GB');
