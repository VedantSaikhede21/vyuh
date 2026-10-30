import type { StudyRow } from '@vyuh/shared';

/** Mean total over each participant's first and last run, whole points. */
export function firstLastMean(rows: readonly StudyRow[]): { first: number; last: number } | null {
  const byParticipant = new Map<string, StudyRow[]>();
  for (const r of rows) {
    byParticipant.set(r.participant, [...(byParticipant.get(r.participant) ?? []), r]);
  }
  const repeated = [...byParticipant.values()].filter((runs) => runs.length >= 2);
  if (repeated.length === 0) return null;
  const mean = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) / values.length);
  return {
    first: mean(repeated.map((runs) => runs[0]!.total)),
    last: mean(repeated.map((runs) => runs[runs.length - 1]!.total)),
  };
}
