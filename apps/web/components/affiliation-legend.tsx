import type { Affiliation } from '@vyuh/shared';
import { Badge } from '@/components/ui/badge';

// Colour is never the only cue (SPEC §15.2): each affiliation also has a letter.
const AFFILIATIONS: {
  value: Affiliation;
  letter: string;
  label: string;
  tone: 'hostile' | 'friendly' | 'neutral' | 'unknown';
}[] = [
  { value: 'HOSTILE', letter: 'H', label: 'Hostile', tone: 'hostile' },
  { value: 'FRIENDLY', letter: 'F', label: 'Friendly', tone: 'friendly' },
  { value: 'NEUTRAL', letter: 'N', label: 'Neutral', tone: 'neutral' },
  { value: 'UNKNOWN', letter: 'U', label: 'Unknown', tone: 'unknown' },
];

export function AffiliationLegend() {
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Affiliation colours (APP-6)">
      {AFFILIATIONS.map((a) => (
        <li key={a.value}>
          <Badge tone={a.tone}>
            <span aria-hidden className="font-bold">
              [{a.letter}]
            </span>
            {a.label}
          </Badge>
        </li>
      ))}
    </ul>
  );
}
