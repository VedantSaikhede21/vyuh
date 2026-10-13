import { z } from 'zod';

// NEXT_PUBLIC_* values are inlined at build time, so each must be referenced literally.
const PublicEnv = z
  .object({
    apiUrl: z.url(),
    authMode: z.enum(['local', 'supabase']),
    supabaseUrl: z.string(),
    supabaseAnonKey: z.string(),
    guestMode: z.boolean(),
  })
  .refine((e) => e.authMode === 'local' || (e.supabaseUrl !== '' && e.supabaseAnonKey !== ''), {
    message: 'NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required in supabase mode',
  });

export type PublicEnv = z.infer<typeof PublicEnv>;

export const env: PublicEnv = PublicEnv.parse({
  apiUrl: (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000/api/v1').replace(/\/$/, ''),
  authMode: process.env.NEXT_PUBLIC_AUTH_MODE ?? 'local',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  guestMode: process.env.NEXT_PUBLIC_GUEST_MODE === 'true',
});
