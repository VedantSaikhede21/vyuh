import { z } from 'zod';
import {
  Difficulty,
  ErrorCode,
  Roe,
  ScenarioKind,
  SessionEndReason,
  SessionMode,
  SessionStatus,
  UserRole,
} from './enums.ts';
import { ContactKillChain, SessionRemark } from './aar.ts';
import { SimEvent } from './events.ts';
import { AiTrustMetrics } from './ai.ts';
import { named } from './registry.ts';
import { Scenario, TimeOfDay, Weather } from './scenario.ts';
import { Score } from './score.ts';

// Request/response shapes for /api/v1 (SPEC §11, §11.1, §11.2).

export const MAX_EVENTS_PER_BATCH = 500;
export const MAX_EVENTS_PER_SESSION = 20_000;

// ---- Errors (§11.2) --------------------------------------------------------

export const ErrorBody = named(
  'ErrorBody',
  z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
);
export type ErrorBody = z.infer<typeof ErrorBody>;

export const ErrorEnvelope = named('ErrorEnvelope', z.object({ error: ErrorBody }));
export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;

// ---- Health & auth ---------------------------------------------------------

export const HealthResponse = named(
  'HealthResponse',
  z.object({ status: z.literal('ok'), env: z.string(), version: z.string() }),
);
export type HealthResponse = z.infer<typeof HealthResponse>;

export const UnitRef = named('UnitRef', z.object({ id: z.uuid(), name: z.string() }));
export type UnitRef = z.infer<typeof UnitRef>;

/** GET /auth/me */
export const MeResponse = named(
  'MeResponse',
  z.object({
    id: z.uuid(),
    name: z.string(),
    email: z.string().nullable(),
    role: UserRole,
    unit: UnitRef.nullable(),
    rating: z.int(),
    isGuest: z.boolean(),
  }),
);
export type MeResponse = z.infer<typeof MeResponse>;

/** POST /auth/dev-login (AUTH_MODE=local, ENV != prod only). */
export const DevLoginRequest = named(
  'DevLoginRequest',
  z.object({ email: z.string().min(3).max(254) }),
);
export type DevLoginRequest = z.infer<typeof DevLoginRequest>;

export const TokenResponse = named(
  'TokenResponse',
  z.object({
    accessToken: z.string(),
    tokenType: z.literal('bearer'),
    expiresIn: z.int().positive(),
  }),
);
export type TokenResponse = z.infer<typeof TokenResponse>;

// ---- Sessions (§11.1) -------------------------------------------------------

export const CreateSessionRequest = named(
  'CreateSessionRequest',
  z.object({
    scenarioId: z.uuid(),
    mode: SessionMode,
    /** sim-core SIM_VERSION the client runs; replay must use the same (decision 48). */
    simVersion: z.int().min(1),
  }),
);
export type CreateSessionRequest = z.infer<typeof CreateSessionRequest>;

export const CreateSessionResponse = named(
  'CreateSessionResponse',
  z.object({
    sessionId: z.uuid(),
    scenario: Scenario,
    startedAt: z.iso.datetime({ offset: true }),
    simVersion: z.int().min(1),
  }),
);
export type CreateSessionResponse = z.infer<typeof CreateSessionResponse>;

/** Idempotent by batchSeq — a re-sent batch is ignored. */
export const EventBatchRequest = named(
  'EventBatchRequest',
  z.object({
    batchSeq: z.int().min(0),
    events: z.array(SimEvent).max(MAX_EVENTS_PER_BATCH),
  }),
);
export type EventBatchRequest = z.infer<typeof EventBatchRequest>;

export const EventBatchResponse = named(
  'EventBatchResponse',
  z.object({ accepted: z.int().min(0), lastSeq: z.int().min(-1) }),
);
export type EventBatchResponse = z.infer<typeof EventBatchResponse>;

export const ClientMeta = named(
  'ClientMeta',
  z.object({
    avgFps: z.number().min(0).optional(),
    gpu: z.string().max(200).optional(),
    browser: z.string().max(200).optional(),
  }),
);
export type ClientMeta = z.infer<typeof ClientMeta>;

/** POST /sessions/{id}/complete → Score */
export const CompleteSessionRequest = named(
  'CompleteSessionRequest',
  z.object({ endTMs: z.int().min(0), clientMeta: ClientMeta }),
);
export type CompleteSessionRequest = z.infer<typeof CompleteSessionRequest>;

/** How a run ended, from its stored SESSION_ENDED event. */
export const SessionEnded = named(
  'SessionEnded',
  z.object({ reason: SessionEndReason, tMs: z.int().min(0) }),
);
export type SessionEnded = z.infer<typeof SessionEnded>;

/** GET /sessions/{id}. `score` is null until the session is COMPLETED. */
export const SessionDetailResponse = named(
  'SessionDetailResponse',
  z.object({
    id: z.uuid(),
    scenarioId: z.uuid(),
    scenarioName: z.string(),
    mode: SessionMode,
    status: SessionStatus,
    startedAt: z.iso.datetime({ offset: true }),
    endedAt: z.iso.datetime({ offset: true }).nullable(),
    /** Null for sessions created before sim versions were recorded. */
    simVersion: z.int().min(1).nullable(),
    /** Terrain preset `meta.revision` at session creation; null before Phase 4a. */
    terrainRevision: z.int().min(1).nullable(),
    score: Score.nullable(),
    /** Null until the log holds a SESSION_ENDED event. */
    ended: SessionEnded.nullable(),
    /** Seeded demo history (SPEC §22), shown with a "Demo data" badge. */
    isDemo: z.boolean(),
  }),
);
export type SessionDetailResponse = z.infer<typeof SessionDetailResponse>;

/**
 * GET /aar/sessions/{id} (COMPLETED sessions only): everything a replay needs —
 * the scenario, the stored event log (ground truth included) and the kill chain.
 */
export const AarSessionResponse = named(
  'AarSessionResponse',
  z.object({
    session: SessionDetailResponse,
    scenario: Scenario,
    events: z.array(SimEvent),
    killChain: z.array(ContactKillChain),
    /** AI-assist over- / under-trust in this session (SPEC §9.4). */
    aiTrust: AiTrustMetrics,
    /** Instructor remarks, oldest first. */
    remarks: z.array(SessionRemark),
  }),
);
export type AarSessionResponse = z.infer<typeof AarSessionResponse>;

// ---- Scenarios (§11.1) --------------------------------------------------------

/** One row of GET /scenarios (no contacts — ground truth stays out of lists). */
export const ScenarioListItem = named(
  'ScenarioListItem',
  z.object({
    id: z.uuid(),
    code: z.string().nullable(),
    name: z.string(),
    kind: ScenarioKind,
    difficulty: Difficulty,
    durationS: z.int().positive(),
    roe: Roe,
    /** Stored flag; the client recomputes it from the preset meta (SPEC §4 Phase 2). */
    isNight: z.boolean(),
    terrainPreset: z.string().min(1),
    date: z.iso.date(),
    time: TimeOfDay,
    /** For the list's conditions column (visibility, rain, wind). */
    weather: Weather,
    tags: z.array(z.string()),
    /** The requester's best total (0-100) over their completed sessions; null if none. */
    bestScore: z.number().min(0).max(100).nullable(),
  }),
);
export type ScenarioListItem = z.infer<typeof ScenarioListItem>;

export const ScenarioListResponse = named(
  'ScenarioListResponse',
  z.object({ items: z.array(ScenarioListItem) }),
);
export type ScenarioListResponse = z.infer<typeof ScenarioListResponse>;

/** GET /scenarios/{id} */
export const ScenarioDetailResponse = named(
  'ScenarioDetailResponse',
  z.object({
    scenarioId: z.uuid(),
    code: z.string().nullable(),
    kind: ScenarioKind,
    scenario: Scenario,
  }),
);
export type ScenarioDetailResponse = z.infer<typeof ScenarioDetailResponse>;

/** POST /scenarios/generate — request body is a GenerateRequest. */
export const GenerateScenarioResponse = named(
  'GenerateScenarioResponse',
  z.object({ scenarioId: z.uuid(), scenario: Scenario }),
);
export type GenerateScenarioResponse = z.infer<typeof GenerateScenarioResponse>;
