import { z } from 'zod';
import { ContactClass, Difficulty, KillChainStage, ScenarioKind, UserRole } from './enums.ts';
import { named } from './registry.ts';
import { GenerateRequest, Point2, Scenario } from './scenario.ts';
import { UnitRef } from './api.ts';
import { ScoreComponents } from './score.ts';

// Phase 4b (SPEC §11): assignments, trainee trends, unit dashboard, scenario
// builder and scoring weight versions. Trends and unit figures use Assessment
// sessions only (SPEC §12 Phase 4).

// ---- Units ------------------------------------------------------------------

export const UnitMember = named(
  'UnitMember',
  z.object({ id: z.uuid(), name: z.string(), role: UserRole }),
);
export type UnitMember = z.infer<typeof UnitMember>;

export const UnitSummary = named(
  'UnitSummary',
  z.object({ id: z.uuid(), name: z.string(), members: z.array(UnitMember) }),
);
export type UnitSummary = z.infer<typeof UnitSummary>;

/** GET /units (instructor, admin) */
export const UnitListResponse = named(
  'UnitListResponse',
  z.object({ items: z.array(UnitSummary) }),
);
export type UnitListResponse = z.infer<typeof UnitListResponse>;

// ---- Assignments --------------------------------------------------------------

/** POST /assignments: a scenario to a whole unit and/or named users. */
export const CreateAssignmentRequest = named(
  'CreateAssignmentRequest',
  z
    .object({
      scenarioId: z.uuid(),
      unitId: z.uuid().nullable().optional(),
      userIds: z.array(z.uuid()).max(50).optional(),
      dueAt: z.iso.datetime({ offset: true }).nullable().optional(),
    })
    .refine((a) => Boolean(a.unitId) || (a.userIds?.length ?? 0) > 0, {
      message: 'Choose a unit or at least one trainee',
      path: ['unitId'],
    }),
);
export type CreateAssignmentRequest = z.infer<typeof CreateAssignmentRequest>;

export const AssignmentItem = named(
  'AssignmentItem',
  z.object({
    id: z.uuid(),
    scenarioId: z.uuid(),
    scenarioCode: z.string().nullable(),
    scenarioName: z.string(),
    unitId: z.uuid().nullable(),
    unitName: z.string().nullable(),
    userId: z.uuid().nullable(),
    userName: z.string().nullable(),
    assignedByName: z.string().nullable(),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    /** For GET /assignments/mine: an Assessment run completed since it was assigned. */
    completed: z.boolean(),
    completedSessionId: z.uuid().nullable(),
  }),
);
export type AssignmentItem = z.infer<typeof AssignmentItem>;

export const AssignmentListResponse = named(
  'AssignmentListResponse',
  z.object({ items: z.array(AssignmentItem) }),
);
export type AssignmentListResponse = z.infer<typeof AssignmentListResponse>;

// ---- Trends -----------------------------------------------------------------

/** Component scores as a percentage of the tree's maximum; null when the tree does not score it. */
export const ComponentPct = named(
  'ComponentPct',
  z.object({
    detection: z.number().min(0).max(100).nullable(),
    classification: z.number().min(0).max(100).nullable(),
    decision: z.number().min(0).max(100).nullable(),
    report: z.number().min(0).max(100).nullable(),
  }),
);
export type ComponentPct = z.infer<typeof ComponentPct>;

/** One completed Assessment session, oldest first in a trend. */
export const TrendPoint = named(
  'TrendPoint',
  z.object({
    sessionId: z.uuid(),
    scenarioId: z.uuid(),
    scenarioCode: z.string().nullable(),
    scenarioName: z.string(),
    difficulty: Difficulty,
    endedAt: z.iso.datetime({ offset: true }),
    total: z.number().min(0).max(100),
    components: ComponentPct,
    /** Mean detection latency over the threats the trainee marked, seconds. */
    detectionLatencyS: z.number().min(0).nullable(),
    /** Share of tracked contacts classified with the exact class, 0..1. */
    classificationAccuracy: z.number().min(0).max(1).nullable(),
    recommendedDifficulty: Difficulty,
    treeVersion: z.string(),
    isDemo: z.boolean(),
  }),
);
export type TrendPoint = z.infer<typeof TrendPoint>;

/** A mistake (a scoring-tree leaf) seen in more than one place, in plain words. */
export const MistakeItem = named(
  'MistakeItem',
  z.object({
    code: z.string(),
    text: z.string(),
    /** Contacts it happened on. */
    count: z.int().min(0),
    /** Sessions it happened in. */
    sessions: z.int().min(0),
    /** Trainees it happened to (unit dashboard). */
    trainees: z.int().min(0),
  }),
);
export type MistakeItem = z.infer<typeof MistakeItem>;

/** How often a kill-chain stage went right (status OK) where it applied. */
export const StageRate = named(
  'StageRate',
  z.object({
    stage: KillChainStage,
    ok: z.int().min(0),
    total: z.int().min(0),
    /** ok / total, null when the stage never applied. */
    rate: z.number().min(0).max(1).nullable(),
  }),
);
export type StageRate = z.infer<typeof StageRate>;

export const TrendUser = named(
  'TrendUser',
  z.object({ id: z.uuid(), name: z.string(), unitName: z.string().nullable() }),
);
export type TrendUser = z.infer<typeof TrendUser>;

/** GET /aar/users/{id}/trends */
export const TraineeTrendsResponse = named(
  'TraineeTrendsResponse',
  z.object({
    user: TrendUser,
    points: z.array(TrendPoint),
    mistakes: z.array(MistakeItem),
    stages: z.array(StageRate),
  }),
);
export type TraineeTrendsResponse = z.infer<typeof TraineeTrendsResponse>;

// ---- Unit dashboard -------------------------------------------------------------

export const UnitTraineeRow = named(
  'UnitTraineeRow',
  z.object({
    userId: z.uuid(),
    name: z.string(),
    sessions: z.int().min(0),
    avgTotal: z.number().nullable(),
    lastTotal: z.number().nullable(),
    bestTotal: z.number().nullable(),
    /** Mean of the last three totals minus the mean of the first three (null below two sessions). */
    change: z.number().nullable(),
    detectionLatencyS: z.number().nullable(),
    classificationAccuracy: z.number().min(0).max(1).nullable(),
    weakestStage: KillChainStage.nullable(),
  }),
);
export type UnitTraineeRow = z.infer<typeof UnitTraineeRow>;

export const AssignmentCompletion = named(
  'AssignmentCompletion',
  z.object({
    assignmentId: z.uuid(),
    scenarioId: z.uuid(),
    scenarioCode: z.string().nullable(),
    scenarioName: z.string(),
    dueAt: z.iso.datetime({ offset: true }).nullable(),
    /** Trainees it covers (the unit's trainees, or the named ones in this unit). */
    assigned: z.int().min(0),
    completed: z.int().min(0),
    pending: z.array(z.string()),
  }),
);
export type AssignmentCompletion = z.infer<typeof AssignmentCompletion>;

export const UnitSessionRow = named(
  'UnitSessionRow',
  z.object({
    sessionId: z.uuid(),
    userId: z.uuid(),
    userName: z.string(),
    scenarioCode: z.string().nullable(),
    scenarioName: z.string(),
    difficulty: Difficulty,
    endedAt: z.iso.datetime({ offset: true }),
    total: z.number(),
    treeVersion: z.string(),
    isDemo: z.boolean(),
  }),
);
export type UnitSessionRow = z.infer<typeof UnitSessionRow>;

/** GET /aar/units/{id} */
export const UnitDashboardResponse = named(
  'UnitDashboardResponse',
  z.object({
    unit: UnitRef,
    sessions: z.int().min(0),
    demoSessions: z.int().min(0),
    avgTotal: z.number().nullable(),
    components: ComponentPct,
    detectionLatencyS: z.number().nullable(),
    classificationAccuracy: z.number().min(0).max(1).nullable(),
    leaderboard: z.array(UnitTraineeRow),
    stages: z.array(StageRate),
    weakestStage: KillChainStage.nullable(),
    mistakes: z.array(MistakeItem),
    assignments: z.array(AssignmentCompletion),
    recent: z.array(UnitSessionRow),
  }),
);
export type UnitDashboardResponse = z.infer<typeof UnitDashboardResponse>;

// ---- Scoring weights ------------------------------------------------------------

export const ScoringTreeSummary = named(
  'ScoringTreeSummary',
  z.object({
    id: z.string(),
    /** The built-in tree whose structure this version shares. */
    baseId: z.string(),
    derivedFrom: z.string().nullable(),
    description: z.string(),
    componentMax: ScoreComponents,
    /** Components with leaves in this tree; only these weights can change. */
    editable: z.array(z.enum(['detection', 'classification', 'decision', 'report', 'efficiency'])),
    builtIn: z.boolean(),
    createdAt: z.iso.datetime({ offset: true }).nullable(),
    createdByName: z.string().nullable(),
    /** Score rows written with this version. */
    scoredSessions: z.int().min(0),
  }),
);
export type ScoringTreeSummary = z.infer<typeof ScoringTreeSummary>;

export const ScoringTreeListResponse = named(
  'ScoringTreeListResponse',
  z.object({ items: z.array(ScoringTreeSummary) }),
);
export type ScoringTreeListResponse = z.infer<typeof ScoringTreeListResponse>;

/** PATCH /scoring/trees/{id}/weights — creates a new immutable version. */
export const UpdateWeightsRequest = named(
  'UpdateWeightsRequest',
  z.object({
    componentMax: ScoreComponents,
    note: z.string().max(200).optional(),
  }),
);
export type UpdateWeightsRequest = z.infer<typeof UpdateWeightsRequest>;

/** POST /sessions/{id}/rescore → Score (a new score row). */
export const RescoreRequest = named('RescoreRequest', z.object({ treeId: z.string().min(1) }));
export type RescoreRequest = z.infer<typeof RescoreRequest>;

// ---- Scenario builder -------------------------------------------------------------

export const AuthoredZone = named(
  'AuthoredZone',
  z.object({
    name: z.string().min(1).max(40),
    polygon: z.array(Point2).min(3).max(16),
  }),
);
export type AuthoredZone = z.infer<typeof AuthoredZone>;

/**
 * POST /scenarios/preview and POST /scenarios (instructor): the generator's request
 * plus what the instructor draws — the asset position and extra NO_KINETIC zones.
 */
export const AuthorScenarioRequest = named(
  'AuthorScenarioRequest',
  z.object({
    name: z.string().trim().min(1).max(80),
    note: z.string().max(600).optional(),
    generate: GenerateRequest,
    assetXz: Point2.optional(),
    noKineticZones: z.array(AuthoredZone).max(6),
    scoringTreeId: z.string().min(1).optional(),
  }),
);
export type AuthorScenarioRequest = z.infer<typeof AuthorScenarioRequest>;

/** POST /scenarios/preview: the scenario that would be saved, or why it cannot be. */
export const AuthorPreviewResponse = named(
  'AuthorPreviewResponse',
  z.object({
    scenario: Scenario.nullable(),
    problems: z.array(z.string()),
    /** Threat composition by class, for the builder summary. */
    threatMix: z.partialRecord(ContactClass, z.int().min(0)),
    nonThreats: z.int().min(0),
  }),
);
export type AuthorPreviewResponse = z.infer<typeof AuthorPreviewResponse>;

/** POST /scenarios → 201 */
export const AuthorScenarioResponse = named(
  'AuthorScenarioResponse',
  z.object({ scenarioId: z.uuid(), kind: ScenarioKind, scenario: Scenario }),
);
export type AuthorScenarioResponse = z.infer<typeof AuthorScenarioResponse>;
