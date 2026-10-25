import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  CLASS_PROFILES,
  ContactClass,
  type CriterionStatus,
  type LevelStatus,
  type ScoringSummaryResponse,
  type StageRate,
} from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { GLOSSARY, scoringRows } from '@/lib/help';
import { lossAnswer, stageLosses, worstStage } from '@/lib/home';
import { LIBRARY, filterLibrary, formatRcs, isContactClass, libraryEntry } from '@/lib/library';
import { homeHref, navFor } from '@/lib/nav';
import { unreadLabel } from '@/lib/notices';
import { criterionTarget, criterionValue, highestQualified, levelNote } from '@/lib/record';
import { DEFAULT_SETTINGS, parseSettings } from '@/lib/settings';
import { formatDate, formatDateTime } from '@/lib/strings';

const SPEC = readFileSync(join(__dirname, '../../../docs/SPEC.md'), 'utf8');

describe('threat library', () => {
  it('has one entry per contact class with the CLASS_PROFILES numbers', () => {
    expect(LIBRARY.map((e) => e.cls).sort()).toEqual([...ContactClass.options].sort());
    for (const e of LIBRARY) {
      const p = CLASS_PROFILES[e.cls];
      expect([e.sizeM, e.rcsM2, e.maxSpeedMps]).toEqual([p.sizeM, p.rcsM2, p.maxSpeedMps]);
      expect(e.cues.length).toBeGreaterThanOrEqual(2);
      expect(e.confusedWith.length).toBeGreaterThan(0);
      for (const c of e.confusedWith) expect(libraryEntry(c).cls).toBe(c);
    }
  });

  it('filters by group and keeps threats in the threat group', () => {
    expect(filterLibrary('ALL')).toHaveLength(10);
    expect(filterLibrary('THREAT').every((e) => e.isThreat)).toBe(true);
    expect(filterLibrary('FRIENDLY').map((e) => e.cls)).toEqual([
      'FRIENDLY_QUAD',
      'HELICOPTER_FRIENDLY',
    ]);
    expect(filterLibrary('NON_THREAT').some((e) => e.isThreat)).toBe(false);
  });

  it('formats RCS and recognises class codes', () => {
    expect(['0.005', '0.02', '5'].join()).toBe([0.005, 0.02, 5].map(formatRcs).join());
    expect(isContactClass('QUAD_SMALL')).toBe(true);
    expect(isContactClass('quad_small')).toBe(false);
  });
});

describe('help', () => {
  it('glossary matches SPEC §21 term for term', () => {
    const section = SPEC.slice(SPEC.indexOf('## §21. Glossary'), SPEC.indexOf('## §22.'));
    const rows = section
      .split('\n')
      .filter((l) => /^\| [^-|]/.test(l) && !l.startsWith('| Term'))
      .map((l) => l.split('|').map((c) => c.trim()));
    expect(GLOSSARY.map((g) => [g.term, g.meaning])).toEqual(rows.map((r) => [r[1], r[2]]));
  });

  it('words the scoring summary with its own numbers', () => {
    const s: ScoringSummaryResponse = {
      current: 'default_v4',
      componentMax: { detection: 25, classification: 25, decision: 30, report: 10, efficiency: 0 },
      detectionBandsS: [5, 15, 30],
      leaves: [
        { code: 'LATENCY_5_TO_15S', component: 'detection', points: 18, adjust: null },
        { code: 'LATENCY_UNDER_5S', component: 'detection', points: 25, adjust: null },
        { code: 'FRATRICIDE', component: null, points: null, adjust: -40 },
        { code: 'NON_THREAT_IDENTIFIED', component: null, points: null, adjust: 5 },
        { code: 'NOT_DETECTABLE', component: null, points: null, adjust: null },
      ],
    };
    const r = scoringRows(s);
    expect(r.components.map((x) => [x.code, x.points])).toEqual([
      ['LATENCY_UNDER_5S', '25'],
      ['LATENCY_5_TO_15S', '18'],
    ]);
    expect(r.components[0]!.text).toContain('within 5 s');
    expect(r.components[1]!.text).toContain('within 15 s');
    expect(r.adjustments.map((x) => x.points)).toEqual(['−40', '+5']);
  });
});

describe('shell, settings, notices', () => {
  it('trainees see Home and Service record; staff land on the unit', () => {
    expect(navFor('TRAINEE').map((n) => n.id)).toEqual([
      'home',
      'training',
      'library',
      'aar',
      'record',
    ]);
    expect(navFor('INSTRUCTOR').map((n) => n.id)).toEqual([
      'training',
      'library',
      'aar',
      'unit',
      'builder',
    ]);
    expect(homeHref('TRAINEE')).toBe('/home');
    expect(homeHref('ADMIN')).toBe('/instructor');
  });

  it('settings parse defensively', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{not json')).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('{"motion":"REDUCE","shortcutsOnStart":true}')).toEqual({
      motion: 'REDUCE',
      shortcutsOnStart: true,
    });
    expect(parseSettings('{"motion":"FAST","shortcutsOnStart":"yes"}')).toEqual(DEFAULT_SETTINGS);
  });

  it('caps the unread label and formats dates as ISO local', () => {
    expect([unreadLabel(0), unreadLabel(99), unreadLabel(100)]).toEqual(['0', '99', '99+']);
    const iso = new Date(2026, 9, 5, 7, 3).toISOString();
    expect(formatDateTime(iso)).toBe('2026-10-05 07:03');
    expect(formatDate(iso)).toBe('2026-10-05');
    expect(formatDateTime('nope')).toBe('nope');
  });
});

describe('service record wording', () => {
  const crit = (over: Partial<CriterionStatus>): CriterionStatus => ({
    id: 'x',
    label: 'x',
    value: 73,
    target: 70,
    unit: 'PCT',
    comparison: 'AT_LEAST',
    met: true,
    ...over,
  });
  const level = (over: Partial<LevelStatus>): LevelStatus => ({
    level: 'SENSOR_OPERATOR',
    name: 'Sensor operator',
    state: 'IN_PROGRESS',
    criteriaMet: false,
    reviewDue: false,
    signoffBy: 'STAFF',
    signoff: null,
    criteria: [crit({}), crit({ met: false })],
    ...over,
  });

  it('formats figures and targets by unit', () => {
    expect(criterionValue(crit({}))).toBe('73 %');
    expect(criterionValue(crit({ value: null }))).toBe('—');
    expect(criterionValue(crit({ value: 12.44, unit: 'S' }))).toBe('12.4 s');
    expect(criterionTarget(crit({ target: 15, unit: 'S', comparison: 'AT_MOST' }))).toBe(
      '≤ 15.0 s',
    );
    expect(criterionTarget(crit({}))).toBe('≥ 70 %');
    expect(criterionTarget(crit({ unit: 'COUNT', target: 0, comparison: 'AT_MOST' }))).toBe('None');
  });

  it('words each level state, review due and awaiting sign-off', () => {
    expect(levelNote(level({}))).toBe('1 of 2 criteria still to meet');
    expect(levelNote(level({ criteriaMet: true }))).toBe('Criteria met · awaiting sign-off');
    expect(levelNote(level({ state: 'LOCKED' }))).toBe('Qualify the level below first.');
    expect(levelNote(level({ state: 'QUALIFIED', criteriaMet: true }))).toBeNull();
    expect(levelNote(level({ state: 'QUALIFIED', reviewDue: true }))).toMatch(/^Review due/);
    const levels = [
      level({ level: 'BASIC_OPERATOR', state: 'QUALIFIED' }),
      level({}),
      level({ state: 'LOCKED' }),
    ];
    expect(highestQualified(levels)?.level).toBe('BASIC_OPERATOR');
    expect(highestQualified([level({})])).toBeNull();
  });
});

describe('home: where am I losing points', () => {
  const rate = (stage: StageRate['stage'], ok: number, total: number): StageRate => ({
    stage,
    ok,
    total,
    rate: total ? ok / total : null,
  });

  it('turns stage rates into losses and names the worst stage', () => {
    const losses = stageLosses([
      rate('DETECT', 9, 10),
      rate('TRACK', 10, 10),
      rate('RESPOND', 5, 10),
      rate('ASSESS', 0, 0),
    ]);
    expect(losses.map((l) => l.lostPct)).toEqual([10, 0, 50, null]);
    expect(worstStage(losses)?.stage).toBe('RESPOND');
    expect(lossAnswer(losses)).toBe(
      'Most points go at Respond: 50 % of threat contacts were not done right there.',
    );
    expect(lossAnswer(stageLosses([rate('DETECT', 0, 0)]))).toMatch(/^No Assessment sessions/);
    expect(lossAnswer(stageLosses([rate('DETECT', 4, 4)]))).toMatch(/^Every stage/);
  });
});
