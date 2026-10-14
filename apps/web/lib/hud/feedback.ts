import type { ContactClass, ContactOutcome } from '@vyuh/shared';
import { CLASS_LABEL, RESULT_LABEL } from '@/lib/strings';

// Scoring feedback comes from the tree JSON, which is immutable once a tree has
// scored sessions, and embeds raw enum values (decision 65). These map them to
// the words the HUD uses.

const CLASS_TOKENS = Object.keys(CLASS_LABEL).sort((a, b) => b.length - a.length);
const RESULT_TOKENS = Object.keys(RESULT_LABEL).sort((a, b) => b.length - a.length);

/** "Small quadcopter" → "small quadcopter", but "FPV drone" keeps its acronym. */
function inSentence(label: string): string {
  return /^[A-Z]{2}/.test(label) ? label : label.charAt(0).toLowerCase() + label.slice(1);
}

/** Replace enum tokens in a feedback line with plain words. */
export function humaniseFeedback(text: string): string {
  let out = text;
  for (const t of CLASS_TOKENS) {
    out = out.replace(new RegExp(`\\b${t}\\b`, 'g'), inSentence(CLASS_LABEL[t as ContactClass]));
  }
  for (const t of RESULT_TOKENS) {
    out = out.replace(new RegExp(`\\b${t}\\b`, 'g'), RESULT_LABEL[t]!);
  }
  // Anything else still in UPPER_SNAKE_CASE (two or more words): lower case, spaces.
  return out.replace(/\b[A-Z]+(?:_[A-Z0-9]+)+\b/g, (m) => m.toLowerCase().replace(/_/g, ' '));
}

export const OUTCOME_LABEL: Record<ContactOutcome, string> = {
  NEUTRALISED: 'Neutralised',
  LEAKED: 'Reached the asset',
  UNRESOLVED: 'Not resolved',
  IGNORED_OK: 'Correctly left alone',
  WRONGLY_ENGAGED: 'Engaged a non-threat',
  FRATRICIDE: 'Fired on a friendly',
  FRIENDLY_JAMMED: 'Friendly jammed',
  CIVILIAN_JAMMED: 'Civilian jammed',
};

/** Outcome status tone: colour only for outcome status (DESIGN §3.4). */
export const OUTCOME_TONE: Record<ContactOutcome, 'ok' | 'warn' | 'crit'> = {
  NEUTRALISED: 'ok',
  IGNORED_OK: 'ok',
  UNRESOLVED: 'warn',
  CIVILIAN_JAMMED: 'warn',
  LEAKED: 'crit',
  WRONGLY_ENGAGED: 'crit',
  FRATRICIDE: 'crit',
  FRIENDLY_JAMMED: 'crit',
};
