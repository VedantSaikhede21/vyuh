'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActionBar } from '@/components/hud/action-bar';
import { CommsPanel } from '@/components/hud/comms-panel';
import { EoPanel } from '@/components/hud/eo-view';
import { LargerScreenNotice, Panel, PanelHeader } from '@/components/hud/primitives';
import { RadarScope, ppiRangeKm, type PpiOverlay } from '@/components/hud/radar-scope';
import { RfPanel } from '@/components/hud/rf-panel';
import { CheatSheet, useShortcuts } from '@/components/hud/shortcuts';
import { SpectrogramPanel } from '@/components/hud/spectrogram-panel';
import { TopBar } from '@/components/hud/top-bar';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { TrackList, type TrackColumn } from '@/components/hud/track-list';
import type { Commands } from '@/lib/sim/commands';
import type { BatcherStatus } from '@/lib/sim/event-batcher';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { LibraryDialog } from '@/components/library/library-dialog';
import { readSettings } from '@/lib/settings';
import { useUiStore } from '@/lib/sim/ui-store';
import { cn } from '@/lib/utils';
import { SimCanvas } from './sim-canvas';
import { usePracticeHints } from './use-practice-hints';
import { TrackLabels } from './track-labels';
import { ZoneLabels } from './zone-labels';

/** Bottom row height: 28 px header + a 16:9 EO picture 432 px wide (243 px) + border. */
const BOTTOM_ROW = 'h-[272px]';

/**
 * What the AAR replay (Phase 4a) puts into the same player: a timeline strip,
 * the kill-chain panel in place of the action bar, and ground-truth overlays —
 * all built outside the HUD folders, which never read truth (decision 108).
 */
export interface ReplaySlots {
  timeline: ReactNode;
  side: ReactNode;
  /** Extra 3D content in the tactical scene. */
  tacticalScene?: ReactNode;
  /** DOM layer over the tactical view. */
  tacticalOverlay?: ReactNode;
  ppiOverlay?: PpiOverlay;
  trackColumn?: TrackColumn;
  /** Shown in the top bar instead of the live controls. */
  topBarExtra?: ReactNode;
}

/** Track list, RF strobes and the spectrogram as tabs in one panel (SPEC §15). */
function TrackTabs({ commands, column }: { commands: Commands; column?: TrackColumn }) {
  const [tab, setTab] = useState<'TRACKS' | 'RF' | 'SPECTRO'>('TRACKS');
  const nTracks = useHudStore(
    (s) => s.hud?.tracks.filter((t) => t.status === 'ACTIVE').length ?? 0,
  );
  const nRf = useHudStore((s) => s.hud?.rfStrobes.length ?? 0);
  const count = (n: number) => <span className="ml-1.5 text-readout text-text-2">{n}</span>;
  return (
    <Panel className="h-full border-0">
      <Tabs
        label="Track list, RF strobes or spectrogram"
        idBase="track-tabs"
        variant="underline"
        className="h-7 bg-bg-2 px-3"
        value={tab}
        onChange={setTab}
        items={[
          { id: 'TRACKS', label: <>Tracks{count(nTracks)}</> },
          { id: 'RF', label: <>RF{count(nRf)}</> },
          { id: 'SPECTRO', label: 'Spectrogram' },
        ]}
      />
      <TabPanel idBase="track-tabs" id={tab} className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'TRACKS' ? (
          <TrackList commands={commands} column={column} />
        ) : tab === 'RF' ? (
          <RfPanel />
        ) : (
          <SpectrogramPanel />
        )}
      </TabPanel>
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
  replay,
}: {
  runtime: SimRuntime;
  commands: Commands;
  /** Event upload status; leave undefined for a local replay with no server session. */
  upload?: BatcherStatus | null;
  /** AAR replay: read-only, with the replay's own controls and panels. */
  replay?: ReplaySlots;
}) {
  useShortcuts(replay ? null : commands);
  usePracticeHints(runtime, !replay);
  const cheatSheet = useUiStore((s) => s.cheatSheet);
  const library = useUiStore((s) => s.library);
  const setUi = useUiStore((s) => s.set);
  // Settings: open the shortcut list when a Practice run starts (it holds the clock).
  useEffect(() => {
    if (!replay && runtime.mode === 'PRACTICE' && readSettings().shortcutsOnStart) {
      useUiStore.getState().set({ cheatSheet: true });
    }
  }, [runtime, replay]);
  // Reading a reference sheet holds the Practice clock (never Assessment).
  const overlay = cheatSheet || library !== null;
  useEffect(() => {
    runtime.setOverlayHold(overlay);
    return () => runtime.setOverlayHold(false);
  }, [runtime, overlay]);
  const container = useRef<HTMLDivElement>(null);
  const tactical = useRef<HTMLDivElement>(null);
  const eo = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={container}
      className="fixed inset-0 z-20 flex flex-col bg-bg-0"
      data-testid="sim-player"
    >
      <TopBar runtime={runtime} upload={upload} commands={commands} replay={replay?.topBarExtra} />
      <div className="flex min-h-0 flex-1">
        {/* overflow-hidden: 3D track labels portal in here and must not spill over the top bar. */}
        <div
          ref={tactical}
          className="relative min-w-0 flex-1 overflow-hidden"
          aria-label="Tactical view"
        >
          <ZoneLabels runtime={runtime} />
          <TrackLabels />
          {replay?.tacticalOverlay}
        </div>
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-line-1 bg-bg-1">
          <Panel className="shrink-0 border-0 border-b">
            <PanelHeader title="Radar PPI">
              <span className="text-label">{ppiRangeKm(runtime)} km · rings 1 km</span>
            </PanelHeader>
            {/* Leave the Comms log at least 8 lines at 768 px height (audit P1-2). */}
            <div className="mx-auto w-[min(318px,calc(100vh-536px))] py-1">
              <RadarScope runtime={runtime} commands={commands} overlay={replay?.ppiOverlay} />
            </div>
          </Panel>
          <CommsPanel runtime={runtime} className="min-h-0 flex-1" />
        </aside>
      </div>
      {replay?.timeline}
      <div className={cn('flex shrink-0 border-t border-line-1 bg-bg-1', BOTTOM_ROW)}>
        <div className="w-[432px] shrink-0 border-r border-line-1">
          <EoPanel ref={eo} runtime={runtime} commands={commands} />
        </div>
        <div className="min-w-0 flex-1">
          <TrackTabs commands={commands} column={replay?.trackColumn} />
        </div>
        <div className="w-[320px] shrink-0 border-l border-line-1">
          {replay ? replay.side : <ActionBar runtime={runtime} commands={commands} />}
        </div>
      </div>
      <SimCanvas
        runtime={runtime}
        container={container}
        tactical={tactical}
        eo={eo}
        onSelectTrack={commands.select}
        tacticalExtra={replay?.tacticalScene}
      />
      {!replay && <CheatSheet practice={runtime.mode === 'PRACTICE'} />}
      {replay ? (
        <LargerScreenNotice
          what="The after-action replay"
          backHref="/aar/trends"
          backLabel="Back to after-action"
        />
      ) : (
        <LargerScreenNotice
          what="The sim player"
          note="The session keeps running."
          backHref={null}
        />
      )}
      <LibraryDialog
        open={library !== null}
        cls={library?.cls ?? null}
        onClose={() => setUi({ library: null })}
      />
    </div>
  );
}
