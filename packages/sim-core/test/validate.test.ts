import type { ContactSpec, Scenario } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { validateScenario, type ValidationCheckName } from '../src/index.ts';
import { loadScripted } from './fixture-logs.ts';
import { presetWorld } from './fixtures.ts';

// Playability validator (decision 75): every scripted scenario passes, and each
// deliberately broken scenario fails exactly the one check it targets.

const failed = (s: unknown): ValidationCheckName[] =>
  validateScenario(s, presetWorld('PROCEDURAL_HILLS'))
    .checks.filter((c) => !c.ok)
    .map((c) => c.name);

describe.each(['S01', 'S02', 'S03', 'S11', 'S12', 'S13', 'S14'])('scripted %s', (id) => {
  it('passes every check', () => {
    const s = loadScripted(id);
    const r = validateScenario(s, presetWorld(s.terrain.preset));
    expect(r.checks.filter((c) => !c.ok)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.warnings.every((w) => w.firstTrackTMs !== null)).toBe(true);
  });
});

const s01 = (): Scenario => structuredClone(loadScripted('S01'));

function bird(id: string, x: number, z: number, y = 60): ContactSpec {
  return {
    id,
    class: 'BIRD_LARGE',
    isThreat: false,
    affiliation: 'NEUTRAL',
    controlLink: 'NONE',
    behaviour: 'BIRD_FLOCK',
    spawnTMs: 0,
    path: [
      { x, y, z, speedMps: 10 },
      { x: x - 2000, y: 60, z, speedMps: 10 },
    ],
    emissions: { rfActive: false },
  };
}

describe('each criterion fails alone', () => {
  const cases: [ValidationCheckName, () => unknown][] = [
    [
      'SCHEMA',
      () => {
        const s: Partial<Scenario> = s01();
        delete s.contacts;
        return s;
      },
    ],
    ['HAS_THREAT', () => ({ ...s01(), contacts: [bird('c01', 0, 3000)] })],
    [
      'BOUNDS',
      () => {
        const s = s01();
        s.contacts.push({
          ...bird('c09', 3000, -3000),
          path: [{ x: 5900, y: 60, z: -3000, speedMps: 10 }],
        });
        return s;
      },
    ],
    [
      'MIN_AGL',
      () => {
        const s = s01();
        s.contacts.push(bird('c09', 3000, -3000, 3));
        return s;
      },
    ],
    [
      'SPAWN_DISTANCE',
      () => {
        const s = s01();
        s.contacts.push({
          ...bird('c09', 300, -100),
          path: [
            { x: 300, y: 60, z: -100, speedMps: 10 },
            { x: 3000, y: 60, z: -3000, speedMps: 10 },
          ],
        });
        return s;
      },
    ],
    [
      'NIGHT_FLAG',
      () => {
        const s = s01();
        s.environment.isNight = !s.environment.isNight;
        return s;
      },
    ],
    [
      'DETECTABLE',
      () => {
        const s = s01();
        s.difficulty = 4; // no defender check above D3
        s.sensors = s.sensors.map((x) => (x.kind === 'RADAR' ? { ...x, refRangeM: 1 } : x));
        return s;
      },
    ],
    [
      'WARNING_TIME',
      () => ({ ...structuredClone(loadScripted('S03')), difficulty: 1 }), // 58.5 s < 60 s
    ],
    ['DEFENDER_WINS', () => ({ ...s01(), effectors: [] })],
  ];

  it.each(cases)('%s', (name, make) => {
    expect(failed(make())).toEqual([name]);
  });
});

describe('result details', () => {
  it('reports per-threat warning and defender leaks', () => {
    const r = validateScenario({ ...s01(), effectors: [] }, presetWorld('PROCEDURAL_HILLS'));
    expect(r.defenderLeaks).toEqual(['c01']);
    const w = r.warnings[0]!;
    expect(w.contactId).toBe('c01');
    expect(w.warningS).toBeCloseTo((w.criticalTMs! - w.firstTrackTMs!) / 1000);
  });
});
