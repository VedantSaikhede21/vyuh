import type { ReadinessResponse } from '@vyuh/shared';

// Unit readiness board and live monitor wording (Phase 6C).

/** "2 trainees wait for a sign-off. 1 has an overdue assignment." */
export function readinessAnswer(d: ReadinessResponse): string {
  if (d.rows.length === 0) return 'No trainees in this unit yet.';
  const waiting = d.rows.filter((r) => r.awaitingSignoff).length;
  const review = d.rows.filter((r) => r.reviewDue).length;
  const overdue = d.rows.filter((r) => r.overdueAssignments > 0).length;
  const parts = [
    waiting
      ? `${waiting} ${waiting === 1 ? 'trainee waits' : 'trainees wait'} for a sign-off.`
      : 'Nobody waits for a sign-off.',
  ];
  if (review) parts.push(`${review} due for review.`);
  if (overdue) parts.push(`${overdue} with an overdue assignment.`);
  return parts.join(' ');
}

/** "4 s ago", "2 min ago". */
export function ago(iso: string, now: number): string {
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s} s ago` : `${Math.floor(s / 60)} min ago`;
}
