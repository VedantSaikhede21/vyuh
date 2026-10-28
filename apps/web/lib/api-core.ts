import type { ErrorCode } from '@vyuh/shared';

// The parts of the API client that every page needs (the error class and the
// token getter), kept apart from lib/api.ts so the root layout does not pull in
// zod and the shared schemas: pages that call the API load those (Phase 6F).

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

/** The current access token, through the getter the auth provider registered. */
export const currentAccessToken = (): Promise<string | null> => getToken();
