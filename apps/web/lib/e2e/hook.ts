import { TICK_MS } from '@vyuh/sim-core';
import type { SimRuntime } from '@/lib/sim/runtime';
import { snapshot, useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';

// Playwright test hook (decision 67). Loaded only in non-production builds (the
// session page imports it behind a NODE_ENV check, so the production bundle
// never contains it). It holds the practice runtime off the wall clock and
// steps it to an exact sim time, so screenshots are deterministic. The hold is
// on from install (t = 0); live tests call release().

export interface VyuhE2E {
  /** Current sim time (ms). */
  tMs(): number;
  /** Hold the sim (no wall-clock ticks) and step it to `tMs`. Not shown as "Paused". */
  stepTo(tMs: number): number;
  /** Release the hold: the sim follows the wall clock again. */
  release(): void;
  /** Ground-truth peek for tests: the active track on a scenario contact, if any. */
  trackFor(contactId: string): string | null;
  /** The EO tracker state shown on the chip (MANUAL / CUE / TRACK). */
  eoTrackMode(): string;
  ended(): boolean;
}

declare global {
  interface Window {
    __vyuhE2E?: VyuhE2E;
  }
}

export function installE2EHook(rt: SimRuntime): () => void {
  let held = true;
  const advance = rt.advance.bind(rt);
  rt.advance = (frameMs: number) => (held ? 0 : advance(frameMs));
  const publish = () => useHudStore.getState().publish(snapshot(rt));

  window.__vyuhE2E = {
    tMs: () => rt.sim.getState().clock.tMs,
    stepTo(tMs) {
      held = true;
      while (rt.sim.getState().clock.tMs < tMs && !rt.ended) advance(TICK_MS);
      // Interpolate to the tick itself, whatever wall-clock remainder was left.
      rt.alpha = 1;
      publish();
      return rt.sim.getState().clock.tMs;
    },
    release() {
      held = false;
    },
    trackFor(contactId) {
      const t = rt.sim
        .getState()
        .tracks.find((tr) => tr.status === 'ACTIVE' && tr.contactId === contactId);
      return t?.id ?? null;
    },
    eoTrackMode: () => useUiStore.getState().eo.trackMode,
    ended: () => rt.ended,
  };
  return () => {
    rt.advance = advance;
    delete window.__vyuhE2E;
  };
}
