'use client';

import { useEffect } from 'react';
import { dueHints } from '@/lib/hud/hints';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';

/**
 * Practice-mode hints as HINT lines in Comms (plan Q9, decision 82). Nothing in
 * Assessment. Reads only the HUD snapshot (tracks as reported), the trainee's
 * own selections from the event log and the EO camera state.
 */
export function usePracticeHints(rt: SimRuntime): void {
  useEffect(() => {
    if (rt.mode !== 'PRACTICE') return;
    const selectedEver = new Set<string>();
    let seen = 0;
    return useHudStore.subscribe((s) => {
      const hud = s.hud;
      if (!hud || hud.endReason !== null) return;
      const events = rt.sim.getEvents();
      for (; seen < events.length; seen++) {
        const e = events[seen];
        if (e?.type === 'TRACK_SELECTED') selectedEver.add(e.trackId);
      }
      const ui = useUiStore.getState();
      for (const h of dueHints({ tMs: hud.tMs, tracks: hud.tracks, selectedEver, eo: ui.eo })) {
        if (!ui.hinted.includes(h.key)) ui.hint(hud.tMs, h.key, h.text);
      }
    });
  }, [rt]);
}
