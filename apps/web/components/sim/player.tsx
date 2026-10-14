'use client';

import { useRef, useState } from 'react';
import { ActionBar } from '@/components/hud/action-bar';
import { CommsPanel } from '@/components/hud/comms-panel';
import { EoPanel } from '@/components/hud/eo-view';
import { Panel, PanelHeader } from '@/components/hud/primitives';
import { RadarScope, ppiRangeKm } from '@/components/hud/radar-scope';
import { RfPanel } from '@/components/hud/rf-panel';
import { CheatSheet, useShortcuts } from '@/components/hud/shortcuts';
import { TopBar } from '@/components/hud/top-bar';
import { TrackList } from '@/components/hud/track-list';
import type { Commands } from '@/lib/sim/commands';
import type { BatcherStatus } from '@/lib/sim/event-batcher';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { cn } from '@/lib/utils';
import { SimCanvas } from './sim-canvas';

/** Bottom row height: 28 px header + a 16:9 EO picture 432 px wide (243 px) + border. */
const BOTTOM_ROW = 'h-[272px]';

/** Track list and RF strobes as tabs in one panel (SPEC §15). */
function TrackTabs({ commands }: { commands: Commands }) {
  const [tab, setTab] = useState<'TRACKS' | 'RF'>('TRACKS');
  const nTracks = useHudStore(
    (s) => s.hud?.tracks.filter((t) => t.status === 'ACTIVE').length ?? 0,
  );
  const nRf = useHudStore((s) => s.hud?.rfStrobes.length ?? 0);
  const tabs = [
    { id: 'TRACKS' as const, label: 'Tracks', n: nTracks },
    { id: 'RF' as const, label: 'RF', n: nRf },
  ];
  return (
    <Panel className="h-full border-0">
      <div
        className="flex h-7 shrink-0 items-stretch gap-1 border-b border-line-1 bg-bg-2 px-2"
        role="tablist"
        aria-label="Track list or RF strobes"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            onClick={() => setTab(t.id)}
            className={cn(
              'flex items-center gap-1.5 border-b-2 px-2 text-panel-title transition-colors duration-150 ease-ui',
              tab === t.id
                ? 'border-select text-text-1'
                : 'border-transparent text-text-2 hover:text-text-1',
            )}
          >
            {t.label}
            <span className="text-readout text-text-3">{t.n}</span>
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        {tab === 'TRACKS' ? <TrackList commands={commands} /> : <RfPanel />}
      </div>
    </Panel>
  );
}

/**
 * Sim player (DESIGN §11.5, SPEC §15): a fixed full-viewport grid — top bar;
 * tactical 3D view with PPI and Comms on the right; EO/IR, tracks and actions
 * along the bottom. Sized for 1366×768 without scrolling.
 */
export function SimPlayer({
  runtime,
  commands,
  upload,
}: {
  runtime: SimRuntime;
  commands: Commands;
  upload: BatcherStatus | null;
}) {
  useShortcuts(commands);
  const container = useRef<HTMLDivElement>(null);
  const tactical = useRef<HTMLDivElement>(null);
  const eo = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={container}
      className="fixed inset-0 z-20 flex flex-col bg-bg-0"
      data-testid="sim-player"
    >
      <TopBar runtime={runtime} upload={upload} commands={commands} />
      <div className="flex min-h-0 flex-1">
        <div ref={tactical} className="relative min-w-0 flex-1" aria-label="Tactical view" />
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line-1 bg-bg-1">
          <Panel className="shrink-0 border-0 border-b">
            <PanelHeader title="Radar PPI">
              <span className="text-label">{ppiRangeKm(runtime)} km · rings 1 km</span>
            </PanelHeader>
            {/* Leave the Comms log at least ~6 lines at 768 px height. */}
            <div className="mx-auto w-[min(318px,calc(100vh-518px))] py-1">
              <RadarScope runtime={runtime} commands={commands} />
            </div>
          </Panel>
          <CommsPanel runtime={runtime} className="min-h-0 flex-1" />
        </aside>
      </div>
      <div className={cn('flex shrink-0 border-t border-line-1 bg-bg-1', BOTTOM_ROW)}>
        <div className="w-[432px] shrink-0 border-r border-line-1">
          <EoPanel ref={eo} runtime={runtime} commands={commands} />
        </div>
        <div className="min-w-0 flex-1">
          <TrackTabs commands={commands} />
        </div>
        <div className="w-[320px] shrink-0 border-l border-line-1">
          <ActionBar runtime={runtime} commands={commands} />
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0 p-6 min-[1280px]:hidden">
        <p className="max-w-md text-body text-text-1">
          The sim player needs a window at least 1280 px wide. Enlarge the window or use a desktop
          screen; the session keeps running.
        </p>
      </div>
    </div>
  );
}
