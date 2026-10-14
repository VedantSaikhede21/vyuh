import type { Affiliation } from '@vyuh/shared';
import { AffiliationSymbol } from '@/components/hud/affiliation-symbol';
import { AFFILIATION_STYLE } from '@/lib/affiliation';

// Colour is never the only cue (SPEC §15.2): each affiliation has an APP-6 frame and a letter.
const AFFILIATIONS: Affiliation[] = ['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN'];

export function AffiliationLegend() {
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 text-xs" aria-label="Affiliation symbols (APP-6)">
      {AFFILIATIONS.map((a) => (
        <li key={a} className="flex items-center gap-1" style={{ color: AFFILIATION_STYLE[a].hex }}>
          <AffiliationSymbol affiliation={a} size={16} />
          {AFFILIATION_STYLE[a].label}
        </li>
      ))}
    </ul>
  );
}
