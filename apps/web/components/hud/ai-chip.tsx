'use client';

import type { TrackView } from '@/lib/sim/store';
import { Kbd, StateChip, Tooltip } from '@/components/hud/primitives';
import type { Commands } from '@/lib/sim/commands';
import { CLASS_CODE, CLASS_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';

// AI-assist chip (SPEC §13.3): a pre-baked, deliberately imperfect suggestion for the
// selected track. The wording says it is a suggestion that can be wrong; Y accepts
// (and classifies), X rejects. Its use is measured as over- / under-trust (SPEC §9.4).

export const aiPct = (c: number) => `${Math.round(c * 100)}%`;

/** One-line label, e.g. "AI SUGGESTS · QDS · 72%". */
export function aiLabel(ai: NonNullable<TrackView['ai']>, short = true): string {
  const cls = short ? CLASS_CODE[ai.suggestedClass] : CLASS_LABEL[ai.suggestedClass].toUpperCase();
  return `AI SUGGESTS · ${cls} · ${aiPct(ai.confidence)}`;
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
          AI {CLASS_CODE[ai.suggestedClass]} ·{' '}
          {ai.decision === 'ACCEPTED' ? 'ACCEPTED' : 'REJECTED'}
        </StateChip>
      </Tooltip>
    );
  }
  const btn =
    'inline-flex h-5 items-center gap-1 rounded-sm border border-line-2 px-1 text-label hover:bg-bg-3 focus-visible:outline-2 focus-visible:outline-select';
  return (
    <span className="flex items-center gap-1" data-testid="ai-chip">
      <Tooltip content={tip} align="end">
        <StateChip tone="neutral" tabIndex={0} className="font-mono tnum">
          {aiLabel(ai)}
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
        ai.decision ? 'border-line-1 text-text-3' : 'border-line-2 text-text-1',
      )}
      data-testid="ai-label"
    >
      {ai.decision
        ? `AI ${CLASS_CODE[ai.suggestedClass]} · ${ai.decision}`
        : `${aiLabel(ai)} · Y/X`}
    </div>
  );
}
