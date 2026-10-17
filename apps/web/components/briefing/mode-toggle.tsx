'use client';

import type { SessionMode } from '@vyuh/shared';
import { Tooltip } from '@/components/hud/primitives';
import { cn } from '@/lib/utils';

export const MODES: { value: SessionMode; label: string; hint: string }[] = [
  { value: 'PRACTICE', label: 'Practice', hint: 'Pause allowed; hints in the Comms log' },
  { value: 'ASSESSMENT', label: 'Assessment', hint: 'Fixed clock, no pause, no hints' },
];

/** Practice / Assessment segmented control. */
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: SessionMode;
  onChange: (m: SessionMode) => void;
}) {
  return (
    <div className="flex" role="radiogroup" aria-label="Session mode">
      {MODES.map((m) => (
        <Tooltip key={m.value} content={m.hint} side="bottom" align="end">
          <button
            type="button"
            role="radio"
            aria-checked={mode === m.value}
            data-testid={`mode-${m.value.toLowerCase()}`}
            onClick={() => onChange(m.value)}
            className={cn(
              'h-7 border px-3 text-label transition-colors duration-150 ease-ui first:rounded-l-sm last:rounded-r-sm',
              mode === m.value
                ? 'border-select bg-bg-3 text-text-1'
                : 'border-line-2 hover:text-text-1',
            )}
          >
            {m.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
