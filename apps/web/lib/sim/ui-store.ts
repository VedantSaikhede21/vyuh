import type { EoMode } from '@vyuh/shared';
import type { EoTrackMode } from '@vyuh/sim-core';
import { create } from 'zustand';
import type { CommsLine, CommsStatus } from '@/components/hud/primitives/comms-log';

// Operator UI state that is not sim state: EO pointing, open menus, and local
// Comms log lines (command rejections and immediate echoes, DESIGN §9).

export interface EoPointing {
  azDeg: number;
  elDeg: number;
  /** Horizontal field of view, degrees. */
  hfovDeg: number;
  /** Track the camera is locked on (sim-core follows it); null = manual. */
  lockTrackId: string | null;
  mode: EoMode;
  /** Mirror of the sim camera state: MANUAL, CUE (radar-cued) or TRACK (EO tracker holds it). */
  trackMode: EoTrackMode;
  /** Sim time the camera entered CUE (for the UI-only ACQ state), or null. */
  cueSinceTMs: number | null;
}

/**
 * A line the UI adds itself. `untilTMs` set = an echo of a command the sim has
 * not applied yet: it is shown as QUEUED until sim time passes that tick, by
 * which point the sim's own event line replaces it.
 */
export interface LocalLine extends CommsLine {
  untilTMs?: number;
}

const MAX_LOCAL = 20;

interface UiStore {
  eo: EoPointing;
  classifyMenu: boolean;
  interceptArmed: boolean;
  endArmed: boolean;
  cheatSheet: boolean;
  local: LocalLine[];
  setEo: (eo: Partial<EoPointing>) => void;
  set: (s: Partial<Omit<UiStore, 'set' | 'setEo' | 'reset' | 'say' | 'echo'>>) => void;
  /** Add a local Comms line (rejection or notice). */
  say: (tMs: number, text: string, status?: CommsStatus) => void;
  /** Echo a dispatched command until the sim's event for it exists. */
  echo: (tMs: number, text: string) => void;
  reset: (eo: Omit<EoPointing, 'cueSinceTMs'>) => void;
}

let nextLocal = 0;

export const useUiStore = create<UiStore>((set) => ({
  eo: {
    azDeg: 0,
    elDeg: 0,
    hfovDeg: 30,
    lockTrackId: null,
    mode: 'DAY',
    trackMode: 'MANUAL',
    cueSinceTMs: null,
  },
  classifyMenu: false,
  interceptArmed: false,
  endArmed: false,
  cheatSheet: false,
  local: [],
  setEo: (eo) => set((s) => ({ eo: { ...s.eo, ...eo } })),
  set: (s) => set(s),
  say: (tMs, text, status = 'warn') =>
    set((s) => ({
      local: [...s.local, { id: `ui-${nextLocal++}`, tMs, text, status }].slice(-MAX_LOCAL),
    })),
  echo: (tMs, text) =>
    set((s) => ({
      local: [
        ...s.local,
        { id: `ui-${nextLocal++}`, tMs, text, pending: true, untilTMs: tMs },
      ].slice(-MAX_LOCAL),
    })),
  reset: (eo) =>
    set({
      eo: { ...eo, cueSinceTMs: null },
      classifyMenu: false,
      interceptArmed: false,
      endArmed: false,
      cheatSheet: false,
      local: [],
    }),
}));
