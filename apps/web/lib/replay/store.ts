import { create } from 'zustand';
import type { ReplaySpeed } from './controller';

// Replay UI state (Phase 4a): what the timeline and kill-chain panel show. The
// sim state itself lives in the ReplayController's runtime, as in a live session.

interface ReplayStore {
  tMs: number;
  playing: boolean;
  speed: ReplaySpeed;
  /** Ground-truth overlay (AAR only, completed sessions). */
  truth: boolean;
  /** Kill-chain cell whose details are shown: `${contactId}:${stage}`. */
  focusCell: string | null;
  help: boolean;
  set: (s: Partial<Omit<ReplayStore, 'set'>>) => void;
}

export const useReplayStore = create<ReplayStore>((set) => ({
  tMs: 0,
  playing: false,
  speed: 1,
  truth: false,
  focusCell: null,
  help: false,
  set: (s) => set(s),
}));
