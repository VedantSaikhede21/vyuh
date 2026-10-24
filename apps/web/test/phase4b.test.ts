import type { AssignmentItem, ScenarioListItem, StageRate, TrendPoint } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import {
  NOT_ENOUGH,
  accuracyAnswer,
  completionAnswer,
  componentAnswer,
  difficultyAnswer,
  halves,
  latencyAnswer,
  leaderboardAnswer,
  mistakesAnswer,
  scoreAnswer,
  weakestStageAnswer,
} from '../lib/aar/answers';
import { assignmentBadge, assignmentFor } from '../lib/scenario/assignments';
import { NO_FILTERS, filterAndSort, readQuery, writeQuery } from '../lib/scenario/library';

const ID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function point(i: number, over: Partial<TrendPoint> = {}): TrendPoint {
  return {
    sessionId: ID(i),
    scenarioId: ID(100 + i),
    scenarioCode: `S0${i}`,
    scenarioName: 'Night Drop',
    difficulty: 3,
    endedAt: `2026-09-${String(10 + i).padStart(2, '0')}T08:00:00Z`,
    total: 50,
    components: { detection: 80, classification: 60, decision: 40, report: 20 },
    detectionLatencyS: 10,
    classificationAccuracy: 0.5,
    recommendedDifficulty: 3,
    ratingBefore: null,
    ratingAfter: null,
    overTrust: null,
    underTrust: null,
    treeVersion: 'default_v4',
    isDemo: false,
    ...over,
  };
}

describe('trend answers (DESIGN §11.7)', () => {
  it('needs two sessions', () => {
    expect(halves([1])).toBeNull();
    expect(scoreAnswer([point(1)])).toBe(NOT_ENOUGH);
    expect(latencyAnswer([])).toBe(NOT_ENOUGH);
  });

  it('compares the first and last sessions', () => {
    const rising = [40, 45, 50, 70, 80, 85].map((t, i) => point(i, { total: t }));
    expect(halves(rising.map((p) => p.total))).toEqual({
      first: 45,
      last: 78.33333333333333,
      k: 3,
    });
    expect(scoreAnswer(rising)).toBe(
      'Yes: the last 3 sessions average 78, against 45 in the first 3 sessions.',
    );
    const flat = [60, 62].map((t, i) => point(i, { total: t }));
    expect(scoreAnswer(flat)).toMatch(/^Holding steady: the last session average 62/);
    const falling = [80, 50].map((t, i) => point(i, { total: t }));
    expect(scoreAnswer(falling)).toMatch(/^No:/);
  });

  it('reads latency down as faster and ignores sessions without one', () => {
    const pts = [20, null, 18, 6, 5].map((v, i) => point(i, { detectionLatencyS: v }));
    expect(latencyAnswer(pts)).toBe(
      'Yes: 5.5 s to mark a threat in the last 2 sessions, against 19.0 s at first.',
    );
  });

  it('accuracy, components and difficulty', () => {
    const pts = [0.4, 0.5, 0.9, 0.95].map((v, i) => point(i, { classificationAccuracy: v }));
    expect(accuracyAnswer(pts)).toMatch(/^Improving: 93 % of tracks classified exactly/);
    expect(componentAnswer(pts)).toBe(
      'Contact report loses the most: 20 % of its maximum over the last 3 sessions; detection is strongest at 80 %.',
    );
    const v1 = point(1, {
      components: { detection: 90, classification: 50, decision: 70, report: null },
    });
    expect(componentAnswer([v1])).toMatch(/^Classification loses the most/);
    expect(
      difficultyAnswer([point(1, { total: 84, recommendedDifficulty: 4, ratingAfter: 1320 })]),
    ).toBe(
      'Difficulty 4 next: the level closest to your rating 1320 + 50 (D1 = 950, each level + 150).',
    );
  });

  it('mistakes, stages, leaderboard and completion', () => {
    const m = [
      {
        code: 'REPORT_NONE',
        text: 'No contact report sent for a threat',
        count: 9,
        sessions: 4,
        trainees: 1,
      },
    ];
    expect(mistakesAnswer(m, 7)).toBe(
      'Most often: no contact report sent for a threat, in 4 of 7 sessions.',
    );
    expect(mistakesAnswer([], 7)).toMatch(/^None/);
    const stages: StageRate[] = [
      { stage: 'DETECT', ok: 9, total: 10, rate: 0.9 },
      { stage: 'IDENTIFY', ok: 3, total: 10, rate: 0.3 },
      { stage: 'ASSESS', ok: 0, total: 0, rate: null },
    ];
    expect(weakestStageAnswer(stages)).toBe(
      'Identify: right 30 % of the time (3 of 10) across your sessions.',
    );
    const row = {
      sessions: 3,
      lastTotal: 70,
      bestTotal: 80,
      detectionLatencyS: 5,
      classificationAccuracy: 0.8,
      weakestStage: null,
    };
    expect(
      leaderboardAnswer([
        { ...row, userId: ID(1), name: 'Trainee 1', avgTotal: 75, change: 12 },
        { ...row, userId: ID(2), name: 'Trainee 2', avgTotal: 50, change: -8 },
        { ...row, userId: ID(3), name: 'Trainee 3', avgTotal: null, change: null, sessions: 0 },
      ]),
    ).toBe('Trainee 1 leads with an average of 75; Trainee 2 trending down; 1 without a session.');
    expect(
      completionAnswer([
        { assigned: 3, completed: 2 },
        { assigned: 1, completed: 0 },
      ]),
    ).toBe('2 of 4 assigned runs completed in Assessment mode.');
  });
});

function assignment(over: Partial<AssignmentItem>): AssignmentItem {
  return {
    id: ID(1),
    scenarioId: ID(50),
    scenarioCode: 'S05',
    scenarioName: 'Silent Approach',
    unitId: ID(9),
    unitName: 'Demo Unit Alpha',
    userId: null,
    userName: null,
    assignedByName: 'Demo Instructor',
    dueAt: '2026-10-30T12:30:00Z',
    createdAt: '2026-10-01T12:30:00Z',
    completed: false,
    completedSessionId: null,
    ...over,
  };
}

describe('assignment badges', () => {
  const now = new Date('2026-10-23T00:00:00Z');
  it('picks the open assignment due soonest, else a completed one', () => {
    const items = [
      assignment({ id: ID(1), dueAt: '2026-11-30T00:00:00Z' }),
      assignment({ id: ID(2), dueAt: '2026-10-25T00:00:00Z' }),
      assignment({ id: ID(3), completed: true }),
      assignment({ id: ID(4), scenarioId: ID(51) }),
    ];
    expect(assignmentFor(ID(50), items)?.id).toBe(ID(2));
    expect(assignmentFor(ID(50), [items[2]!])?.id).toBe(ID(3));
    expect(assignmentFor(ID(52), items)).toBeNull();
  });

  it('labels due, overdue, open and done', () => {
    expect(assignmentBadge(assignment({}), now)).toMatchObject({
      state: 'DUE',
      label: 'Due 10-30',
    });
    expect(assignmentBadge(assignment({ dueAt: '2026-10-01T00:00:00Z' }), now).state).toBe(
      'OVERDUE',
    );
    expect(assignmentBadge(assignment({ dueAt: null }), now)).toMatchObject({
      state: 'OPEN',
      label: 'Assigned',
    });
    const done = assignmentBadge(assignment({ completed: true }), now);
    expect(done.state).toBe('DONE');
    expect(done.title).toContain('Assessment');
  });

  it('the Assigned filter round-trips the URL and filters rows', () => {
    const q = writeQuery({ ...NO_FILTERS, assigned: true }, 'difficulty');
    expect(q).toBe('?assigned=1');
    expect(readQuery(new URLSearchParams(q)).filters.assigned).toBe(true);
    const rows = [{ id: ID(50) }, { id: ID(51) }] as ScenarioListItem[];
    const picked = filterAndSort(
      rows.map(
        (r, i) =>
          ({ ...r, difficulty: 1, code: `S0${i}`, name: 'x', tags: [] }) as ScenarioListItem,
      ),
      { ...NO_FILTERS, assigned: true },
      'difficulty',
      () => 'Day',
      (s) => s.id === ID(51),
    );
    expect(picked.map((r) => r.id)).toEqual([ID(51)]);
  });
});
