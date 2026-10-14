'use client';

import { useMemo } from 'react';
import { CommsLog, Panel, PanelHeader, type CommsLine } from '@/components/hud/primitives';
import { CommsBuilder } from '@/lib/hud/comms';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { cn } from '@/lib/utils';

/**
 * Comms log panel (DESIGN §9): sim events as operator lines, plus local lines —
 * command rejections, and echoes of accepted commands that stay (QUEUED) only
 * until the sim applies them on its next tick.
 */
export function CommsPanel({ runtime, className }: { runtime: SimRuntime; className?: string }) {
  const tMs = useHudStore((s) => s.hud?.tMs ?? 0);
  const local = useUiStore((s) => s.local);
  const builder = useMemo(
    () =>
      new CommsBuilder({
        trackPos: (id) => useHudStore.getState().hud?.tracks.find((t) => t.id === id) ?? null,
        effectorPos: (kind) => runtime.scenario.effectors.find((e) => e.kind === kind) ?? null,
        assetName: (id) => runtime.scenario.assets.find((a) => a.id === id)?.name ?? 'asset',
      }),
    [runtime],
  );
  const eventCount = runtime.sim.getEvents().length;
  const simLines = useMemo(() => {
    builder.update(runtime.sim.getEvents());
    return [...builder.lines];
    // eventCount changes whenever the log grows; the log itself is mutated in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [builder, eventCount]);

  const lines: CommsLine[] = useMemo(() => {
    const shown = local.filter((l) => l.untilTMs === undefined || tMs <= l.untilTMs);
    // Stable merge by time; sim lines first at equal times.
    return [...simLines, ...shown].sort((a, b) => a.tMs - b.tMs);
  }, [simLines, local, tMs]);

  return (
    <Panel className={cn('border-0', className)}>
      <PanelHeader title="Comms" />
      <CommsLog lines={lines} max={30} className="flex-1" />
    </Panel>
  );
}
