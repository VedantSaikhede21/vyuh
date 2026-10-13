import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

let client: SupabaseClient | null = null;

/** Browser Supabase client (auth only — the API owns all DB access, SPEC §10). */
export function getSupabase(): SupabaseClient {
  if (env.authMode !== 'supabase') {
    throw new Error('Supabase client requested while NEXT_PUBLIC_AUTH_MODE is not "supabase"');
  }
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}
