'use client';

import type { AarSessionResponse } from '@vyuh/shared';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { Panel } from '@/components/hud/primitives';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { DebriefState, SourceChip, useDebrief } from './debrief-panel';
import { KillChainPanel } from './kill-chain';
import { Remarks } from './remarks';
import { TrustInsight } from './trust-insight';

// The replay's side slot (320 px): kill chain, debrief, AI-assist trust and
// instructor remarks as tabs. `?tab=remarks` (a remark notice) opens on Remarks.

type Tab = 'chain' | 'debrief' | 'ai' | 'remarks';
const ID = 'aar-side';

export function AarSidePanel({
  data,
  onJump,
}: {
  data: AarSessionResponse;
  onJump: (tMs: number) => void;
}) {
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(() =>
    params.get('tab') === 'remarks' ? 'remarks' : 'chain',
  );
  const { state, retry } = useDebrief(data.session.id);
  const threats = data.killChain.filter((r) => r.isThreat).length;
  return (
    <Panel className="h-full border-0" data-testid="aar-side">
      <Tabs
        label="Review"
        idBase={ID}
        fit
        value={tab}
        onChange={setTab}
        items={[
          {
            id: 'chain',
            testId: 'aar-tab-chain',
            label: (
              <>
                Kill chain
                <span className="ml-1 font-mono tnum text-text-2" aria-label={`${threats} threats`}>
                  {threats}
                </span>
              </>
            ),
          },
          { id: 'debrief', testId: 'aar-tab-debrief', label: 'Debrief' },
          { id: 'ai', testId: 'aar-tab-ai', label: 'AI trust' },
          {
            id: 'remarks',
            testId: 'aar-tab-remarks',
            label: (
              <>
                Remarks
                {data.remarks.length > 0 && (
                  <span className="ml-1 font-mono tnum text-text-2">{data.remarks.length}</span>
                )}
              </>
            ),
          },
        ]}
      />
      <TabPanel idBase={ID} id={tab} className="min-h-0 flex-1">
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
        {tab === 'remarks' && (
          <div className="h-full overflow-y-auto">
            <Remarks sessionId={data.session.id} initial={data.remarks} compact />
          </div>
        )}
        {tab === 'ai' && (
          <div className="h-full overflow-y-auto p-2" data-testid="trust-insight">
            <TrustInsight trust={data.aiTrust} compact />
          </div>
        )}
      </TabPanel>
    </Panel>
  );
}
