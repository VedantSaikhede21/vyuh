import {
  ErrorEnvelope,
  MeResponse,
  TokenResponse,
  type ErrorCode,
  type MeResponse as MeResponseT,
  type TokenResponse as TokenResponseT,
} from '@vyuh/shared';
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

export const api = {
  me: (signal?: AbortSignal): Promise<MeResponseT> => apiFetch('/auth/me', MeResponse, { signal }),
  devLogin: (email: string): Promise<TokenResponseT> =>
    apiFetch('/auth/dev-login', TokenResponse, { method: 'POST', body: { email }, auth: false }),
};
