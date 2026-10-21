import type { ContactKillChain, Penalty } from '@vyuh/shared';

// Row order for the kill-chain breakdown: threats first, then non-threats with
// a mistake or a deduction; non-threats handled correctly fold into one row.

export function sortedRows(rows: readonly ContactKillChain[]): ContactKillChain[] {
  return [...rows].sort(
    (a, b) => Number(b.isThreat) - Number(a.isThreat) || a.contactId.localeCompare(b.contactId),
  );
}

export interface KillChainGroups {
  /** Threats, then non-threats with a mistake or a deduction. */
  listed: ContactKillChain[];
  /** Non-threats correctly left alone: every stage OK or not applicable, no deduction. */
  cleared: ContactKillChain[];
}

export function groupRows(
  rows: readonly ContactKillChain[],
  penalties: readonly Penalty[] = [],
): KillChainGroups {
  const penalised = new Set(penalties.filter((p) => p.points < 0).map((p) => p.contactId));
  const listed: ContactKillChain[] = [];
  const cleared: ContactKillChain[] = [];
  for (const row of sortedRows(rows)) {
    const clean =
      !row.isThreat &&
      !penalised.has(row.contactId) &&
      row.stages.every((s) => s.status === 'OK' || s.status === 'NOT_APPLICABLE');
    (clean ? cleared : listed).push(row);
  }
  return { listed, cleared };
}

export function clearedLabel(n: number): string {
  return `${n} non-threat${n === 1 ? '' : 's'} correctly left alone`;
}
