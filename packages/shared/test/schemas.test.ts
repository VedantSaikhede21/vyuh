import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ContactClass,
  ContactReport,
  EventBatchRequest,
  EventType,
  ErrorEnvelope,
  ERROR_HTTP_STATUS,
  ErrorCode,
  NonThreatClass,
  Scenario,
  ScenarioRequest,
  SimEvent,
  ThreatClass,
  type Scenario as ScenarioT,
} from '../src/index.ts';

const example = JSON.parse(
  readFileSync(new URL('../examples/scenario-s04-night-drop.json', import.meta.url), 'utf8'),
) as ScenarioT;

const clone = (): ScenarioT => structuredClone(example);

describe('Scenario (SPEC §4.4 example)', () => {
  it('accepts the example scenario', () => {
    const result = Scenario.safeParse(example);
    expect(result.error?.issues).toBeUndefined();
    expect(result.success).toBe(true);
  });

  it.each([
    ['missing contacts', (s: Record<string, unknown>) => delete s.contacts],
    ['unknown class', (s: ScenarioT) => ((s.contacts[0] as { class: string }).class = 'UFO')],
    ['difficulty 6', (s: ScenarioT) => ((s as { difficulty: number }).difficulty = 6)],
    [
      'negative spawn time',
      (s: ScenarioT) => ((s.contacts[0] as { spawnTMs: number }).spawnTMs = -1),
    ],
    [
      'fractional spawn time',
      (s: ScenarioT) => ((s.contacts[0] as { spawnTMs: number }).spawnTMs = 1.5),
    ],
    ['bad time of day', (s: ScenarioT) => ((s.environment as { time: string }).time = '25:00')],
    [
      'wrong schema version',
      (s: ScenarioT) => ((s as { schemaVersion: number }).schemaVersion = 2),
    ],
    [
      'border line with polygon',
      (s: ScenarioT) => {
        (s.zones[0] as unknown as Record<string, unknown>).polygon = [
          [0, 0],
          [1, 1],
          [2, 0],
        ];
        delete (s.zones[0] as unknown as Record<string, unknown>).polyline;
      },
    ],
    [
      'radar missing refRangeM',
      (s: ScenarioT) => delete (s.sensors[0] as Record<string, unknown>).refRangeM,
    ],
    [
      'effector kind MONITOR',
      (s: ScenarioT) => ((s.effectors[0] as { kind: string }).kind = 'MONITOR'),
    ],
    ['empty path', (s: ScenarioT) => (s.contacts[0]!.path = [])],
    ['ai confidence > 1', (s: ScenarioT) => (s.contacts[0]!.aiSuggestion!.confidence = 1.2)],
    ['seed above uint32', (s: ScenarioT) => (s.seed = 2 ** 32)],
    ['duplicate contact ids', (s: ScenarioT) => (s.contacts[1]!.id = 'c01')],
    ['bird marked as threat', (s: ScenarioT) => (s.contacts[1]!.isThreat = true)],
    ['despawn before spawn', (s: ScenarioT) => (s.contacts[0]!.despawnTMs = 1000)],
  ] as const)('rejects: %s', (_label, mutate) => {
    const s = clone();
    (mutate as (s: ScenarioT) => void)(s);
    expect(Scenario.safeParse(s).success).toBe(false);
  });

  it('rejects obviously invalid values', () => {
    for (const bad of [null, 42, 'scenario', [], {}]) {
      expect(Scenario.safeParse(bad).success).toBe(false);
    }
  });
});

describe('enums', () => {
  it('ContactClass is the union of threat and non-threat classes', () => {
    expect(ContactClass.options).toEqual([...ThreatClass.options, ...NonThreatClass.options]);
  });

  it('every EventType has exactly one SimEvent variant', () => {
    const variants = SimEvent.options.map((o) => o.shape.type.value).sort();
    expect(variants).toEqual([...EventType.options].sort());
  });

  it('every ErrorCode has an HTTP status', () => {
    expect(Object.keys(ERROR_HTTP_STATUS).sort()).toEqual([...ErrorCode.options].sort());
  });
});

describe('ScenarioRequest (SPEC §11.1)', () => {
  const req = {
    terrainPreset: 'JK_MOUNTAIN',
    timeOfDay: '18:10',
    weather: { visibilityM: 6000, rainMmph: 0, windMps: 5, windDirDeg: 220, cloudPct: 40 },
    difficulty: 4,
    seed: 9182,
    durationS: 300,
    roe: 'WEAPONS_TIGHT',
  };

  it('accepts the §11.1 example and LIVE weather', () => {
    expect(ScenarioRequest.safeParse(req).success).toBe(true);
    expect(ScenarioRequest.safeParse({ ...req, weather: 'LIVE' }).success).toBe(true);
  });

  it('rejects invalid requests', () => {
    expect(ScenarioRequest.safeParse({ ...req, roe: 'FREE' }).success).toBe(false);
    expect(ScenarioRequest.safeParse({ ...req, weather: 'SUNNY' }).success).toBe(false);
    expect(ScenarioRequest.safeParse({ ...req, threatMix: { DRAGON: 1 } }).success).toBe(false);
  });
});

describe('SimEvent / EventBatchRequest', () => {
  it('accepts the §11.1 batch example', () => {
    const batch = {
      batchSeq: 7,
      events: [
        {
          seq: 101,
          tMs: 41250,
          type: 'CLASSIFIED',
          trackId: 'T003',
          payload: { class: 'QUAD_HEAVY' },
        },
      ],
    };
    expect(EventBatchRequest.safeParse(batch).success).toBe(true);
  });

  it('requires trackId on trainee track events', () => {
    const ev = { seq: 1, tMs: 50, type: 'MARKED_DETECTED', payload: {} };
    expect(SimEvent.safeParse(ev).success).toBe(false);
    expect(SimEvent.safeParse({ ...ev, trackId: 'T001' }).success).toBe(true);
  });

  it('rejects mismatched payloads and unknown types', () => {
    expect(
      SimEvent.safeParse({
        seq: 1,
        tMs: 0,
        type: 'CLASSIFIED',
        trackId: 'T1',
        payload: { class: 'UFO' },
      }).success,
    ).toBe(false);
    expect(SimEvent.safeParse({ seq: 1, tMs: 0, type: 'TELEPORTED', payload: {} }).success).toBe(
      false,
    );
  });

  it('rejects batches over 500 events', () => {
    const events = Array.from({ length: 501 }, (_, i) => ({
      seq: i,
      tMs: i * 50,
      type: 'TRACK_SELECTED',
      trackId: 'T001',
      payload: {},
    }));
    expect(EventBatchRequest.safeParse({ batchSeq: 0, events }).success).toBe(false);
  });

  it('accepts a contact report event', () => {
    const report = {
      tMs: 60000,
      trackIds: ['T001'],
      count: 1,
      class: 'UNKNOWN',
      affiliation: 'UNKNOWN',
      location: { bearingDeg: 350, rangeM: 2100, fromSensorId: 'rad1' },
      headingDeg: 170,
      altitudeBand: 'LOW',
      activity: 'APPROACHING',
    };
    expect(ContactReport.safeParse(report).success).toBe(true);
    expect(
      SimEvent.safeParse({ seq: 3, tMs: 60000, type: 'REPORT_SUBMITTED', payload: report }).success,
    ).toBe(true);
  });
});

describe('ErrorEnvelope (SPEC §11.2)', () => {
  it('validates the envelope shape', () => {
    expect(
      ErrorEnvelope.safeParse({ error: { code: 'NOT_FOUND', message: 'x', details: {} } }).success,
    ).toBe(true);
    expect(
      ErrorEnvelope.safeParse({ error: { code: 'TEAPOT', message: 'x', details: {} } }).success,
    ).toBe(false);
    expect(ErrorEnvelope.safeParse({ code: 'NOT_FOUND', message: 'x' }).success).toBe(false);
  });
});
