'use client';

import { ActionBar } from '@/components/hud/action-bar';
import { ContactList } from '@/components/hud/contact-list';
import { EoPanel } from '@/components/hud/eo-view';
import { RadarScope } from '@/components/hud/radar-scope';
import { RfPanel } from '@/components/hud/rf-panel';
import { CheatSheet, useShortcuts } from '@/components/hud/shortcuts';
import { TopBar } from '@/components/hud/top-bar';
import { AffiliationLegend } from '@/components/affiliation-legend';
import type { Commands } from '@/lib/sim/commands';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useRef, useState } from 'react';
import { useHudStore } from '@/lib/sim/store';
import { cn } from '@/lib/utils';
import { SimCanvas } from './sim-canvas';

/** Bottom-centre panel: track list and RF strobes as tabs (SPEC §15). */
function TrackTabs({ commands }: { commands: Commands }) {
  const [tab, setTab] = useState<'TRACKS' | 'RF'>('TRACKS');
  const nTracks = useHudStore(
    (s) => s.hud?.tracks.filter((t) => t.status === 'ACTIVE').length ?? 0,
  );
  const nRf = useHudStore((s) => s.hud?.rfStrobes.length ?? 0);
  const tabs = [
    { id: 'TRACKS' as const, label: `Tracks ${nTracks}` },
    { id: 'RF' as const, label: `RF ${nRf}` },
  ];
  return (
    <>
      <div className="flex shrink-0 gap-1 border-b border-border px-2 pt-1" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setTab(t.id)}
            className={cn(
              'border-b-2 px-2 py-0.5 font-mono text-xs uppercase',
              tab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'TRACKS' ? <ContactList commands={commands} /> : <RfPanel />}
      </div>
    </>
  );
}

/**
 * Sim player layout (SPEC §15), sized for 1366×768: tactical view centre,
 * radar PPI right, EO bottom-left, contact list bottom-centre, actions bottom-right.
 */
export function SimPlayer({
  runtime,
  commands,
  upload,
}: {
  runtime: SimRuntime;
  commands: Commands;
  upload: string;
}) {
  useShortcuts(commands);
  const container = useRef<HTMLDivElement>(null);
  const tactical = useRef<HTMLDivElement>(null);
  const eo = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={container}
      className="fixed inset-x-0 bottom-0 top-12 z-10 flex flex-col bg-background"
    >
      <TopBar
        name={runtime.scenario.name}
        mode={runtime.mode}
        upload={upload}
        commands={commands}
      />
      <div className="flex min-h-0 flex-1">
        <div ref={tactical} className="relative min-w-0 flex-1" />
        <aside className="flex w-[300px] shrink-0 flex-col gap-2 overflow-y-auto border-l border-border bg-card p-2">
          <RadarScope runtime={runtime} commands={commands} />
          <AffiliationLegend />
        </aside>
      </div>
      <div className="flex h-[248px] shrink-0 border-t border-border bg-card">
        <div className="w-[400px] shrink-0 border-r border-border p-2">
          <EoPanel ref={eo} runtime={runtime} commands={commands} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col">
          <TrackTabs commands={commands} />
        </div>
        <div className="w-[290px] shrink-0 border-l border-border p-2">
          <ActionBar commands={commands} />
        </div>
      </div>
      <SimCanvas
        runtime={runtime}
        container={container}
        tactical={tactical}
        eo={eo}
        onSelectTrack={commands.select}
      />
      <CheatSheet />
    </div>
  );
}
