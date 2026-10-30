'use client';

import type { Asset } from '@vyuh/shared';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CommsPanel } from '@/components/hud/comms-panel';
import { EoPanel } from '@/components/hud/eo-view';
import { LargerScreenNotice, Panel, PanelHeader } from '@/components/hud/primitives';
import { RadarScope, ppiRangeKm, type PpiOverlay } from '@/components/hud/radar-scope';
import { RfPanel } from '@/components/hud/rf-panel';
import { CheatSheet, useShortcuts } from '@/components/hud/shortcuts';
import { SpectrogramPanel } from '@/components/hud/spectrogram-panel';
import { TopBar } from '@/components/hud/top-bar';
import { TrackCard } from '@/components/hud/track-card';
import { TabPanel, Tabs } from '@/components/ui/tabs';
import { TrackList, type TrackColumn } from '@/components/hud/track-list';
import type { Commands } from '@/lib/sim/commands';
import type { BatcherStatus } from '@/lib/sim/event-batcher';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { LibraryDialog } from '@/components/library/library-dialog';
import { GuidedTour } from '@/components/tour/guided-tour';
import { useAuth } from '@/lib/auth';
import { isGuest } from '@/lib/nav';
import { readSettings } from '@/lib/settings';
import { useUiStore, type MainView } from '@/lib/sim/ui-store';
import { cn } from '@/lib/utils';
import { SimCanvas } from './sim-canvas';
import { usePracticeHints } from './use-practice-hints';
import { TrackLabels } from './track-labels';
import { TerrainCredit } from './terrain-credit';
import { ZoneLabels } from './zone-labels';

/**
 * Player frames (player plan §4). The three views are absolutely placed siblings,
 * so swapping them changes classes only: drei's <View> follows its element's
 * rectangle every frame, and no canvas, control or sweep is rebuilt.
 */
const FRAME = {
  MAIN: 'left-0 top-0 right-[360px] bottom-[200px] wide:right-[440px] wide:bottom-[248px]',
  PIP: 'left-2 bottom-[208px] z-20 h-[172px] w-[256px] border border-line-2 shadow-float wide:bottom-[256px] wide:h-[244px] wide:w-[384px]',
  SIDE: 'right-0 top-0 h-[calc(100%-428px)] w-[360px] wide:h-[calc(100%-560px)] wide:w-[440px]',
} as const;
type Slot = keyof typeof FRAME;

const SLOTS: Record<MainView, { tactical: Slot; eo: Slot; radar: Slot }> = {
  TACTICAL: { tactical: 'MAIN', eo: 'PIP', radar: 'SIDE' },
  EO: { tactical: 'PIP', eo: 'MAIN', radar: 'SIDE' },
  RADAR: { tactical: 'SIDE', eo: 'PIP', radar: 'MAIN' },
};

/**
 * What the AAR replay (Phase 4a) puts into the same player: a timeline strip,
 * the kill-chain panel in place of the track card, and ground-truth overlays —
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
function TrackTabs({
  commands,
  column,
  assets,
}: {
  commands: Commands;
  column?: TrackColumn;
  assets: readonly Asset[];
}) {
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
          <TrackList commands={commands} column={column} assets={assets} />
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
 * Sim player (DESIGN §11.5, player plan §4): a fixed full-viewport grid — top bar;
 * one main view with the camera as a picture-in-picture; PPI and the track card
 * on the right; tracks and Comms along the bottom. V and W change what is large.
 * Sized for 1366×768 without scrolling.
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
  const tour = useUiStore((s) => s.tour);
  const { user } = useAuth();
  const setTour = useCallback((open: boolean) => useUiStore.getState().set({ tour: open }), []);
  const setUi = useUiStore((s) => s.set);
  const mainView = useUiStore((s) => s.mainView);
  const slots = SLOTS[mainView];
  // Settings: open the shortcut list when a Practice run starts (it holds the clock).
  useEffect(() => {
    if (!replay && runtime.mode === 'PRACTICE' && readSettings().shortcutsOnStart) {
      useUiStore.getState().set({ cheatSheet: true });
    }
  }, [runtime, replay]);
  // Reading a reference sheet or the tour holds the Practice clock (never Assessment).
  const overlay = cheatSheet || library !== null || tour;
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
      data-ui="hud"
      className="fixed inset-0 z-20 flex flex-col bg-bg-0"
      data-testid="sim-player"
    >
      <TopBar runtime={runtime} upload={upload} commands={commands} replay={replay?.topBarExtra} />
      <div className="relative min-h-0 flex-1 bg-bg-0">
        {/* overflow-hidden: 3D track labels portal in here and must not spill over the top bar. */}
        <div
          ref={tactical}
          className={cn('absolute overflow-hidden', FRAME[slots.tactical])}
          aria-label="Tactical view"
          data-tour="tactical"
        >
          <ZoneLabels runtime={runtime} />
          {slots.tactical === 'MAIN' && <TerrainCredit world={runtime.world} />}
          <TrackLabels />
          {replay?.tacticalOverlay}
        </div>
        <div className={cn('absolute overflow-hidden', FRAME[slots.eo])} data-tour="eo">
          <EoPanel ref={eo} runtime={runtime} commands={commands} />
        </div>
        <Panel
          className={cn('absolute border-0 border-l bg-bg-1', FRAME[slots.radar])}
          data-tour="radar"
        >
          <PanelHeader title="Radar PPI">
            <span className="text-label">{ppiRangeKm(runtime)} km · rings 1 km</span>
          </PanelHeader>
          <div className="grid min-h-0 flex-1 place-items-center p-1 [container-type:size]">
            <div className="w-[min(100cqw,100cqh)]">
              <RadarScope runtime={runtime} commands={commands} overlay={replay?.ppiOverlay} />
            </div>
          </div>
        </Panel>
        <div
          className="absolute bottom-[200px] right-0 h-[228px] w-[360px] border-l border-t border-line-1 bg-bg-1 wide:bottom-[248px] wide:h-[312px] wide:w-[440px]"
          data-tour="actions"
        >
          {replay ? replay.side : <TrackCard runtime={runtime} commands={commands} />}
        </div>
        <div className="absolute inset-x-0 bottom-0 flex h-[200px] border-t border-line-1 bg-bg-1 wide:h-[248px]">
          <div className="min-w-0 flex-[47]" data-tour="tracks">
            <TrackTabs
              commands={commands}
              column={replay?.trackColumn}
              assets={runtime.scenario.assets}
            />
          </div>
          <CommsPanel runtime={runtime} enter={!replay} className="min-w-0 flex-[53] border-l" />
        </div>
      </div>
      {replay?.timeline}
      <SimCanvas
        runtime={runtime}
        container={container}
        tactical={tactical}
        eo={eo}
        onSelectTrack={commands.select}
        tacticalExtra={replay?.tacticalScene}
      />
      {!replay && <CheatSheet practice={runtime.mode === 'PRACTICE'} />}
      {/* Guided tour (Phase 6E): by itself for guests, from Help for everyone; Practice only. */}
      <GuidedTour
        id="player"
        auto={isGuest(user?.role)}
        enabled={!replay && runtime.mode === 'PRACTICE'}
        onOpenChange={setTour}
      />
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
