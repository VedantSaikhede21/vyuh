import { z } from 'zod';
import { EndorsementCode, KillChainStage, LevelState, TrainingLevel } from './enums.ts';
import { UnitRef } from './api.ts';
import { named } from './registry.ts';

// Service record (SPEC §9.7, decision 155): representative training levels and
// endorsements, computed on the server from Assessment sessions only. The rules
// are data here; `pnpm gen:schemas` exports them for the API, which evaluates them.

export const RECORD_LABEL = 'Representative training levels. Not official qualifications.';

/**
 * A window is the trainee's most recent `window` completed Assessment sessions at
 * difficulty `minDifficulty` or above (all of them when `window` is absent).
 */
const windowed = {
  window: z.int().positive().optional(),
  minDifficulty: z.int().min(1).max(5).optional(),
};

export const RecordCriterion = named(
  'RecordCriterion',
  z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('SESSIONS'),
      id: z.string(),
      label: z.string(),
      min: z.int().positive(),
      minDifficulty: z.int().min(1).max(5).optional(),
      /** Only sessions whose total (display value) is at least this. */
      minTotal: z.number().optional(),
      /** Only night scenarios. */
      night: z.boolean().optional(),
    }),
    z.object({
      kind: z.literal('STAGE_OK'),
      id: z.string(),
      label: z.string(),
      stage: KillChainStage,
      /** OK ÷ (every status but NOT_APPLICABLE) over threat contacts in the window. */
      minRate: z.number().min(0).max(1),
      ...windowed,
    }),
    z.object({
      kind: z.literal('MEAN_LATENCY'),
      id: z.string(),
      label: z.string(),
      maxS: z.number().positive(),
      ...windowed,
    }),
    z.object({
      kind: z.literal('NO_LEAVES'),
      id: z.string(),
      label: z.string(),
      /** Scoring-tree leaf ids that must not occur in the window. */
      leaves: z.array(z.string()).min(1),
      ...windowed,
    }),
    z.object({
      kind: z.literal('COMPONENT_PCT'),
      id: z.string(),
      label: z.string(),
      component: z.enum(['detection', 'classification', 'decision', 'report']),
      /** Points earned ÷ the component's maximum, over sessions whose tree scores it. */
      minPct: z.number().min(0).max(100),
      ...windowed,
    }),
    z.object({
      kind: z.literal('RATING'),
      id: z.string(),
      label: z.string(),
      min: z.int(),
    }),
  ]),
);
export type RecordCriterion = z.infer<typeof RecordCriterion>;

export const LevelRule = named(
  'LevelRule',
  z.object({
    level: TrainingLevel,
    name: z.string(),
    /** STAFF: an instructor or admin signs it off; ADMIN: an admin only. */
    signoffBy: z.enum(['STAFF', 'ADMIN']),
    criteria: z.array(RecordCriterion).min(1),
  }),
);
export type LevelRule = z.infer<typeof LevelRule>;

export const EndorsementRule = named(
  'EndorsementRule',
  z.object({
    code: EndorsementCode,
    name: z.string(),
    description: z.string(),
    /** Numbers the API's rule for this code reads (e.g. minTotal, sessions). */
    params: z.record(z.string(), z.number()),
  }),
);
export type EndorsementRule = z.infer<typeof EndorsementRule>;

export const RecordRuleset = named(
  'RecordRuleset',
  z.object({
    id: z.string(),
    levels: z.array(LevelRule).length(4),
    endorsements: z.array(EndorsementRule),
    /** Leaf ids that count as a non-threat penalty for DISCRIMINATION. */
    nonThreatPenaltyLeaves: z.array(z.string()),
  }),
);
export type RecordRuleset = z.infer<typeof RecordRuleset>;

export const RECORD_V1: RecordRuleset = {
  id: 'record_v1',
  levels: [
    {
      level: 'BASIC_OPERATOR',
      name: 'Basic operator',
      signoffBy: 'STAFF',
      criteria: [
        { kind: 'SESSIONS', id: 'sessions', label: 'Assessment sessions', min: 3 },
        {
          kind: 'STAGE_OK',
          id: 'detect',
          label: 'Detect done right, last 3 sessions',
          stage: 'DETECT',
          minRate: 0.7,
          window: 3,
        },
        {
          kind: 'NO_LEAVES',
          id: 'fratricide',
          label: 'Fratricide, last 3 sessions',
          leaves: ['FRATRICIDE'],
          window: 3,
        },
      ],
    },
    {
      level: 'SENSOR_OPERATOR',
      name: 'Sensor operator',
      signoffBy: 'STAFF',
      criteria: [
        {
          kind: 'SESSIONS',
          id: 'sessions',
          label: 'Assessment sessions at D2 or above',
          min: 3,
          minDifficulty: 2,
        },
        {
          kind: 'STAGE_OK',
          id: 'identify',
          label: 'Identify done right, last 5 at D2+',
          stage: 'IDENTIFY',
          minRate: 0.7,
          window: 5,
          minDifficulty: 2,
        },
        {
          kind: 'MEAN_LATENCY',
          id: 'latency',
          label: 'Mean detection latency, last 5 at D2+',
          maxS: 15,
          window: 5,
          minDifficulty: 2,
        },
        {
          kind: 'SESSIONS',
          id: 'night',
          label: 'Night session scoring 60 or more',
          min: 1,
          minTotal: 60,
          night: true,
        },
      ],
    },
    {
      level: 'ENGAGEMENT_CONTROLLER',
      name: 'Engagement controller',
      signoffBy: 'STAFF',
      criteria: [
        {
          kind: 'SESSIONS',
          id: 'sessions',
          label: 'Sessions at D3+ scoring 70 or more',
          min: 3,
          minDifficulty: 3,
          minTotal: 70,
        },
        {
          kind: 'STAGE_OK',
          id: 'decide',
          label: 'Decide done right, last 5 at D3+',
          stage: 'DECIDE',
          minRate: 0.75,
          window: 5,
          minDifficulty: 3,
        },
        {
          kind: 'STAGE_OK',
          id: 'respond',
          label: 'Respond done right, last 5 at D3+',
          stage: 'RESPOND',
          minRate: 0.75,
          window: 5,
          minDifficulty: 3,
        },
        {
          kind: 'NO_LEAVES',
          id: 'discipline',
          label: 'Fratricide, wrong engagement or ROE attempt, last 5 at D3+',
          leaves: [
            'FRATRICIDE',
            'WRONGLY_ENGAGED',
            'ROE_VIOLATION_ATTEMPT',
            'NO_KINETIC_VIOLATION_ATTEMPT',
          ],
          window: 5,
          minDifficulty: 3,
        },
        {
          kind: 'COMPONENT_PCT',
          id: 'report',
          label: 'Contact report points, last 5 at D3+',
          component: 'report',
          minPct: 60,
          window: 5,
          minDifficulty: 3,
        },
      ],
    },
    {
      level: 'INSTRUCTOR',
      name: 'Instructor',
      signoffBy: 'ADMIN',
      criteria: [
        { kind: 'SESSIONS', id: 'sessions', label: 'Assessment sessions', min: 10 },
        {
          kind: 'SESSIONS',
          id: 'hard',
          label: 'Sessions at D4+ scoring 75 or more',
          min: 2,
          minDifficulty: 4,
          minTotal: 75,
        },
        { kind: 'RATING', id: 'rating', label: 'Rating', min: 1300 },
      ],
    },
  ],
  endorsements: [
    {
      code: 'NIGHT_OPS',
      name: 'Night ops',
      description: 'A night scenario scoring 70 or more with no threat leaked.',
      params: { minTotal: 70 },
    },
    {
      code: 'SWARM',
      name: 'Swarm',
      description: 'Every threat of a swarm of 3 or more neutralised.',
      params: { minSwarm: 3 },
    },
    {
      code: 'SILENT_LINK',
      name: 'Silent link',
      description:
        'A fibre-optic or GNSS-autonomous threat neutralised with no ineffective EW ordered on it first.',
      params: {},
    },
    {
      code: 'DISCRIMINATION',
      name: 'Discrimination',
      description:
        'A session with 3 or more non-threats: every threat classified exactly and no non-threat engaged or jammed.',
      params: { minNonThreats: 3 },
    },
    {
      code: 'ROE_DISCIPLINE',
      name: 'ROE discipline',
      description: '5 sessions in a row on ROE-scoring trees without an ROE or no-kinetic attempt.',
      params: { sessions: 5 },
    },
    {
      code: 'REPORTING',
      name: 'Reporting',
      description: 'Contact reports earning 80 % or more of their points in 3 sessions.',
      params: { minPct: 80, sessions: 3 },
    },
    {
      code: 'CALIBRATED_TRUST',
      name: 'Calibrated trust',
      description:
        '3 sessions where the AI assist was wrong at least once and every wrong suggestion was rejected. An insight, never part of the score.',
      params: { sessions: 3 },
    },
  ],
  nonThreatPenaltyLeaves: [
    'FRATRICIDE',
    'FRIENDLY_JAMMED',
    'WRONGLY_ENGAGED',
    'CIVILIAN_JAMMED',
    'BIRD_EW_ORDERED',
  ],
};

// ---- Responses -------------------------------------------------------------------

export const CriterionStatus = named(
  'CriterionStatus',
  z.object({
    id: z.string(),
    label: z.string(),
    /** Current figure; null when no session counts yet. Rates are percentages. */
    value: z.number().nullable(),
    target: z.number(),
    unit: z.enum(['COUNT', 'PCT', 'S', 'RATING']),
    /** AT_LEAST: value ≥ target; AT_MOST: value ≤ target. */
    comparison: z.enum(['AT_LEAST', 'AT_MOST']),
    met: z.boolean(),
  }),
);
export type CriterionStatus = z.infer<typeof CriterionStatus>;

export const LevelSignoff = named(
  'LevelSignoff',
  z.object({
    byName: z.string(),
    at: z.iso.datetime({ offset: true }),
    /** Seeded with the demo history (SPEC §22). */
    isDemo: z.boolean(),
  }),
);
export type LevelSignoff = z.infer<typeof LevelSignoff>;

export const LevelStatus = named(
  'LevelStatus',
  z.object({
    level: TrainingLevel,
    name: z.string(),
    state: LevelState,
    criteriaMet: z.boolean(),
    /** QUALIFIED, but the current window figures no longer meet the criteria. */
    reviewDue: z.boolean(),
    signoffBy: z.enum(['STAFF', 'ADMIN']),
    signoff: LevelSignoff.nullable(),
    criteria: z.array(CriterionStatus),
  }),
);
export type LevelStatus = z.infer<typeof LevelStatus>;

export const EndorsementStatus = named(
  'EndorsementStatus',
  z.object({
    code: EndorsementCode,
    name: z.string(),
    description: z.string(),
    earned: z.boolean(),
    /** The first session that earned it. */
    sessionId: z.uuid().nullable(),
    scenarioName: z.string().nullable(),
    earnedAt: z.iso.datetime({ offset: true }).nullable(),
    /** Qualifying sessions so far, for multi-session endorsements. */
    progress: z.object({ count: z.int().min(0), of: z.int().positive() }).nullable(),
  }),
);
export type EndorsementStatus = z.infer<typeof EndorsementStatus>;

/** GET /record/{userId} */
export const ServiceRecordResponse = named(
  'ServiceRecordResponse',
  z.object({
    user: z.object({ id: z.uuid(), name: z.string(), unit: UnitRef.nullable() }),
    ruleset: z.string(),
    rating: z.int(),
    assessments: z.int().min(0),
    demoAssessments: z.int().min(0),
    levels: z.array(LevelStatus).length(4),
    endorsements: z.array(EndorsementStatus),
    /** Levels the viewer may sign off now (criteria met, role allowed, not their own record). */
    canSignOff: z.array(TrainingLevel),
  }),
);
export type ServiceRecordResponse = z.infer<typeof ServiceRecordResponse>;

/** POST /record/{userId}/signoffs → ServiceRecordResponse */
export const SignoffRequest = named('SignoffRequest', z.object({ level: TrainingLevel }));
export type SignoffRequest = z.infer<typeof SignoffRequest>;
