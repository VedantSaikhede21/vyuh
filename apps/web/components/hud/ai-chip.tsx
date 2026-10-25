'use client';

import type { TrackView } from '@/lib/sim/store';
import { Kbd, StateChip, Tooltip } from '@/components/hud/primitives';
import type { Commands } from '@/lib/sim/commands';
import { CLASS_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';

// AI-assist chip (SPEC §13.3): a pre-baked, deliberately imperfect suggestion for the
// selected track. The wording says it is a suggestion that can be wrong; Y accepts
// (and classifies), X rejects. Its use is measured as over- / under-trust (SPEC §9.4).

export const aiPct = (c: number) => `${Math.round(c * 100)}%`;

/** Class name as the chip and 3D label show it — the same words as Comms (audit P1-5). */
const aiClass = (ai: NonNullable<TrackView['ai']>) => CLASS_LABEL[ai.suggestedClass].toUpperCase();

/** One-line label, e.g. "AI SUGGESTS · SMALL QUADCOPTER · 72%". */
export function aiLabel(ai: NonNullable<TrackView['ai']>): string {
  return `AI SUGGESTS · ${aiClass(ai)} · ${aiPct(ai.confidence)}`;
}

/** In the action bar header: the suggestion with Y / X controls. */
export function AiChip({ track, commands }: { track: TrackView; commands: Commands }) {
  const ai = track.ai;
  if (!ai) return null;
  const tip = `AI suggestion for ${track.id}: ${CLASS_LABEL[ai.suggestedClass]}, ${aiPct(
    ai.confidence,
  )} confidence. It can be wrong — confirm on the camera first.`;
  if (ai.decision) {
    return (
      <Tooltip content={tip} align="end">
        <StateChip tone="muted" data-testid="ai-chip" tabIndex={0}>
          AI {aiClass(ai)} · {ai.decision === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED'}
        </StateChip>
      </Tooltip>
    );
  }
  const btn =
    'inline-flex h-5 items-center gap-1 rounded-sm border border-line-2 px-1 text-label hover:bg-bg-3 focus-visible:outline-2 focus-visible:outline-select';
  return (
    <span className="flex min-w-0 items-center gap-1" data-testid="ai-chip">
      <Tooltip content={tip} align="end">
        {/* "AI · CLASS · %" — the header has no room for "SUGGESTS" next to Y / X;
            the tooltip and the 3D label say it in full. */}
        <StateChip tone="neutral" tabIndex={0} className="min-w-0 font-mono tnum">
          <span className="truncate">
            AI · {aiClass(ai)} · {aiPct(ai.confidence)}
          </span>
        </StateChip>
      </Tooltip>
      <Tooltip content="Accept: classify as suggested" shortcut="Y" align="end">
        <button
          type="button"
          className={btn}
          onClick={commands.acceptAi}
          aria-label="Accept AI suggestion"
        >
          <Kbd>Y</Kbd>
        </button>
      </Tooltip>
      <Tooltip content="Reject the suggestion" shortcut="X" align="end">
        <button
          type="button"
          className={btn}
          onClick={commands.rejectAi}
          aria-label="Reject AI suggestion"
        >
          <Kbd>X</Kbd>
        </button>
      </Tooltip>
    </span>
  );
}

/** Second line of the selected track's 3D label. */
export function AiLabelLine({ ai }: { ai: NonNullable<TrackView['ai']> }) {
  return (
    <div
      className={cn(
        'mt-px whitespace-nowrap border bg-bg-1 px-1 text-[11px] leading-4 font-mono',
        ai.decision ? 'border-line-1 text-text-2' : 'border-line-2 text-text-1',
      )}
      data-testid="ai-label"
    >
      {ai.decision ? `AI ${aiClass(ai)} · ${ai.decision}` : `${aiLabel(ai)} · Y/X`}
    </div>
  );
}
