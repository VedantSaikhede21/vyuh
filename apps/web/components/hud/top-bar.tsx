'use client';

import type { Affiliation } from '@vyuh/shared';
import type { ReactNode } from 'react';
import { Keyboard, Pause, Play } from 'lucide-react';
import { AffiliationSymbol, Banner, Kbd, StateChip, Tooltip } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { AFFILIATION_STYLE } from '@/lib/affiliation';
import type { Commands } from '@/lib/sim/commands';
import type { BatcherStatus } from '@/lib/sim/event-batcher';
import type { SimRuntime } from '@/lib/sim/runtime';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { ROE_LABEL, formatClock } from '@/lib/strings';
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
        <span className="text-readout-lg text-text-1">{formatClock(hud.tMs)}</span>
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
      <div className="min-w-0 flex-1">
        {banner && <Banner tone={banner.tone}>{banner.text}</Banner>}
      </div>
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
            Confirm end <Kbd>Enter</Kbd>
          </Button>
          <Button size="hud" variant="ghost" onClick={() => setUi({ endArmed: false })}>
            Cancel
          </Button>
        </span>
      ) : (
        <Tooltip content="Stop now and score what you have done" align="end" side="bottom">
          <Button size="hud" disabled={ended} onClick={commands.armEnd}>
            End session
          </Button>
        </Tooltip>
      )}
    </>
  );
}
