'use client';

import type { Affiliation } from '@vyuh/shared';
import { ChevronDown } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';
import { AiChip } from '@/components/hud/ai-chip';
import {
  AffiliationSymbol,
  CooldownRing,
  Kbd,
  Panel,
  StateChip,
  Tooltip,
} from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import {
  ALTITUDE_BAND_LABEL,
  actionStates,
  altitudeBand,
  formatBearing,
  formatKm,
  type ActionState,
} from '@/lib/hud/derive';
import { moreActions, nearestAsset, stageActions, type ActionKey } from '@/lib/hud/stage-actions';
import { useNextStep } from '@/lib/hud/use-next-step';
import type { Commands } from '@/lib/sim/commands';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_LABEL, CLASS_MENU, formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { ReportForm } from './report-form';
import { useEffectorSites } from './use-hud-derived';

const AFFILIATION_ACTION: Partial<Record<ActionKey, Affiliation>> = {
  HOSTILE: 'HOSTILE',
  FRIENDLY: 'FRIENDLY',
  NEUTRAL: 'NEUTRAL',
  UNKNOWN: 'UNKNOWN',
};

/** A HUD action: tooltip with what it does (or why it is disabled) and its key. */
function Action({
  state,
  hint,
  keyName,
  onClick,
  variant = 'secondary',
  className,
  pressed,
  children,
}: {
  state: ActionState;
  hint: string;
  keyName: string;
  onClick: () => void;
  variant?: 'secondary' | 'danger';
  className?: string;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip
      content={state.reason ?? hint}
      shortcut={keyName}
      side="top"
      className="min-w-0 flex-1"
    >
      <Button
        size="hud"
        variant={variant}
        disabled={!state.enabled}
        onClick={onClick}
        aria-pressed={pressed}
        className={cn(
          'w-full justify-between gap-1 px-2',
          pressed && 'border-select bg-bg-3',
          className,
        )}
      >
        {children}
      </Button>
    </Tooltip>
  );
}

function ClassifyMenu({ commands }: { commands: Commands }) {
  return (
    <div
      role="menu"
      aria-label="Classify"
      className="absolute bottom-full right-0 z-40 mb-1 w-64 rounded-md border border-line-2 bg-bg-2 p-1 shadow-overlay"
    >
      {CLASS_MENU.map((c) => (
        <button
          key={c.cls}
          role="menuitem"
          className="flex h-7 w-full items-center gap-2 rounded-sm px-2 text-left text-body hover:bg-bg-3"
          onClick={() => commands.classify(c.cls)}
        >
          <Kbd>{c.key}</Kbd>
          {c.label}
        </button>
      ))}
    </div>
  );
}

/**
 * The track card (player plan §6): the selected track's identity, kinematics and
 * next step, the actions that fit its stage, and every other action one key or
 * one click away. actionStates() decides what is allowed; this only orders it.
 */
export function TrackCard({ runtime, commands }: { runtime: SimRuntime; commands: Commands }) {
  const hud = useHudStore((s) => s.hud);
  const classifyMenu = useUiStore((s) => s.classifyMenu);
  const interceptArmed = useUiStore((s) => s.interceptArmed);
  const moreOpen = useUiStore((s) => s.moreOpen);
  const setUi = useUiStore((s) => s.set);
  const moreRoot = useRef<HTMLDivElement>(null);
  const sites = useEffectorSites(runtime, hud);
  const next = useNextStep(runtime, hud);
  useEffect(() => {
    if (!moreOpen) return;
    const away = (e: PointerEvent) => {
      if (!moreRoot.current?.contains(e.target as Node)) setUi({ moreOpen: false });
    };
    window.addEventListener('pointerdown', away);
    return () => window.removeEventListener('pointerdown', away);
  }, [moreOpen, setUi]);
  if (!hud) return null;
  const st = actionStates(hud, sites, runtime.scenario.zones, runtime.mode);
  const selected = hud.tracks.find((t) => t.id === hud.selectedTrackId) ?? null;
  const asset = selected ? nearestAsset(selected, runtime.scenario.assets) : null;
  const ring = (kind: 'EW_JAM' | 'EW_SPOOF' | 'INTERCEPT') => {
    const e = sites[kind]?.view;
    if (!e) return null;
    const left = Math.max(0, e.readyAtMs - hud.tMs);
    return <CooldownRing remaining={e.cooldownMs ? left / e.cooldownMs : 0} size={14} />;
  };
  const ammo = sites.INTERCEPT?.view.ammo;

  const action = (key: ActionKey): ReactNode => {
    const aff = AFFILIATION_ACTION[key];
    if (aff) {
      const s = AFFILIATION_STYLE[aff];
      return (
        <Action
          key={key}
          state={st.AFFILIATION}
          hint={`Set affiliation ${s.label.toLowerCase()}`}
          keyName={s.letter}
          onClick={() => commands.setAffiliation(aff)}
          pressed={selected?.affiliation === aff}
          className="justify-center"
        >
          <AffiliationSymbol affiliation={aff} size={14} />
          {s.label.slice(0, 3)}
        </Action>
      );
    }
    switch (key) {
      case 'MARK':
        return (
          <Action
            key={key}
            state={st.MARK}
            hint="Mark the track detected"
            keyName="D"
            onClick={commands.markDetected}
          >
            <span>
              Mark<span className="sr-only"> detected</span>
            </span>
            <Kbd>D</Kbd>
          </Action>
        );
      case 'CUE':
        return (
          <Action
            key={key}
            state={selected ? { enabled: true, reason: null } : st.MARK}
            hint="Cue the camera to the track"
            keyName="Space"
            onClick={commands.slewToSelected}
          >
            Cue <Kbd>Space</Kbd>
          </Action>
        );
      case 'CLASSIFY':
        return (
          <Action
            key={key}
            state={st.CLASSIFY}
            hint="Choose a class (then 1–9, 0)"
            keyName="C"
            onClick={() => setUi({ classifyMenu: !classifyMenu, interceptArmed: false })}
            pressed={classifyMenu}
          >
            Classify <Kbd>C</Kbd>
          </Action>
        );
      case 'MONITOR':
        return (
          <Action
            key={key}
            state={st.MONITOR}
            hint="Keep tracking, no engagement"
            keyName="M"
            onClick={commands.monitor}
          >
            Monitor <Kbd>M</Kbd>
          </Action>
        );
      case 'REPORT':
        return (
          <Action
            key={key}
            state={st.REPORT}
            hint="Send a contact report on the selected track (then 1–5, Enter)"
            keyName="R"
            onClick={commands.openReport}
          >
            Report <Kbd>R</Kbd>
          </Action>
        );
      case 'JAM':
        return (
          <Action
            key={key}
            state={st.EW_JAM}
            hint="Jam RF links in a ±10° sector toward the track — hits everything in it"
            keyName="J"
            onClick={commands.jam}
          >
            <span className="flex items-center gap-1.5">{ring('EW_JAM')}Jam</span>
            <Kbd>J</Kbd>
          </Action>
        );
      case 'SPOOF':
        return (
          <Action
            key={key}
            state={st.EW_SPOOF}
            hint="Spoof GNSS navigation in a ±10° sector toward the track"
            keyName="S"
            onClick={commands.spoof}
          >
            <span className="flex items-center gap-1.5">{ring('EW_SPOOF')}Spoof</span>
            <Kbd>S</Kbd>
          </Action>
        );
      case 'INTERCEPT':
        return interceptArmed && st.INTERCEPT.enabled ? (
          <Action
            key={key}
            state={st.INTERCEPT}
            hint="Fire one interceptor round at the selected track"
            keyName="Enter"
            onClick={commands.confirmIntercept}
            variant="danger"
            className="border-crit bg-crit text-bg-0 hover:bg-crit"
          >
            Confirm <Kbd className="border-bg-0 text-bg-0">Enter</Kbd>
          </Action>
        ) : (
          <Action
            key={key}
            state={st.INTERCEPT}
            hint="Intercept — asks for Enter to confirm"
            keyName="I"
            onClick={commands.armIntercept}
          >
            <span className="flex items-center gap-1.5">
              {ring('INTERCEPT')}Intercept
              {ammo !== undefined && ammo !== null && (
                <span className="text-readout text-text-2">×{ammo}</span>
              )}
            </span>
            <Kbd>I</Kbd>
          </Action>
        );
      default:
        return null;
    }
  };

  const row = stageActions(selected);
  const more = moreActions(selected);
  // Two rows at most: the first takes up to three, wide labels need the room.
  const rows = [row.slice(0, 3), row.slice(3)].filter((r) => r.length > 0);

  return (
    <Panel
      className="relative h-full border-0"
      aria-label="Selected track"
      data-testid="track-card"
    >
      <div className="flex h-7 shrink-0 items-center gap-2 border-b border-line-1 bg-bg-2 px-3">
        {selected ? (
          <>
            <AffiliationSymbol affiliation={selected.affiliation} size={14} />
            <span className="text-readout text-text-1">{selected.id}</span>
            <span className="min-w-0 flex-1 truncate text-small text-text-body">
              {selected.classifiedAs ? CLASS_LABEL[selected.classifiedAs] : 'Unclassified'}
            </span>
            <span className="flex min-w-0 items-center gap-2" data-tour="ai">
              <AiChip track={selected} commands={commands} />
            </span>
          </>
        ) : (
          <>
            <span className="flex-1 text-panel-title text-text-1">Track card</span>
            <StateChip tone="muted" data-tour="ai">
              No track
            </StateChip>
          </>
        )}
      </div>
      {classifyMenu && st.CLASSIFY.enabled && <ClassifyMenu commands={commands} />}
      <ReportForm commands={commands} />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 p-2">
        {selected ? (
          <dl
            className="grid grid-cols-[auto_auto_auto_auto_minmax(0,1fr)] gap-x-3 text-readout"
            data-testid="track-kinematics"
          >
            <dd>
              {formatKm(selected.rangeM)}
              <span className="ml-0.5 text-text-2">km</span>
            </dd>
            <dd>{formatBearing(selected.bearingDeg)}</dd>
            <dd>{ALTITUDE_BAND_LABEL[altitudeBand(selected.altitudeAglM)]}</dd>
            <dd>
              {selected.speedMps === null ? '—' : Math.round(selected.speedMps)}
              <span className="ml-0.5 text-text-2">m/s</span>
            </dd>
            <dd
              className="truncate text-right text-text-2"
              title={asset ? `Time to ${asset.name}` : undefined}
            >
              {asset?.etaS != null ? <>to asset {formatClock(asset.etaS * 1000)}</> : 'not closing'}
            </dd>
          </dl>
        ) : (
          <p className="text-small text-text-2">Select a track: Tab, or click it.</p>
        )}
        {next && (
          <p
            className="flex h-7 min-w-0 shrink-0 items-center gap-1.5 rounded-sm bg-primary-bg px-2 text-panel-title text-primary-fg"
            data-testid="next-step"
          >
            <span className="shrink-0">Next</span>
            <span className="min-w-0 flex-1 truncate font-normal normal-case" title={next.text}>
              {next.text}
            </span>
            {next.keys.map((k) => (
              <Kbd key={k} className="border-primary-fg/40 text-primary-fg">
                {k}
              </Kbd>
            ))}
          </p>
        )}
        <div className="mt-auto space-y-1">
          {rows.map((r, i) => (
            <div key={i} role="group" aria-label="Actions for this stage" className="flex gap-1">
              {r.map(action)}
            </div>
          ))}
          <div ref={moreRoot} className="relative">
            <Button
              size="hud"
              variant="ghost"
              className="w-full justify-between"
              aria-expanded={moreOpen}
              data-testid="more-actions"
              {...(!row.includes('REPORT') ? { 'data-tour': 'report' } : {})}
              onClick={() => setUi({ moreOpen: !moreOpen })}
            >
              <span className="flex items-center gap-1">
                More actions <ChevronDown aria-hidden size={14} strokeWidth={1.5} />
              </span>
              <Kbd>.</Kbd>
            </Button>
            {moreOpen && (
              <div
                role="group"
                aria-label="More actions"
                data-testid="more-menu"
                className="absolute bottom-full right-0 z-40 mb-1 grid w-full grid-cols-2 gap-1 rounded-md border border-line-2 bg-bg-2 p-1 shadow-overlay"
              >
                {more.map(action)}
              </div>
            )}
          </div>
        </div>
      </div>
    </Panel>
  );
}
