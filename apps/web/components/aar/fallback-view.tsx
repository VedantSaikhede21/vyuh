'use client';

import type { AarSessionResponse } from '@vyuh/shared';
import Link from 'next/link';
import { DemoBadge } from '@/components/aar/demo-badge';
import { useMemo } from 'react';
import { Panel, PanelHeader, StatusNotice } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { humaniseFeedback } from '@/lib/hud/feedback';
import { aarEventLine } from '@/lib/replay/event-text';
import { REPLAY_FALLBACK_TEXT, penaltyMoment } from '@/lib/replay/gate';
import { formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { KillChainTable } from './kill-chain';

const SOURCE_LABEL = { TRAINEE: 'You', SENSOR: 'Sensor', TRUTH: 'Truth' } as const;

/**
 * When a session cannot be replayed exactly (older simulator, changed terrain, or
 * a log the sim no longer reproduces): the stored event timeline and the kill
 * chain, with the reason worded (decision 109).
 */
export function FallbackView({ data, why }: { data: AarSessionResponse; why: string }) {
  const lines = useMemo(() => {
    const out = data.events.flatMap((e) => {
      const l = aarEventLine(e);
      return l ? [{ key: `e${e.seq}`, tMs: e.tMs, ...l, penalty: false }] : [];
    });
    for (const [i, p] of (data.session.score?.penalties ?? []).entries()) {
      const t = penaltyMoment(p, data.killChain);
      if (t !== null) {
        out.push({
          key: `p${i}`,
          tMs: t,
          text: `${p.points < 0 ? 'Penalty' : 'Bonus'} ${p.points > 0 ? '+' : ''}${p.points} — ${humaniseFeedback(p.feedback)}`,
          source: 'TRAINEE',
          penalty: p.points < 0,
        });
      }
    }
    return out.sort((a, b) => a.tMs - b.tMs);
  }, [data]);

  return (
    <div className="space-y-4" data-testid="replay-fallback">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-label">After-action review · {data.session.mode.toLowerCase()}</p>
          <h1 className="text-h1">
            {data.scenario.name}
            {data.session.isDemo && <DemoBadge className="ml-3 align-middle" />}
          </h1>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" asChild>
            <Link href="/train">Back to training</Link>
          </Button>
          <Button asChild>
            <Link href={`/train/session/${data.session.id}`}>Back to debrief</Link>
          </Button>
        </div>
      </header>
      <Panel>
        <StatusNotice title={REPLAY_FALLBACK_TEXT}>{why}</StatusNotice>
      </Panel>
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <Panel>
          <PanelHeader title="Event timeline">
            <span className="text-label">{lines.length} events</span>
          </PanelHeader>
          <ol className="max-h-[60vh] overflow-y-auto" aria-label="Event timeline">
            {lines.map((l) => (
              <li
                key={l.key}
                className="grid grid-cols-[3.5rem_3.5rem_1fr] gap-2 border-t border-line-1 px-3 py-1 text-small"
              >
                <span className="font-mono text-text-3">{formatClock(l.tMs)}</span>
                <span className="text-label">{SOURCE_LABEL[l.source]}</span>
                <span className={cn(l.penalty ? 'text-crit' : 'text-text-1')}>{l.text}</span>
              </li>
            ))}
          </ol>
        </Panel>
        <Panel>
          <PanelHeader title="Kill chain" />
          <div className="overflow-x-auto">
            <KillChainTable rows={data.killChain} penalties={data.session.score?.penalties} />
          </div>
        </Panel>
      </div>
    </div>
  );
}
