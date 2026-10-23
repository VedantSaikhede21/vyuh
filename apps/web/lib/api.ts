import {
  AarSessionResponse,
  AssignmentListResponse,
  AuthorPreviewResponse,
  AuthorScenarioResponse,
  ScoringTreeListResponse,
  ScoringTreeSummary,
  TraineeTrendsResponse,
  UnitDashboardResponse,
  UnitListResponse,
  type AuthorScenarioRequest,
  type CreateAssignmentRequest,
  type ScoreComponents,
  CreateSessionResponse,
  ErrorEnvelope,
  EventBatchResponse,
  GenerateScenarioResponse,
  MeResponse,
  ScenarioDetailResponse,
  ScenarioListResponse,
  Score,
  SessionDetailResponse,
  TokenResponse,
  type ClientMeta,
  type ErrorCode,
  type GenerateRequest,
  type MeResponse as MeResponseT,
  type SessionMode,
  type SimEvent,
  type TokenResponse as TokenResponseT,
} from '@vyuh/shared';
import { SIM_VERSION } from '@vyuh/sim-core';
import type { z } from 'zod';
import { env } from './env';

/** An API error in the SPEC §11.2 envelope (or NETWORK when the API is unreachable). */
export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode | 'NETWORK' | 'BAD_RESPONSE',
    message: string,
    readonly status: number,
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type TokenGetter = () => Promise<string | null>;

let getToken: TokenGetter = async () => null;

/** The auth provider registers how to obtain the current access token. */
export function setTokenGetter(getter: TokenGetter): void {
  getToken = getter;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  auth?: boolean;
  signal?: AbortSignal;
}

export async function apiFetch<S extends z.ZodType>(
  path: string,
  schema: S,
  { method = 'GET', body, auth = true, signal }: RequestOptions = {},
): Promise<z.infer<S>> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = await getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(`${env.apiUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError('NETWORK', `Cannot reach the API at ${env.apiUrl}`, 0);
  }

  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = ErrorEnvelope.safeParse(json);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiError(code, message, response.status, details);
    }
    throw new ApiError('BAD_RESPONSE', `HTTP ${response.status}`, response.status);
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new ApiError('BAD_RESPONSE', 'Unexpected response shape', response.status);
  }
  return parsed.data;
}

/** True for errors worth retrying: the API was unreachable or failed server-side. */
export function isRetryable(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'NETWORK' || err.status >= 500);
}

export const api = {
  me: (signal?: AbortSignal): Promise<MeResponseT> => apiFetch('/auth/me', MeResponse, { signal }),
  devLogin: (email: string): Promise<TokenResponseT> =>
    apiFetch('/auth/dev-login', TokenResponse, { method: 'POST', body: { email }, auth: false }),
  listScenarios: (signal?: AbortSignal) => apiFetch('/scenarios', ScenarioListResponse, { signal }),
  /** The caller's own generated scenarios, newest first. */
  listOwnGenerated: (signal?: AbortSignal) =>
    apiFetch('/scenarios?mine=true', ScenarioListResponse, { signal }),
  getScenario: (id: string, signal?: AbortSignal) =>
    apiFetch(`/scenarios/${id}`, ScenarioDetailResponse, { signal }),
  /** POST /scenarios/generate; a 429 carries `retryAfterS` in ApiError.details. */
  generateScenario: (body: GenerateRequest) =>
    apiFetch('/scenarios/generate', GenerateScenarioResponse, { method: 'POST', body }),
  createSession: (scenarioId: string, mode: SessionMode) =>
    apiFetch('/sessions', CreateSessionResponse, {
      method: 'POST',
      body: { scenarioId, mode, simVersion: SIM_VERSION },
    }),
  postEvents: (sessionId: string, batchSeq: number, events: readonly SimEvent[]) =>
    apiFetch(`/sessions/${sessionId}/events`, EventBatchResponse, {
      method: 'POST',
      body: { batchSeq, events },
    }),
  completeSession: (sessionId: string, endTMs: number, clientMeta: ClientMeta) =>
    apiFetch(`/sessions/${sessionId}/complete`, Score, {
      method: 'POST',
      body: { endTMs, clientMeta },
    }),
  /** After-action review data of a completed session (scenario, events, kill chain). */
  getAar: (sessionId: string, signal?: AbortSignal) =>
    apiFetch(`/aar/sessions/${sessionId}`, AarSessionResponse, { signal }),
  getSession: (sessionId: string, signal?: AbortSignal) =>
    apiFetch(`/sessions/${sessionId}`, SessionDetailResponse, { signal }),

  // Phase 4b: assignments, trends, unit dashboard, builder, scoring weights.
  myAssignments: (signal?: AbortSignal) =>
    apiFetch('/assignments/mine', AssignmentListResponse, { signal }),
  createAssignment: (body: CreateAssignmentRequest) =>
    apiFetch('/assignments', AssignmentListResponse, { method: 'POST', body }),
  listUnits: (signal?: AbortSignal) => apiFetch('/units', UnitListResponse, { signal }),
  trends: (userId: string, signal?: AbortSignal) =>
    apiFetch(`/aar/users/${userId}/trends`, TraineeTrendsResponse, { signal }),
  unitDashboard: (unitId: string, signal?: AbortSignal) =>
    apiFetch(`/aar/units/${unitId}`, UnitDashboardResponse, { signal }),
  previewAuthored: (body: AuthorScenarioRequest, signal?: AbortSignal) =>
    apiFetch('/scenarios/preview', AuthorPreviewResponse, { method: 'POST', body, signal }),
  saveAuthored: (body: AuthorScenarioRequest) =>
    apiFetch('/scenarios', AuthorScenarioResponse, { method: 'POST', body }),
  listTrees: (signal?: AbortSignal) =>
    apiFetch('/scoring/trees', ScoringTreeListResponse, { signal }),
  saveWeights: (treeId: string, componentMax: ScoreComponents, note?: string) =>
    apiFetch(`/scoring/trees/${treeId}/weights`, ScoringTreeSummary, {
      method: 'PATCH',
      body: note ? { componentMax, note } : { componentMax },
    }),
  rescore: (sessionId: string, treeId: string) =>
    apiFetch(`/sessions/${sessionId}/rescore`, Score, { method: 'POST', body: { treeId } }),
};
