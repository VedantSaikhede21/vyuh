'use client';

import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';
import { memo, useEffect, useMemo } from 'react';
import { Kbd, Panel, PanelHeader, StateChip, Tooltip } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { REPLAY_SPEEDS, type ReplayController } from '@/lib/replay/controller';
import type { MarkerKind, TimelineMarker } from '@/lib/replay/gate';
import { useReplayStore } from '@/lib/replay/store';
import { formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';

// Replay timeline (DESIGN §11.7, Phase 4a): scrubber with event markers, play /
// pause, 1× / 2× / 4×, step one tick, ground truth, all from the keyboard.

/** One-word names for the legend under the scrubber. */
const MARKER_SHORT: Record<MarkerKind, string> = {
  DETECT: 'Detect',
  CLASSIFY: 'Class',
  RESPOND: 'Order',
  GOOD: 'Kill',
  BAD: 'Leak',
  PENALTY: 'Penalty',
};

const MARKER_NAME: Record<MarkerKind, string> = {
  DETECT: 'Marked detected',
  CLASSIFY: 'Classified',
  RESPOND: 'Response ordered',
  GOOD: 'Neutralised',
  BAD: 'Leak or payload drop',
  PENALTY: 'Penalty',
};

/** Shape + colour per marker kind (never colour alone, DESIGN §10). */
export function MarkerGlyph({ kind, className }: { kind: MarkerKind; className?: string }) {
  const common = { width: 9, height: 9, viewBox: '0 0 9 9', 'aria-hidden': true, className };
  switch (kind) {
    case 'DETECT':
      return (
        <svg {...common} className={cn('text-text-2', className)}>
          <rect x="3.5" y="0" width="2" height="9" fill="currentColor" />
        </svg>
      );
    case 'CLASSIFY':
      return (
        <svg {...common} className={cn('text-text-1', className)}>
          <rect x="1" y="1" width="7" height="7" fill="none" stroke="currentColor" />
        </svg>
      );
    case 'RESPOND':
      return (
        <svg {...common} className={cn('text-text-1', className)}>
          <path d="M4.5 0.5 L8.5 8.5 H0.5 Z" fill="currentColor" />
        </svg>
      );
    case 'GOOD':
      return (
        <svg {...common} className={cn('text-ok', className)}>
          <circle cx="4.5" cy="4.5" r="3.5" fill="currentColor" />
        </svg>
      );
    case 'BAD':
      return (
        <svg {...common} className={cn('text-crit', className)}>
          <path d="M4.5 0.5 L8.5 4.5 L4.5 8.5 L0.5 4.5 Z" fill="currentColor" />
        </svg>
      );
    case 'PENALTY':
      return (
        <svg {...common} className={cn('text-crit', className)}>
          <path d="M1 1 L8 8 M8 1 L1 8" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      );
  }
}

/** Markers closer than 0.6 % of the timeline form a cluster, spread 10 px apart around its centre. */
export function fanOffsets(markers: readonly TimelineMarker[], endTMs: number): number[] {
  const out: number[] = [];
  let start = 0;
  for (let i = 0; i <= markers.length; i++) {
    const m = markers[i];
    const first = markers[start];
    if (m && first && (m.tMs - first.tMs) / Math.max(endTMs, 1) <= 0.006) continue;
    const n = i - start;
    for (let k = 0; k < n; k++) out[start + k] = (k - (n - 1) / 2) * 10;
    start = i;
  }
  return out;
}

/** Keyboard control of the replay (shown in the help sheet). */
export const REPLAY_KEYS: [string, string][] = [
  ['Space', 'Play / pause'],
  ['← / →', 'Step one tick (50 ms)'],
  ['Shift + ← / →', 'Back / forward 10 s'],
  ['[ / ]', 'Previous / next marker'],
  ['Home / End', 'Start / end'],
  ['1  2  4', 'Speed'],
  ['G', 'Ground truth on / off'],
  ['?', 'This help'],
];

export function useReplayKeys(
  controller: ReplayController,
  markers: readonly TimelineMarker[],
  seek: (tMs: number) => void,
): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) && e.key !== ' ') return;
      // The kill-chain table moves its own focus with arrows, Home and End.
      if (el?.closest('[data-kc-grid]') && /^(Arrow|Home$|End$)/.test(e.key)) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const st = useReplayStore.getState();
      const t = controller.tMs;
      let handled = true;
      if (e.key === ' ') {
        controller.togglePlay();
        st.set({ playing: controller.playing });
      } else if (e.key === 'ArrowLeft') seek(e.shiftKey ? t - 10_000 : t - 50);
      else if (e.key === 'ArrowRight') seek(e.shiftKey ? t + 10_000 : t + 50);
      else if (e.key === 'Home') seek(0);
      else if (e.key === 'End') seek(controller.endTMs);
      else if (e.key === '[') {
        const prev = [...markers].reverse().find((m) => m.tMs < t);
        if (prev) seek(prev.tMs);
      } else if (e.key === ']') {
        const next = markers.find((m) => m.tMs > t);
        if (next) seek(next.tMs);
      } else if (e.key === '1' || e.key === '2' || e.key === '4') {
        controller.setSpeed(Number(e.key) as 1 | 2 | 4);
        st.set({ speed: controller.speed });
      } else if (e.key.toLowerCase() === 'g') st.set({ truth: !st.truth });
      else if (e.key === '?') st.set({ help: !st.help });
      else if (e.key === 'Escape') st.set({ help: false });
      else handled = false;
      if (handled) e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller, markers, seek]);
}

function pctOf(t: number, end: number): string {
  return `${(Math.min(Math.max(t / end, 0), 1) * 100).toFixed(3)}%`;
}

/** The markers above the scrubber: fixed for a session, so not redrawn as time moves. */
const MarkerStrip = memo(function MarkerStrip({
  markers,
  end,
  seek,
}: {
  markers: readonly TimelineMarker[];
  end: number;
  seek: (tMs: number) => void;
}) {
  const fan = useMemo(() => fanOffsets(markers, end), [markers, end]);
  return (
    <div className="absolute inset-x-0 top-1.5 h-3" aria-hidden>
      {markers.map((m, i) => (
        <button
          key={`${m.tMs}-${i}`}
          type="button"
          tabIndex={-1}
          title={`${formatClock(m.tMs)} · ${MARKER_NAME[m.kind]} · ${m.text}`}
          className="absolute top-0"
          style={{
            left: pctOf(m.tMs, end),
            // Markers at (nearly) the same moment fan out side by side.
            transform: `translateX(calc(-50% + ${fan[i] ?? 0}px))`,
          }}
          onClick={() => seek(m.tMs)}
          data-marker={m.kind}
        >
          <MarkerGlyph kind={m.kind} />
        </button>
      ))}
    </div>
  );
});

export function ReplayTimeline({
  controller,
  markers,
  seek,
}: {
  controller: ReplayController;
  markers: readonly TimelineMarker[];
  seek: (tMs: number) => void;
}) {
  const tMs = useReplayStore((s) => s.tMs);
  const playing = useReplayStore((s) => s.playing);
  const speed = useReplayStore((s) => s.speed);
  const truth = useReplayStore((s) => s.truth);
  const set = useReplayStore((s) => s.set);
  const end = Math.max(controller.endTMs, 1);

  return (
    <div
      className="flex h-[68px] shrink-0 items-center gap-3 border-t border-line-1 bg-bg-1 px-3"
      data-testid="replay-timeline"
    >
      <div className="flex items-center gap-1">
        <Tooltip content="Back one tick" shortcut="←">
          <Button
            size="hud"
            variant="ghost"
            aria-label="Back one tick"
            onClick={() => seek(tMs - 50)}
          >
            <ChevronLeft size={16} strokeWidth={1.5} />
          </Button>
        </Tooltip>
        <Tooltip content={playing ? 'Pause' : 'Play'} shortcut="Space">
          <Button
            size="hud"
            aria-label={playing ? 'Pause' : 'Play'}
            data-testid="replay-play"
            onClick={() => {
              controller.togglePlay();
              set({ playing: controller.playing });
            }}
          >
            {playing ? <Pause size={16} strokeWidth={1.5} /> : <Play size={16} strokeWidth={1.5} />}
          </Button>
        </Tooltip>
        <Tooltip content="Forward one tick" shortcut="→">
          <Button
            size="hud"
            variant="ghost"
            aria-label="Forward one tick"
            onClick={() => seek(tMs + 50)}
          >
            <ChevronRight size={16} strokeWidth={1.5} />
          </Button>
        </Tooltip>
      </div>
      <SegmentedControl
        label="Replay speed"
        size="hud"
        value={String(speed)}
        onChange={(v) => {
          controller.setSpeed(Number(v) as (typeof REPLAY_SPEEDS)[number]);
          set({ speed: controller.speed });
        }}
        items={REPLAY_SPEEDS.map((s) => ({
          value: String(s),
          label: <span className="font-mono tnum">{s}×</span>,
        }))}
      />
      <span className="w-[7.5rem] shrink-0 font-mono text-readout" data-testid="replay-clock">
        <span className="text-text-1">{formatClock(tMs)}</span>
        <span className="text-text-2"> / {formatClock(end)}</span>
      </span>
      <div className="relative min-w-0 flex-1 self-stretch">
        <MarkerStrip markers={markers} end={end} seek={seek} />
        <input
          type="range"
          min={0}
          max={end}
          step={50}
          value={tMs}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Replay time"
          aria-valuetext={formatClock(tMs)}
          data-testid="replay-scrubber"
          className="replay-scrubber absolute inset-x-0 top-[22px] h-4 w-full cursor-pointer"
        />
        {/* Marker legend, always in view (audit P1-14); full names in the ? help. */}
        <ul
          className="absolute inset-x-0 bottom-1 flex justify-end gap-3 text-[11px] leading-4 text-text-2"
          aria-label="Marker legend"
          data-testid="marker-legend"
        >
          {(Object.keys(MARKER_SHORT) as MarkerKind[]).map((k) => (
            <li key={k} className="flex items-center gap-1" title={MARKER_NAME[k]}>
              <MarkerGlyph kind={k} />
              {MARKER_SHORT[k]}
            </li>
          ))}
        </ul>
      </div>
      {/* A switch, not an action: the label names it, the chip says its state (audit P1-14). */}
      <Tooltip content="Show what was really there" shortcut="G" align="end">
        <Button
          size="hud"
          variant="secondary"
          role="switch"
          aria-checked={truth}
          data-testid="truth-toggle"
          onClick={() => set({ truth: !truth })}
        >
          Ground truth
          <StateChip tone={truth ? 'active' : 'muted'} className="ml-1">
            {truth ? 'On' : 'Off'}
          </StateChip>
          <Kbd>G</Kbd>
        </Button>
      </Tooltip>
    </div>
  );
}

export function ReplayHelp() {
  const open = useReplayStore((s) => s.help);
  const set = useReplayStore((s) => s.set);
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-0/80"
      role="dialog"
      aria-modal
      aria-labelledby="replay-help-title"
    >
      <Panel className="w-[520px] max-w-[95vw] rounded-md shadow-overlay">
        <PanelHeader title="Replay controls and markers" titleId="replay-help-title">
          <Button size="hud" variant="ghost" onClick={() => set({ help: false })}>
            Close <Kbd>Esc</Kbd>
          </Button>
        </PanelHeader>
        <div className="grid grid-cols-2 gap-6 p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-small">
            {REPLAY_KEYS.map(([k, v]) => (
              <div key={k} className="contents">
                <dt>
                  <Kbd>{k}</Kbd>
                </dt>
                <dd className="text-text-2">{v}</dd>
              </div>
            ))}
          </dl>
          <ul className="space-y-1.5 text-small text-text-2">
            {(Object.keys(MARKER_NAME) as MarkerKind[]).map((k) => (
              <li key={k} className="flex items-center gap-2">
                <MarkerGlyph kind={k} />
                {MARKER_NAME[k]}
              </li>
            ))}
          </ul>
        </div>
      </Panel>
    </div>
  );
}
