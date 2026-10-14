import type { Affiliation } from '@vyuh/shared';

// APP-6 affiliation colours (must match --hostile etc. in globals.css) plus a
// letter, so colour is never the only cue (SPEC §15.2).
export const AFFILIATION_STYLE: Record<
  Affiliation,
  { hex: string; letter: string; label: string }
> = {
  HOSTILE: { hex: '#ff5050', letter: 'H', label: 'Hostile' },
  FRIENDLY: { hex: '#4fb3ff', letter: 'F', label: 'Friendly' },
  NEUTRAL: { hex: '#4be37a', letter: 'N', label: 'Neutral' },
  UNKNOWN: { hex: '#ffe14a', letter: 'U', label: 'Unknown' },
};
