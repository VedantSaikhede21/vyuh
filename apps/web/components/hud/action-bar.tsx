'use client';

import type { Affiliation } from '@vyuh/shared';
import type { ReactNode } from 'react';
import { AiChip } from '@/components/hud/ai-chip';
import {
  AffiliationSymbol,
  CooldownRing,
  Kbd,
  Panel,
  PanelHeader,
  StateChip,
  Tooltip,
} from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import { actionStates, formatKm, type ActionState } from '@/lib/hud/derive';
import type { Commands } from '@/lib/sim/commands';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore, type EffectorView } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { CLASS_MENU, EFFECTOR_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';
import { ReportForm } from './report-form';
import { useEffectorSites } from './use-hud-derived';

const AFFILIATIONS: Affiliation[] = ['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN'];

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div role="group" aria-label={label} className="space-y-1">
      <div className="text-label">{label}</div>
      {children}
    </div>
  );
}

/** A HUD action: tooltip with what it does (or why it is disabled) and its key. */
function Action({
  state,
  hint,
  keyName,
  onClick,
  variant = 'secondary',
  align = 'center',
  className,
  pressed,
  children,
}: {
  state: ActionState;
  hint: string;
  keyName: string;
  onClick: () => void;
  variant?: 'secondary' | 'danger';
  align?: 'start' | 'center' | 'end';
  className?: string;
  pressed?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip content={state.reason ?? hint} shortcut={keyName} align={align} className="w-full">
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

/**
 * Effector status as one compact cell (three fit side by side, so the action bar
 * needs no scroll at 1366×768): class and readiness, then rounds and range.
 */
function EffectorCell({ e, tMs }: { e: EffectorView; tMs: number }) {
  const left = Math.max(0, e.readyAtMs - tMs);
  const ready = left > 0 ? `${(left / 1000).toFixed(1)} s` : 'Ready';
  const rounds = e.ammo === null ? 'unlimited' : `${e.ammo}`;
  return (
    <div
      role="group"
      aria-label={`${e.id}: ${ready}, rounds ${rounds}, range ${formatKm(e.rangeM)} km`}
      className="min-w-0 space-y-0.5"
    >
      <div className="flex items-center gap-1.5 whitespace-nowrap">
        <CooldownRing remaining={e.cooldownMs ? left / e.cooldownMs : 0} size={12} />
        <span className="text-label text-text-1">{EFFECTOR_LABEL[e.kind]}</span>
        <span className={cn('ml-auto text-label', left > 0 ? 'text-warn' : 'text-text-2')}>
          {ready}
        </span>
      </div>
      <div className="flex items-baseline justify-between whitespace-nowrap text-readout">
        <span>
          <span className="text-text-3">×</span>
          {e.ammo === null ? '∞' : e.ammo}
        </span>
        <span>
          {formatKm(e.rangeM)}
          <span className="ml-0.5 text-text-3">km</span>
        </span>
      </div>
    </div>
  );
}

/** Classify menu as a floating overlay above the action bar (DESIGN §5 overlay). */
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

/** Action bar (DESIGN §11.5): Identify · Respond, plus labelled effector status. */
export function ActionBar({ runtime, commands }: { runtime: SimRuntime; commands: Commands }) {
  const hud = useHudStore((s) => s.hud);
  const classifyMenu = useUiStore((s) => s.classifyMenu);
  const interceptArmed = useUiStore((s) => s.interceptArmed);
  const setUi = useUiStore((s) => s.set);
  const sites = useEffectorSites(runtime, hud);
  if (!hud) return null;
  const st = actionStates(hud, sites, runtime.scenario.zones, runtime.mode);
  const selected = hud.tracks.find((t) => t.id === hud.selectedTrackId) ?? null;
  const ring = (kind: 'EW_JAM' | 'EW_SPOOF' | 'INTERCEPT') => {
    const e = sites[kind]?.view;
    if (!e) return null;
    const left = Math.max(0, e.readyAtMs - hud.tMs);
    return <CooldownRing remaining={e.cooldownMs ? left / e.cooldownMs : 0} size={14} />;
  };
  const ammo = sites.INTERCEPT?.view.ammo;

  return (
    <Panel className="relative h-full border-0">
      <PanelHeader title="Actions">
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <AiChip track={selected} commands={commands} />
            {/* While a suggestion waits for Y / X the id stays on the row and 3D label. */}
            {(!selected.ai || selected.ai.decision) && (
              <StateChip tone="active">{selected.id}</StateChip>
            )}
          </span>
        ) : (
          <StateChip tone="muted">No track</StateChip>
        )}
      </PanelHeader>
      {classifyMenu && st.CLASSIFY.enabled && <ClassifyMenu commands={commands} />}
      <ReportForm commands={commands} />
      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        <Group label="Identify">
          <div className="grid grid-cols-2 gap-1">
            <Action
              state={st.MARK}
              hint="Mark the track detected"
              keyName="D"
              onClick={commands.markDetected}
              align="start"
            >
              Mark detected <Kbd>D</Kbd>
            </Action>
            <Action
              state={st.CLASSIFY}
              hint="Choose a class (then 1–9, 0)"
              keyName="C"
              onClick={() => setUi({ classifyMenu: !classifyMenu, interceptArmed: false })}
              pressed={classifyMenu}
              align="end"
            >
              Classify <Kbd>C</Kbd>
            </Action>
          </div>
          <div className="grid grid-cols-4 gap-1">
            {AFFILIATIONS.map((a, i) => {
              const s = AFFILIATION_STYLE[a];
              return (
                <Action
                  key={a}
                  state={st.AFFILIATION}
                  hint={`Set affiliation ${s.label.toLowerCase()}`}
                  keyName={s.letter}
                  onClick={() => commands.setAffiliation(a)}
                  pressed={selected?.affiliation === a}
                  align={i === 0 ? 'start' : i === 3 ? 'end' : 'center'}
                  className="justify-center"
                >
                  <AffiliationSymbol affiliation={a} size={14} />
                  {s.label.slice(0, 3)}
                </Action>
              );
            })}
          </div>
        </Group>
        <Group label="Respond">
          <div className="grid grid-cols-6 gap-1">
            <div className="col-span-2">
              <Action
                state={st.MONITOR}
                hint="Keep tracking, no engagement"
                keyName="M"
                onClick={commands.monitor}
                align="start"
              >
                Monitor <Kbd>M</Kbd>
              </Action>
            </div>
            {/* A report is a response too (CLAUDE.md §2 rule 9); decision 114. */}
            <div className="col-span-2">
              <Action
                state={st.REPORT}
                hint="Send a contact report on the selected track (then 1–5, Enter)"
                keyName="R"
                onClick={commands.openReport}
              >
                Report <Kbd>R</Kbd>
              </Action>
            </div>
            <div className="col-span-2">
              <Action
                state={st.EW_JAM}
                hint="Jam RF links in a ±10° sector toward the track — hits everything in it"
                keyName="J"
                onClick={commands.jam}
                align="end"
              >
                <span className="flex items-center gap-1.5">{ring('EW_JAM')}Jam</span>
                <Kbd>J</Kbd>
              </Action>
            </div>
            <div className="col-span-3">
              <Action
                state={st.EW_SPOOF}
                hint="Spoof GNSS navigation in a ±10° sector toward the track"
                keyName="S"
                onClick={commands.spoof}
                align="start"
              >
                <span className="flex items-center gap-1.5">{ring('EW_SPOOF')}Spoof</span>
                <Kbd>S</Kbd>
              </Action>
            </div>
            <div className="col-span-3">
              {interceptArmed && st.INTERCEPT.enabled ? (
                <Action
                  state={st.INTERCEPT}
                  hint="Fire one interceptor round at the selected track"
                  keyName="Enter"
                  onClick={commands.confirmIntercept}
                  variant="danger"
                  align="end"
                  className="border-crit bg-crit text-bg-0 hover:bg-crit"
                >
                  Confirm <Kbd className="border-bg-0 text-bg-0">Enter</Kbd>
                </Action>
              ) : (
                <Action
                  state={st.INTERCEPT}
                  hint="Intercept — asks for Enter to confirm"
                  keyName="I"
                  onClick={commands.armIntercept}
                  variant="danger"
                  align="end"
                >
                  <span className="flex items-center gap-1.5">
                    {ring('INTERCEPT')}Intercept
                    {ammo !== undefined && ammo !== null && (
                      <span className="text-readout text-text-2">×{ammo}</span>
                    )}
                  </span>
                  <Kbd>I</Kbd>
                </Action>
              )}
            </div>
          </div>
        </Group>
        <div
          aria-label="Effectors"
          className="mt-auto grid grid-cols-3 gap-x-3 border-t border-line-1 pt-1.5"
        >
          {hud.effectors.map((e) => (
            <EffectorCell key={e.id} e={e} tMs={hud.tMs} />
          ))}
        </div>
      </div>
    </Panel>
  );
}
