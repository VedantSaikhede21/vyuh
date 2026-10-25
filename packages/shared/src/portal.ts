import { z } from 'zod';
import {
  ComponentStatus,
  Difficulty,
  KillChainStage,
  NoticeKind,
  SessionMode,
  TrainingLevel,
} from './enums.ts';
import { UnitRef } from './api.ts';
import { AssignmentItem, StageRate } from './instructor.ts';
import { LevelStatus } from './record.ts';
import { named } from './registry.ts';
import { ScoreComponents } from './score.ts';

// Phase 6C signed-in pages (SPEC §11): operator home, notices, status, readiness
// board, live session monitor and the scoring summary behind Help.

// ---- Threat library updates -------------------------------------------------------

/** Dated changes to the threat library; each one is a LIBRARY notice for everyone. */
export const LIBRARY_UPDATES: readonly { id: string; date: string; text: string }[] = [
  {
    id: 'lib-2026-10-25',
    date: '2026-10-25',
    text: 'Threat library published: 10 contact classes with ID cues and common confusions.',
  },
];

// ---- Notices ----------------------------------------------------------------------

export const Notice = named(
  'Notice',
  z.object({
    /** Stable per source row, e.g. `remark:<uuid>`. */
    id: z.string(),
    kind: NoticeKind,
    title: z.string(),
    body: z.string().nullable(),
    /** Where the notice leads in the app. */
    href: z.string().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
    unread: z.boolean(),
  }),
);
export type Notice = z.infer<typeof Notice>;

/** GET /notices — newest first. */
export const NoticeListResponse = named(
  'NoticeListResponse',
  z.object({ items: z.array(Notice), unreadCount: z.int().min(0) }),
);
export type NoticeListResponse = z.infer<typeof NoticeListResponse>;

/** GET /notices/count — for the top bar. */
export const NoticeCountResponse = named(
  'NoticeCountResponse',
  z.object({ unreadCount: z.int().min(0) }),
);
export type NoticeCountResponse = z.infer<typeof NoticeCountResponse>;

// ---- Operator home ------------------------------------------------------------------

export const HomeSessionRow = named(
  'HomeSessionRow',
  z.object({
    sessionId: z.uuid(),
    scenarioCode: z.string().nullable(),
    scenarioName: z.string(),
    mode: SessionMode,
    difficulty: Difficulty,
    endedAt: z.iso.datetime({ offset: true }),
    /** Display value, whole number (decision 149). */
    total: z.int(),
    isDemo: z.boolean(),
  }),
);
export type HomeSessionRow = z.infer<typeof HomeSessionRow>;

/** GET /home — the signed-in trainee's landing page in one round trip. */
export const HomeResponse = named(
  'HomeResponse',
  z.object({
    /** The open assignment due soonest (undated last); null when none is open. */
    assignment: AssignmentItem.nullable(),
    openAssignments: z.int().min(0),
    /** Kill-chain stage rates over threat contacts, Assessment sessions only. */
    stages: z.array(StageRate),
    assessments: z.int().min(0),
    demoAssessments: z.int().min(0),
    rating: z.int(),
    /** Five most recent completed sessions, both modes. */
    recent: z.array(HomeSessionRow),
    notices: z.array(Notice),
    unreadCount: z.int().min(0),
    /** The lowest level not yet qualified; null once every level is qualified. */
    nextLevel: LevelStatus.nullable(),
  }),
);
export type HomeResponse = z.infer<typeof HomeResponse>;

// ---- Status (public) --------------------------------------------------------------

/**
 * GET /status — public and minimal: up / down per component and versions. Never
 * hostnames, database names, model ids or error text (decision 156).
 */
export const StatusResponse = named(
  'StatusResponse',
  z
    .object({
      components: z.object({
        api: ComponentStatus,
        database: ComponentStatus,
        /** Whether LLM features are switched on (not whether the provider answers). */
        llmEnabled: z.boolean(),
      }),
      versions: z.object({
        api: z.string(),
        generator: z.int(),
        /** Terrain preset code → meta.revision. */
        terrain: z.record(z.string(), z.int()),
      }),
    })
    .strict(),
);
export type StatusResponse = z.infer<typeof StatusResponse>;

// ---- Instructor: readiness and live sessions --------------------------------------

export const ReadinessRow = named(
  'ReadinessRow',
  z.object({
    userId: z.uuid(),
    name: z.string(),
    /** Highest qualified level; null below Basic operator. */
    level: TrainingLevel.nullable(),
    /** A level whose criteria are met and waits for a sign-off. */
    awaitingSignoff: TrainingLevel.nullable(),
    reviewDue: z.boolean(),
    assessments: z.int().min(0),
    lastAssessmentAt: z.iso.datetime({ offset: true }).nullable(),
    /** Display value, whole number. */
    lastTotal: z.int().nullable(),
    weakestStage: KillChainStage.nullable(),
    overdueAssignments: z.int().min(0),
  }),
);
export type ReadinessRow = z.infer<typeof ReadinessRow>;

/** GET /units/{id}/readiness */
export const ReadinessResponse = named(
  'ReadinessResponse',
  z.object({ unit: UnitRef, rows: z.array(ReadinessRow) }),
);
export type ReadinessResponse = z.infer<typeof ReadinessResponse>;

export const ActiveSessionRow = named(
  'ActiveSessionRow',
  z.object({
    sessionId: z.uuid(),
    userId: z.uuid(),
    userName: z.string(),
    scenarioCode: z.string().nullable(),
    scenarioName: z.string(),
    mode: SessionMode,
    startedAt: z.iso.datetime({ offset: true }),
    lastBatchAt: z.iso.datetime({ offset: true }),
    /** Sim time of the latest stored event, ms. */
    simTMs: z.int().min(0),
  }),
);
export type ActiveSessionRow = z.infer<typeof ActiveSessionRow>;

/** GET /sessions/active?unit= — ACTIVE sessions with a batch in the last 60 s. No score: it is computed at the end. */
export const ActiveSessionsResponse = named(
  'ActiveSessionsResponse',
  z.object({ items: z.array(ActiveSessionRow), polledAt: z.iso.datetime({ offset: true }) }),
);
export type ActiveSessionsResponse = z.infer<typeof ActiveSessionsResponse>;

// ---- Scoring summary (Help) ---------------------------------------------------------

export const ScoringLeafSummary = named(
  'ScoringLeafSummary',
  z.object({
    code: z.string(),
    component: z
      .enum(['detection', 'classification', 'decision', 'report', 'efficiency'])
      .nullable(),
    /** Component points for a component leaf. */
    points: z.number().nullable(),
    /** Session-level adjustment (penalty < 0, bonus > 0). */
    adjust: z.number().nullable(),
  }),
);
export type ScoringLeafSummary = z.infer<typeof ScoringLeafSummary>;

/** GET /scoring/summary — read from the built-in tree files, so Help cannot drift. */
export const ScoringSummaryResponse = named(
  'ScoringSummaryResponse',
  z.object({
    /** The tree new scenarios and the generator use. */
    current: z.string(),
    componentMax: ScoreComponents,
    detectionBandsS: z.array(z.number()),
    leaves: z.array(ScoringLeafSummary),
  }),
);
export type ScoringSummaryResponse = z.infer<typeof ScoringSummaryResponse>;
