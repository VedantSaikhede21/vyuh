import type { SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: Promise<SupabaseClient> | null = null;

/**
 * Browser Supabase client (auth only — the API owns all DB access, SPEC §10).
 * supabase-js is ~60 KB gzipped, so it is loaded on first use rather than with
 * every page (Phase 6F).
 */
export function getSupabase(): Promise<SupabaseClient> {
  if (env.authMode !== 'supabase') {
    throw new Error('Supabase client requested while NEXT_PUBLIC_AUTH_MODE is not "supabase"');
  }
  client ??= import('@supabase/supabase-js').then(({ createClient }) =>
    createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    }),
  );
  return client;
}

/**
 * Whether supabase-js has a session stored, read without loading it: its
 * default storage key is `sb-<project ref>-auth-token` in localStorage. An
 * anonymous visitor then never downloads the library.
 */
export function hasStoredSupabaseSession(): boolean {
  try {
    const ref = new URL(env.supabaseUrl).hostname.split('.')[0];
    return window.localStorage.getItem(`sb-${ref}-auth-token`) !== null;
  } catch {
    return false;
  }
}
