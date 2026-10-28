// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced literally.
// Checked by hand rather than with zod: every page imports this module, and zod
// would put ~60 KB gzipped on pages that never call the API (Phase 6F).

export interface PublicEnv {
  apiUrl: string;
  authMode: 'local' | 'supabase';
  supabaseUrl: string;
  supabaseAnonKey: string;
  guestMode: boolean;
}

function parsePublicEnv(raw: {
  apiUrl: string;
  authMode: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  guestMode: boolean;
}): PublicEnv {
  if (!URL.canParse(raw.apiUrl)) throw new Error(`NEXT_PUBLIC_API_URL is not a URL: ${raw.apiUrl}`);
  if (raw.authMode !== 'local' && raw.authMode !== 'supabase') {
    throw new Error(`NEXT_PUBLIC_AUTH_MODE must be "local" or "supabase", got "${raw.authMode}"`);
  }
  if (raw.authMode === 'supabase' && (raw.supabaseUrl === '' || raw.supabaseAnonKey === '')) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required in supabase mode',
    );
  }
  return { ...raw, authMode: raw.authMode };
}

export const env: PublicEnv = parsePublicEnv({
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, ''),
  authMode: process.env.NEXT_PUBLIC_AUTH_MODE ?? 'local',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  guestMode: process.env.NEXT_PUBLIC_GUEST_MODE === 'true',
});
