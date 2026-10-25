import type { KillChainStage, StageRate } from '@vyuh/shared';
import { STAGE_LABEL } from '@/lib/aar/answers';

// Operator home (Phase 6C): "Where am I losing points?" from the server's
// kill-chain stage rates over threat contacts in Assessment sessions.

export interface StageLoss {
  stage: KillChainStage;
  /** Share of threat contacts not done right at this stage, 0–100; null if it never applied. */
  lostPct: number | null;
  total: number;
}

export function stageLosses(stages: readonly StageRate[]): StageLoss[] {
  return stages.map((s) => ({
    stage: s.stage,
    total: s.total,
    lostPct: s.rate === null ? null : Math.round((1 - s.rate) * 100),
  }));
}

/** The stage that loses most (ties: the earlier stage), or null without data. */
export function worstStage(losses: readonly StageLoss[]): StageLoss | null {
  let worst: StageLoss | null = null;
  for (const l of losses) {
    if (l.lostPct === null) continue;
    if (!worst || l.lostPct > (worst.lostPct ?? -1)) worst = l;
  }
  return worst;
}

/** The one-line answer under the chart. */
export function lossAnswer(losses: readonly StageLoss[]): string {
  const w = worstStage(losses);
  if (!w) return 'No Assessment sessions yet: run one to see where points go.';
  if (w.lostPct === 0) return 'Every stage was done right on every threat so far.';
  return `Most points go at ${STAGE_LABEL[w.stage]}: ${w.lostPct} % of threat contacts were not done right there.`;
}
