import type { EoMode } from '@vyuh/shared';
import type { EoTrackMode } from '@vyuh/sim-core';
import { create } from 'zustand';

// Operator UI state that is not sim state: EO pointing, open menus, messages.

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
}

export interface UiMessage {
  text: string;
  tone: 'info' | 'warn' | 'bad';
}

interface UiStore {
  eo: EoPointing;
  classifyMenu: boolean;
  interceptArmed: boolean;
  cheatSheet: boolean;
  message: UiMessage | null;
  setEo: (eo: Partial<EoPointing>) => void;
  set: (s: Partial<Omit<UiStore, 'set' | 'setEo'>>) => void;
  reset: (eo: EoPointing) => void;
}

export const useUiStore = create<UiStore>((set) => ({
  eo: { azDeg: 0, elDeg: 0, hfovDeg: 30, lockTrackId: null, mode: 'DAY', trackMode: 'MANUAL' },
  classifyMenu: false,
  interceptArmed: false,
  cheatSheet: false,
  message: null,
  setEo: (eo) => set((s) => ({ eo: { ...s.eo, ...eo } })),
  set: (s) => set(s),
  reset: (eo) =>
    set({ eo, classifyMenu: false, interceptArmed: false, cheatSheet: false, message: null }),
}));
