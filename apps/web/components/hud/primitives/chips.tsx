import { Badge } from '@/components/ui/badge';
import { StateChip } from './state-chip';

export type QualificationState = 'QUALIFIED' | 'IN_PROGRESS' | 'LOCKED';

const QUAL: Record<QualificationState, { tone: 'ok' | 'warn' | 'muted'; label: string }> = {
  QUALIFIED: { tone: 'ok', label: 'Qualified' },
  IN_PROGRESS: { tone: 'warn', label: 'In progress' },
  LOCKED: { tone: 'muted', label: 'Locked' },
};

/**
 * Training-level state (DESIGN §3.4, Phase 6 amendment 4): QUALIFIED --ok,
 * IN PROGRESS --warn, LOCKED --text-2 — always with the word.
 */
export function QualificationChip({
  state,
  className,
}: {
  state: QualificationState;
  className?: string;
}) {
  const q = QUAL[state];
  return (
    <StateChip tone={q.tone} className={className} data-testid="qualification-chip">
      {q.label}
    </StateChip>
  );
}

/** Seeded demo history (SPEC §22): shown wherever demo sessions appear. */
export const DEMO_TITLE =
  'Demo history: simulated trainee runs, scored by the server. Not real training data.';

/** Amber outline DEMO DATA chip on anything fed by `is_demo` rows (UI-PREP §3). */
export function DemoBadge({
  className,
  label = 'Demo data',
}: {
  className?: string;
  label?: string;
}) {
  return (
    <Badge tone="warn" title={DEMO_TITLE} className={className} data-testid="demo-badge">
      {label}
    </Badge>
  );
}
