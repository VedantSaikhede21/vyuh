import type { CriterionStatus, LevelStatus, TrainingLevel } from '@vyuh/shared';
import { formatCount } from '@/lib/strings';

// Service record wording (SPEC §9.7). The server decides every state; these only
// turn its figures into text.

export const LEVEL_NUMBER: Record<TrainingLevel, string> = {
  BASIC_OPERATOR: '01',
  SENSOR_OPERATOR: '02',
  ENGAGEMENT_CONTROLLER: '03',
  INSTRUCTOR: '04',
};

const UNIT: Record<CriterionStatus['unit'], string> = { COUNT: '', PCT: '%', S: 's', RATING: '' };

function number(v: number, unit: CriterionStatus['unit']): string {
  const n = unit === 'S' ? v.toFixed(1) : formatCount(Math.round(v));
  return UNIT[unit] ? `${n} ${UNIT[unit]}` : n;
}

/** The current figure: "73 %", "12.4 s", "3", or "—" before any session counts. */
export function criterionValue(c: CriterionStatus): string {
  return c.value === null ? '—' : number(c.value, c.unit);
}

/** The target: "≥ 70 %", "≤ 15.0 s"; a count that must be zero reads "None". */
export function criterionTarget(c: CriterionStatus): string {
  if (c.comparison === 'AT_MOST' && c.unit === 'COUNT' && c.target === 0) return 'None';
  return `${c.comparison === 'AT_LEAST' ? '≥' : '≤'} ${number(c.target, c.unit)}`;
}

/** The one line under a level's name, or null when the chip says it all. */
export function levelNote(level: LevelStatus): string | null {
  if (level.state === 'QUALIFIED') {
    return level.reviewDue ? 'Review due: current figures no longer meet the criteria.' : null;
  }
  if (level.state === 'LOCKED') return 'Qualify the level below first.';
  if (level.criteriaMet) return 'Criteria met · awaiting sign-off';
  const left = level.criteria.filter((c) => !c.met).length;
  return `${left} of ${level.criteria.length} criteria still to meet`;
}

/** Who signs a level off, in words. */
export const signoffByText = (by: LevelStatus['signoffBy']): string =>
  by === 'ADMIN' ? 'Signed off by an admin' : 'Signed off by an instructor or admin';

/** Highest qualified level, or null. */
export function highestQualified(levels: readonly LevelStatus[]): LevelStatus | null {
  return [...levels].reverse().find((l) => l.state === 'QUALIFIED') ?? null;
}
