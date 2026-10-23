import type { AssignmentItem } from '@vyuh/shared';

// Assignment badges on the training list (Phase 4b, decision 120).

export type AssignmentState = 'DONE' | 'OVERDUE' | 'DUE' | 'OPEN';

export interface AssignmentBadge {
  state: AssignmentState;
  /** ISO date (YYYY-MM-DD) of the due date, if any. */
  due: string | null;
  label: string;
  title: string;
}

/**
 * The assignment that matters for one scenario: the open one due soonest, else
 * the latest completed one. Null when the scenario is not assigned.
 */
export function assignmentFor(
  scenarioId: string,
  items: readonly AssignmentItem[],
): AssignmentItem | null {
  const mine = items.filter((a) => a.scenarioId === scenarioId);
  const open = mine
    .filter((a) => !a.completed)
    .sort((a, b) => (a.dueAt ?? '9999').localeCompare(b.dueAt ?? '9999'));
  return open[0] ?? mine.find((a) => a.completed) ?? null;
}

export function assignmentBadge(a: AssignmentItem, now: Date = new Date()): AssignmentBadge {
  const due = a.dueAt ? a.dueAt.slice(0, 10) : null;
  const by = a.assignedByName ? ` by ${a.assignedByName}` : '';
  const target = a.unitName ? ` to ${a.unitName}` : '';
  if (a.completed) {
    return {
      state: 'DONE',
      due,
      label: 'Done',
      title: `Assigned${by}${target}; completed in Assessment mode.`,
    };
  }
  const overdue = a.dueAt !== null && new Date(a.dueAt).getTime() < now.getTime();
  return {
    state: overdue ? 'OVERDUE' : due ? 'DUE' : 'OPEN',
    due,
    // Short so the 32 px row fits 1366 px; the full date is in the tooltip.
    label: due ? `${overdue ? 'Overdue' : 'Due'} ${due.slice(5)}` : 'Assigned',
    title: `Assigned${by}${target}. Complete it in Assessment mode${due ? ` by ${due}` : ''}.`,
  };
}
