'use client';

import type { Affiliation } from '@vyuh/shared';
import type { ReactNode } from 'react';
import { Keyboard, Pause, Play } from 'lucide-react';
import {
  AffiliationSymbol,
  Banner,
  CooldownRing,
  Kbd,
  StateChip,
  Tooltip,
} from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import { formatKm } from '@/lib/hud/derive';
import type { Commands } from '@/lib/sim/commands';
import type { BatcherStatus } from '@/lib/sim/event-batcher';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore, type MainView } from '@/lib/sim/ui-store';
import { EFFECTOR_LABEL, ROE_LABEL, formatClock } from '@/lib/strings';
import { pickBanner } from './use-hud-derived';

const AFFILIATIONS: Affiliation[] = ['HOSTILE', 'UNKNOWN', 'FRIENDLY', 'NEUTRAL'];

/** `undefined` = no server session at all (local replay): no chip. */
function Connection({ upload }: { upload: BatcherStatus | null | undefined }) {
  if (upload === undefined) return null;
  if (!upload) return <StateChip tone="muted">Connecting</StateChip>;
  if (upload.error) return <StateChip tone="crit">Upload failed</StateChip>;
  if (upload.retrying) return <StateChip tone="warn">Queued {upload.pendingEvents}</StateChip>;
  return (
    <Tooltip content="Events sent to the server for scoring" align="end">
      <StateChip tone="muted" tabIndex={0}>
        Synced {upload.sentEvents}
      </StateChip>
    </Tooltip>
  );
}

/** Effector readiness at a glance; the numbers are in each pip's tooltip. */
function EffectorPips() {
  const effectors = useHudStore((s) => s.hud?.effectors);
  const tMs = useHudStore((s) => s.hud?.tMs ?? 0);
  return (
    <ul className="flex items-center gap-2" aria-label="Effectors" data-testid="effector-pips">
      {effectors?.map((e) => {
        const left = Math.max(0, e.readyAtMs - tMs);
        const ready = left > 0 ? `${(left / 1000).toFixed(1)} s` : 'Ready';
        const rounds = e.ammo === null ? 'unlimited rounds' : `${e.ammo} rounds`;
        return (
          <li key={e.id}>
            <Tooltip
              content={`${EFFECTOR_LABEL[e.kind]}: ${ready} · ${rounds} · ${formatKm(e.rangeM)} km`}
              side="bottom"
            >
              <span className="flex items-center gap-1" tabIndex={0}>
                <CooldownRing remaining={e.cooldownMs ? left / e.cooldownMs : 0} size={12} />
                <span className="text-label text-text-1">{EFFECTOR_LABEL[e.kind]}</span>
                {e.ammo !== null && <span className="text-readout text-text-2">{e.ammo}</span>}
              </span>
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

function ViewControl() {
  const mainView = useUiStore((s) => s.mainView);
  const set = useUiStore((s) => s.set);
  return (
    <div data-tour="views">
      <SegmentedControl<MainView>
        label="Main view"
        size="hud"
        value={mainView}
        onChange={(v) => set({ mainView: v })}
        items={[
          { value: 'TACTICAL', label: 'Map', hint: 'Tactical map · V', testId: 'view-tactical' },
          { value: 'EO', label: 'Camera', hint: 'EO/IR camera · V', testId: 'view-eo' },
          { value: 'RADAR', label: 'Radar', hint: 'Wide radar · W', testId: 'view-radar' },
        ]}
      />
    </div>
  );
}

/**
 * Top bar (DESIGN §11.5): scenario, clock, ROE and mode chips, track counts by
 * the trainee's own affiliation calls, a single alert line, connection state,
 * pause (practice), shortcuts and End session with an inline confirm.
 */
export function TopBar({
  runtime,
  upload,
  commands,
  replay,
}: {
  runtime: SimRuntime;
  upload: BatcherStatus | null | undefined;
  commands: Commands;
  /** AAR replay: a REPLAY chip and these controls instead of pause / End session. */
  replay?: ReactNode;
}) {
  const hud = useHudStore((s) => s.hud);
  if (!hud) return null;
  const banner = pickBanner(runtime, hud, upload ?? null);
  const active = hud.tracks.filter((t) => t.status === 'ACTIVE');
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-line-1 bg-bg-1 px-3">
      <span
        className="max-w-40 truncate text-panel-title text-text-1"
        title={runtime.scenario.name}
      >
        {runtime.scenario.name}
      </span>
      <span className="flex items-baseline gap-2" aria-label="Session clock">
        <span className="font-mono text-[24px] leading-none font-medium tracking-tight text-text-1 tnum">
          {formatClock(hud.tMs)}
        </span>
        <span className="text-readout text-text-2">−{formatClock(hud.durationMs - hud.tMs)}</span>
      </span>
      <StateChip>{ROE_LABEL[hud.roe]}</StateChip>
      <StateChip tone="muted">{runtime.mode}</StateChip>
      {replay !== undefined && <StateChip data-testid="replay-chip">Replay</StateChip>}
      {hud.paused && <StateChip tone="warn">Paused</StateChip>}
      <ul className="flex items-center gap-2" aria-label="Active tracks by your affiliation call">
        {AFFILIATIONS.map((a) => (
          <li key={a} className="flex items-center gap-1" title={`${AFFILIATION_STYLE[a].label}`}>
            <AffiliationSymbol affiliation={a} size={14} />
            <span className="text-readout text-text-1">
              {active.filter((t) => t.affiliation === a).length}
            </span>
          </li>
        ))}
      </ul>
      <EffectorPips />
      <div className="min-w-0 flex-1">
        {banner && <Banner tone={banner.tone}>{banner.text}</Banner>}
      </div>
      <ViewControl />
      <Connection upload={upload} />
      {replay !== undefined ? replay : <LiveControls runtime={runtime} commands={commands} />}
    </div>
  );
}

/** Pause (practice), the shortcut sheet and End session with its inline confirm. */
function LiveControls({ runtime, commands }: { runtime: SimRuntime; commands: Commands }) {
  const hud = useHudStore((s) => s.hud);
  const endArmed = useUiStore((s) => s.endArmed);
  const setUi = useUiStore((s) => s.set);
  if (!hud) return null;
  const ended = hud.endReason !== null;
  return (
    <>
      {runtime.mode === 'PRACTICE' && (
        <Tooltip content={hud.paused ? 'Resume' : 'Pause (practice only)'} shortcut="P" align="end">
          <Button
            size="hud"
            variant="ghost"
            disabled={ended}
            onClick={commands.togglePause}
            aria-label={hud.paused ? 'Resume' : 'Pause'}
          >
            {hud.paused ? (
              <Play size={16} strokeWidth={1.5} />
            ) : (
              <Pause size={16} strokeWidth={1.5} />
            )}
          </Button>
        </Tooltip>
      )}
      <Tooltip content="Keyboard shortcuts and symbols" shortcut="?" align="end" side="bottom">
        <Button
          size="hud"
          variant="ghost"
          onClick={() => setUi({ cheatSheet: true })}
          aria-label="Keyboard shortcuts"
        >
          <Keyboard size={16} strokeWidth={1.5} />
        </Button>
      </Tooltip>
      {endArmed ? (
        <span className="flex items-center gap-1">
          <Button size="hud" variant="danger" onClick={commands.abort} autoFocus>
            Confirm end{runtime.mode === 'ASSESSMENT' && ' · not scored'} <Kbd>Enter</Kbd>
          </Button>
          <Button size="hud" variant="ghost" onClick={() => setUi({ endArmed: false })}>
            Cancel
          </Button>
        </span>
      ) : (
        <Tooltip
          content={
            runtime.mode === 'ASSESSMENT'
              ? 'Stop now. An Assessment ended early is not scored'
              : 'Stop now and review what you have done, with no total'
          }
          align="end"
          side="bottom"
        >
          <Button size="hud" disabled={ended} onClick={commands.armEnd}>
            End session
          </Button>
        </Tooltip>
      )}
    </>
  );
}
