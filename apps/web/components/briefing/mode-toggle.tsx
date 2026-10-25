'use client';

import type { SessionMode } from '@vyuh/shared';
import { SegmentedControl } from '@/components/ui/segmented-control';

export const MODES: { value: SessionMode; label: string; hint: string }[] = [
  { value: 'PRACTICE', label: 'Practice', hint: 'Pause allowed; hints in the Comms log' },
  { value: 'ASSESSMENT', label: 'Assessment', hint: 'Fixed clock, no pause, no hints' },
];

/** Practice / Assessment, on the 6A segmented control (arrows move and select). */
export function ModeToggle({
  mode,
  onChange,
}: {
  mode: SessionMode;
  onChange: (m: SessionMode) => void;
}) {
  return (
    <SegmentedControl
      label="Session mode"
      size="hud"
      value={mode}
      onChange={onChange}
      items={MODES.map((m) => ({
        value: m.value,
        label: m.label,
        hint: m.hint,
        testId: `mode-${m.value.toLowerCase()}`,
      }))}
    />
  );
}
