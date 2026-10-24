'use client';

import type { AarSessionResponse } from '@vyuh/shared';
import { useState } from 'react';
import { Panel } from '@/components/hud/primitives';
import { cn } from '@/lib/utils';
import { DebriefState, SourceChip, useDebrief } from './debrief-panel';
import { KillChainPanel } from './kill-chain';
import { TrustInsight } from './trust-insight';

// The replay's side slot (320 px): kill chain, debrief and AI-assist trust as tabs.

type Tab = 'chain' | 'debrief' | 'ai';
const TABS: { id: Tab; label: string }[] = [
  { id: 'chain', label: 'Kill chain' },
  { id: 'debrief', label: 'Debrief' },
  { id: 'ai', label: 'AI trust' },
];

export function AarSidePanel({
  data,
  onJump,
}: {
  data: AarSessionResponse;
  onJump: (tMs: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('chain');
  const { state, retry } = useDebrief(data.session.id);
  return (
    <Panel className="h-full border-0" data-testid="aar-side">
      <div
        role="tablist"
        aria-label="Review"
        className="flex h-7 shrink-0 border-b border-line-1 bg-bg-2"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`aar-tab-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'h-full flex-1 border-r border-line-1 px-2 text-label font-medium last:border-r-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-select',
              tab === t.id ? 'bg-bg-1 text-text-1' : 'text-text-3 hover:text-text-2',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1">
        {tab === 'chain' && (
          <KillChainPanel
            rows={data.killChain}
            penalties={data.session.score?.penalties}
            onJump={onJump}
          />
        )}
        {tab === 'debrief' && (
          <div className="h-full overflow-y-auto" data-testid="debrief">
            {state.kind === 'ok' && (
              <div className="flex justify-end border-b border-line-1 px-2 py-1">
                <SourceChip data={state.data} />
              </div>
            )}
            <DebriefState state={state} retry={retry} compact onJump={onJump} />
          </div>
        )}
        {tab === 'ai' && (
          <div className="h-full overflow-y-auto p-2" data-testid="trust-insight">
            <TrustInsight trust={data.aiTrust} compact />
          </div>
        )}
      </div>
    </Panel>
  );
}
