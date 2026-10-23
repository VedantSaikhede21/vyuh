import { Badge } from '@/components/ui/badge';

/** Seeded demo history (SPEC §22): shown wherever demo sessions appear. */
export const DEMO_TITLE =
  'Seeded demo history (SPEC §22): simulated trainee runs, scored by the server. Not real study data.';

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
