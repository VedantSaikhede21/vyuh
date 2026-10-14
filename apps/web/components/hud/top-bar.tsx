'use client';

import { Button } from '@/components/ui/button';
import type { Commands } from '@/lib/sim/commands';
import { useHudStore } from '@/lib/sim/store';
import { useUiStore } from '@/lib/sim/ui-store';
import { ROE_LABEL, formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';

const TONE: Record<string, string> = {
  info: 'text-text-2',
  good: 'text-ok',
  warn: 'text-warn',
  bad: 'text-crit',
};

/** Top bar (SPEC §15): scenario, clock, ROE state, latest alert or message. */
export function TopBar({
  name,
  mode,
  upload,
  commands,
}: {
  name: string;
  mode: string;
  upload: string;
  commands: Commands;
}) {
  const hud = useHudStore((s) => s.hud);
  const message = useUiStore((s) => s.message);
  const setUi = useUiStore((s) => s.set);
  if (!hud) return null;
  const alert = hud.alerts[0];
  return (
    <div className="flex h-10 items-center gap-3 border-b border-line-1 bg-bg-1 px-3 text-readout">
      <span className="font-semibold uppercase tracking-wider">{name}</span>
      <span className="text-label">{mode}</span>
      <span className="tnum" aria-label="Elapsed and remaining time">
        T+{formatClock(hud.tMs)}{' '}
        <span className="text-text-2">/ −{formatClock(hud.durationMs - hud.tMs)}</span>
      </span>
      <span
        className={cn(
          'rounded-sm border px-1.5 text-small font-semibold',
          hud.roe === 'WEAPONS_FREE' ? 'border-ok text-ok' : 'border-warn text-warn',
        )}
      >
        {ROE_LABEL[hud.roe]}
      </span>
      {hud.paused && <span className="font-semibold text-warn">PAUSED</span>}
      <span
        className={cn('min-w-0 flex-1 truncate', TONE[message?.tone ?? alert?.tone ?? 'info'])}
        role="status"
      >
        {message ? message.text : alert ? `T+${formatClock(alert.tMs)} ${alert.text}` : ''}
      </span>
      <span className="text-label hidden xl:inline">{upload}</span>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setUi({ cheatSheet: true })}
        aria-label="Keyboard shortcuts"
      >
        ?
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={hud.endReason !== null}
        onClick={commands.abort}
      >
        End session
      </Button>
    </div>
  );
}
