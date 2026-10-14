'use client';

import { useMemo } from 'react';
import {
  friendlyInJamSector,
  leakImminent,
  type Banner,
  type EffectorSite,
} from '@/lib/hud/derive';
import type { BatcherStatus } from '@/lib/sim/event-batcher';
import type { SimRuntime } from '@/lib/sim/runtime';
import type { HudSnapshot } from '@/lib/sim/store';

export type EffectorSites = Partial<Record<'EW_JAM' | 'EW_SPOOF' | 'INTERCEPT', EffectorSite>>;

/** First effector of each kind: its scenario position joined to its live status. */
export function effectorSites(rt: SimRuntime, hud: HudSnapshot): EffectorSites {
  const out: EffectorSites = {};
  for (const view of hud.effectors) {
    if (out[view.kind]) continue;
    const spec = rt.scenario.effectors.find((e) => e.id === view.id);
    if (spec) out[view.kind] = { view, x: spec.x, z: spec.z };
  }
  return out;
}

export function useEffectorSites(rt: SimRuntime, hud: HudSnapshot | null): EffectorSites {
  return useMemo(() => (hud ? effectorSites(rt, hud) : {}), [rt, hud]);
}

/** The one banner to show (DESIGN §11.5): critical leak > friendly in jam sector > connection. */
export function pickBanner(
  rt: SimRuntime,
  hud: HudSnapshot,
  upload: BatcherStatus | null,
): Banner | null {
  const leak = leakImminent(hud.tracks, rt.scenario.assets);
  if (leak) return leak;
  if (upload?.error) return { tone: 'crit', text: `Event upload failed — ${upload.error}` };
  const jam = effectorSites(rt, hud).EW_JAM ?? null;
  const selected = hud.tracks.find((t) => t.id === hud.selectedTrackId) ?? null;
  const friendly = friendlyInJamSector(
    selected,
    hud.tracks,
    hud.rfStrobes,
    jam?.view ?? null,
    jam ?? null,
  );
  if (friendly) return friendly;
  if (upload?.retrying) {
    return { tone: 'warn', text: `Connection lost — events queued (${upload.pendingEvents})` };
  }
  return null;
}
