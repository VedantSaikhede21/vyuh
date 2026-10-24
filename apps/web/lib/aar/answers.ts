import type {
  AiTrustMetrics,
  ComponentPct,
  KillChainStage,
  MistakeItem,
  StageRate,
  TrendPoint,
  UnitTraineeRow,
} from '@vyuh/shared';

// One-line answers under each trends / unit chart (DESIGN §11.7): every chart asks
// a question and the line under it answers it from the data shown. Pure, so the
// wording is unit-tested.

export const NOT_ENOUGH = 'Not enough Assessment sessions yet: complete at least two.';
/** A change smaller than this (points or percentage points) reads as "holding steady". */
const STEADY = 5;

export const STAGE_LABEL: Record<KillChainStage, string> = {
  DETECT: 'Detect',
  TRACK: 'Track',
  IDENTIFY: 'Identify',
  DECIDE: 'Decide',
  RESPOND: 'Respond',
  ASSESS: 'Assess',
};

export const COMPONENT_LABEL: Record<keyof ComponentPct, string> = {
  detection: 'Detection',
  classification: 'Classification',
  decision: 'Decision',
  report: 'Contact report',
};

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;

/** First-k and last-k means of the values present, k = min(3, n / 2). */
export function halves(
  values: (number | null)[],
): { first: number; last: number; k: number } | null {
  const xs = values.filter((v): v is number => v !== null);
  if (xs.length < 2) return null;
  const k = Math.min(3, Math.floor(xs.length / 2));
  return { first: mean(xs.slice(0, k)), last: mean(xs.slice(-k)), k };
}

const sessions = (k: number) => (k === 1 ? 'session' : `${k} sessions`);

export function scoreAnswer(points: readonly TrendPoint[]): string {
  const h = halves(points.map((p) => p.total));
  if (!h) return NOT_ENOUGH;
  const d = h.last - h.first;
  const span = `the last ${sessions(h.k)} average ${h.last.toFixed(0)}, against ${h.first.toFixed(0)} in the first ${sessions(h.k)}`;
  if (d >= STEADY) return `Yes: ${span}.`;
  if (d <= -STEADY) return `No: ${span}.`;
  return `Holding steady: ${span}.`;
}

export function latencyAnswer(points: readonly TrendPoint[]): string {
  const h = halves(points.map((p) => p.detectionLatencyS));
  if (!h) return NOT_ENOUGH;
  const d = h.first - h.last;
  const span = `${h.last.toFixed(1)} s to mark a threat in the last ${sessions(h.k)}, against ${h.first.toFixed(1)} s at first`;
  if (d >= 1 && d >= 0.15 * h.first) return `Yes: ${span}.`;
  if (-d >= 1 && -d >= 0.15 * h.first) return `No, slower: ${span}.`;
  return `About the same: ${span}.`;
}

export function accuracyAnswer(points: readonly TrendPoint[]): string {
  const h = halves(points.map((p) => p.classificationAccuracy));
  if (!h) return NOT_ENOUGH;
  const pct = (v: number) => `${Math.round(v * 100)} %`;
  const d = (h.last - h.first) * 100;
  const span = `${pct(h.last)} of tracks classified exactly in the last ${sessions(h.k)}, against ${pct(h.first)} at first`;
  if (d >= STEADY) return `Improving: ${span}.`;
  if (d <= -STEADY) return `Getting worse: ${span}.`;
  return `Holding steady: ${span}.`;
}

/** The weakest and strongest component over the last (up to) three sessions. */
export function componentAnswer(points: readonly TrendPoint[]): string {
  if (points.length === 0) return NOT_ENOUGH;
  const recent = points.slice(-3);
  const avgs = (Object.keys(COMPONENT_LABEL) as (keyof ComponentPct)[])
    .map((c) => {
      const xs = recent.map((p) => p.components[c]).filter((v): v is number => v !== null);
      return { c, v: xs.length ? mean(xs) : null };
    })
    .filter((a): a is { c: keyof ComponentPct; v: number } => a.v !== null)
    .sort((a, b) => a.v - b.v);
  const low = avgs[0];
  const high = avgs.at(-1);
  if (!low || !high) return NOT_ENOUGH;
  return `${COMPONENT_LABEL[low.c]} loses the most: ${Math.round(low.v)} % of its maximum over the last ${sessions(recent.length)}; ${COMPONENT_LABEL[high.c].toLowerCase()} is strongest at ${Math.round(high.v)} %.`;
}

export function difficultyAnswer(points: readonly TrendPoint[], rating?: number): string {
  const last = points.at(-1);
  if (!last) return 'No Assessment session yet: the recommendation follows your first score.';
  const r = last.ratingAfter ?? rating;
  return r === undefined || r === null
    ? `Difficulty ${last.recommendedDifficulty} next.`
    : `Difficulty ${last.recommendedDifficulty} next: the level closest to your rating ${r} + 50 (D1 = 950, each level + 150).`;
}

/** Elo rating over the rated sessions (SPEC §9.3). */
export function ratingAnswer(points: readonly TrendPoint[], rating: number): string {
  const rated = points.filter((p) => p.ratingAfter !== null);
  const first = rated[0];
  if (!first || first.ratingBefore === null)
    return `Rating ${rating}: no rated Assessment session yet.`;
  const d = rating - first.ratingBefore;
  const span = `${rating} now, from ${first.ratingBefore} over ${sessions(rated.length)}`;
  if (rated.length < 2) return `Rating ${span}; complete another Assessment to see a trend.`;
  if (d >= 10) return `Yes: ${span}.`;
  if (d <= -10) return `No, falling: ${span}.`;
  return `Holding steady: ${span}.`;
}

/** AI-assist over- and under-trust (SPEC §9.4): an insight, not part of the score. */
export function trustAnswer(t: AiTrustMetrics): string {
  if (t.shown === 0) return 'No AI suggestion shown yet: select a track with an AI chip in a run.';
  const parts: string[] = [];
  if (t.overTrust !== null)
    parts.push(`accepted ${t.acceptedWrong} of ${t.shownWrong} wrong suggestions`);
  if (t.underTrust !== null)
    parts.push(`rejected ${t.rejectedCorrect} of ${t.shownCorrect} correct ones`);
  const over = t.overTrust ?? 0;
  const under = t.underTrust ?? 0;
  const verdict =
    over >= 1 / 3
      ? 'Over-trusting'
      : under >= 1 / 3
        ? 'Under-trusting'
        : over === 0 && under === 0
          ? 'Calibrated'
          : 'Mostly calibrated';
  return `${verdict}: ${parts.join(', ')}. Check the camera before you accept.`;
}

export function mistakesAnswer(mistakes: readonly MistakeItem[], total: number): string {
  const top = mistakes[0];
  if (!top) return total < 2 ? NOT_ENOUGH : 'None: no mistake appears in more than one session.';
  return `Most often: ${top.text.toLowerCase()}, in ${top.sessions} of ${total} sessions.`;
}

export function weakestStageAnswer(stages: readonly StageRate[], who = 'your'): string {
  const scored = stages.filter((s) => s.rate !== null);
  if (scored.length === 0) return NOT_ENOUGH;
  const low = scored.reduce((a, b) => ((b.rate ?? 1) < (a.rate ?? 1) ? b : a));
  return `${STAGE_LABEL[low.stage]}: right ${Math.round((low.rate ?? 0) * 100)} % of the time (${low.ok} of ${low.total}) across ${who} sessions.`;
}

export function leaderboardAnswer(rows: readonly UnitTraineeRow[]): string {
  const played = rows.filter((r) => r.avgTotal !== null);
  if (played.length === 0) return 'No Assessment sessions in this unit yet.';
  const top = played[0]!;
  const falling = played.filter((r) => r.change !== null && r.change <= -STEADY);
  const idle = rows.filter((r) => r.sessions === 0);
  const parts = [`${top.name} leads with an average of ${Math.round(top.avgTotal ?? 0)}`];
  if (falling.length) parts.push(`${falling.map((r) => r.name).join(', ')} trending down`);
  if (idle.length) parts.push(`${idle.length} without a session`);
  return `${parts.join('; ')}.`;
}

export function unitComponentAnswer(c: ComponentPct): string {
  const xs = (Object.keys(COMPONENT_LABEL) as (keyof ComponentPct)[])
    .filter((k) => c[k] !== null)
    .sort((a, b) => (c[a] ?? 0) - (c[b] ?? 0));
  const low = xs[0];
  if (low === undefined) return 'No Assessment sessions in this unit yet.';
  return `${COMPONENT_LABEL[low]} is the unit's weakest component at ${Math.round(c[low] ?? 0)} % of its maximum.`;
}

export function completionAnswer(rows: readonly { assigned: number; completed: number }[]): string {
  if (rows.length === 0) return 'No assignments for this unit yet.';
  const assigned = rows.reduce((a, r) => a + r.assigned, 0);
  const done = rows.reduce((a, r) => a + r.completed, 0);
  return `${done} of ${assigned} assigned runs completed in Assessment mode.`;
}
