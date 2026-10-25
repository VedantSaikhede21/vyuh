import type { ScoringSummaryResponse } from '@vyuh/shared';

// Help & controls (Phase 6C): glossary and "How scoring works". The glossary
// mirrors SPEC §21 (test/phase6c.test.ts fails if they drift); the scoring
// numbers come from GET /scoring/summary, so they always match the tree.

export const GLOSSARY: readonly { term: string; meaning: string }[] = [
  { term: 'AAR', meaning: 'After-Action Review — structured review of what happened and why' },
  { term: 'AGL', meaning: 'Above Ground Level (altitude relative to terrain under the drone)' },
  {
    term: 'APP-6',
    meaning: 'NATO standard military map symbology; we borrow its affiliation colours/shapes',
  },
  { term: 'C-UAS', meaning: 'Counter-Unmanned Aircraft Systems' },
  {
    term: 'DEM',
    meaning: 'Digital Elevation Model — grid of terrain heights (SRTM, Copernicus)',
  },
  { term: 'ENU', meaning: 'East-North-Up local coordinate frame in metres' },
  { term: 'EO/IR', meaning: 'Electro-Optical (visible) / Infra-Red (thermal) camera' },
  { term: 'EW', meaning: 'Electronic Warfare — here: jamming and spoofing' },
  {
    term: 'FPV',
    meaning: 'First-Person-View drone, fast and agile, often used for attack runs',
  },
  { term: 'IFOV', meaning: 'Instantaneous Field of View — angle covered by one camera pixel' },
  {
    term: 'Johnson criteria',
    meaning:
      'Rule of thumb for how many pixels are needed to detect / recognise / identify an object',
  },
  { term: 'Kill chain', meaning: 'Detect → Track → Identify → Decide → Respond → Assess' },
  { term: 'LOS', meaning: "Line of Sight — whether terrain/buildings block a sensor's view" },
  {
    term: 'Micro-Doppler',
    meaning: 'Small Doppler shifts from rotating blades/flapping wings; shown as a spectrogram',
  },
  { term: 'Pd', meaning: 'Probability of detection per radar scan' },
  { term: 'PPI', meaning: 'Plan Position Indicator — the circular top-down radar scope' },
  { term: 'RCS', meaning: 'Radar Cross Section — how "big" an object looks to radar (m²)' },
  { term: 'ROE', meaning: 'Rules of Engagement — when and how force may be used' },
  { term: 'RTH', meaning: 'Return To Home — typical drone behaviour on link loss' },
];

export const COMPONENT_LABEL: Record<
  'detection' | 'classification' | 'decision' | 'report' | 'efficiency',
  string
> = {
  detection: 'Detection',
  classification: 'Classification',
  decision: 'Decision',
  report: 'Contact report',
  efficiency: 'Efficiency',
};

/** Plain words for the scoring-tree leaves shown in Help, in display order. */
const LEAF_WORDS: Record<string, string> = {
  LATENCY_UNDER_5S: 'Track marked detected within {0} s of first being on the sensors',
  LATENCY_5_TO_15S: 'Marked detected within {1} s',
  LATENCY_15_TO_30S: 'Marked detected within {2} s',
  LATENCY_OVER_30S: 'Marked detected later than {2} s',
  MISSED: 'Threat never marked detected',
  CLASS_EXACT: 'Threat classified as the exact class',
  CLASS_CATEGORY: 'Right category (threat drone), wrong class',
  CLASS_WRONG: 'Wrong class, or not classified',
  DECISION_NEUTRALISED: 'Threat neutralised before it reached the asset',
  DECISION_NEUTRALISED_AFTER_DROP: 'Neutralised, but only after it dropped its payload',
  DECISION_ENGAGED_NOT_NEUTRALISED: 'Engaged but not neutralised',
  DECISION_INEFFECTIVE_EW: 'EW ordered against a link it cannot affect',
  DECISION_NONE: 'No response against the threat',
  REPORT_SCORED:
    'Best contact report on the threat: timeliness, count, class, location, heading, altitude and activity',
  REPORT_NONE: 'No contact report on the threat',
  FRATRICIDE: 'Interceptor fired at a friendly',
  WRONGLY_ENGAGED: 'Non-threat engaged (bird, civilian, helicopter)',
  FRIENDLY_JAMMED: 'Friendly drone caught in a jam',
  ROE_VIOLATION_ATTEMPT: 'Intercept attempted against the ROE',
  NO_KINETIC_VIOLATION_ATTEMPT: 'Intercept attempted over a no-kinetic zone',
  CIVILIAN_JAMMED: 'Civilian drone caught in a jam sector',
  NON_THREAT_IDENTIFIED: 'Non-threat correctly classified',
};

export interface ScoringRow {
  code: string;
  text: string;
  /** "25", "−40", "+5". */
  points: string;
}

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');

/** Per-threat component rows and session adjustments, worded, from the summary. */
export function scoringRows(s: ScoringSummaryResponse): {
  components: ScoringRow[];
  adjustments: ScoringRow[];
} {
  const words = (code: string) =>
    (LEAF_WORDS[code] ?? code).replace(/\{(\d)\}/g, (_, i: string) =>
      String(s.detectionBandsS[Number(i)] ?? ''),
    );
  const order = Object.keys(LEAF_WORDS);
  const known = s.leaves
    .filter((l) => l.code in LEAF_WORDS)
    .sort((a, b) => order.indexOf(a.code) - order.indexOf(b.code));
  return {
    components: known
      .filter((l) => l.component !== null && l.points !== null)
      .map((l) => ({ code: l.code, text: words(l.code), points: String(l.points) })),
    adjustments: known
      .filter((l) => l.adjust !== null)
      .map((l) => ({ code: l.code, text: words(l.code), points: signed(l.adjust ?? 0) })),
  };
}
