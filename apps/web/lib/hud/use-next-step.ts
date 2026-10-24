'use client';

import { useRef } from 'react';
import type { SimRuntime } from '@/lib/sim/runtime';
import type { HudSnapshot } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { nextStep, type NextStep } from './next-step';

/**
 * The Practice next step for the current HUD snapshot (null in Assessment).
 * The trainee's responses and reports are read from the event log once each
 * (an index into the log), not rescanned on every tick.
 */
export function useNextStep(rt: SimRuntime, hud: HudSnapshot | null): NextStep | null {
  const eo = useUiStore((s) => s.eo);
  const seen = useRef({ n: 0, responded: new Set<string>(), reported: new Set<string>() });
  if (rt.mode !== 'PRACTICE' || !hud || hud.endReason !== null) return null;
  const events = rt.sim.getEvents();
  const acc = seen.current;
  for (; acc.n < events.length; acc.n++) {
    const e = events[acc.n];
    if (e?.type === 'RESPONSE_ORDERED') acc.responded.add(e.trackId);
    else if (e?.type === 'REPORT_SUBMITTED')
      for (const id of e.payload.trackIds) acc.reported.add(id);
  }
  return nextStep({
    tracks: hud.tracks,
    selectedTrackId: hud.selectedTrackId,
    eo,
    responded: acc.responded,
    reported: acc.reported,
  });
}
