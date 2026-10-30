'use client';

import type { MeResponse } from '@vyuh/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, setTokenGetter } from './api-core';
import { writeGuardCookies } from './route-guard';
import { invalidate } from './use-api-data';
import { env } from './env';
import { getSupabase, hasStoredSupabaseSession } from './supabase';

const LOCAL_TOKEN_KEY = 'vyuh.localToken';
/** Guest demo token (POST /auth/guest, Phase 6E): used in either auth mode while present. */
const GUEST_TOKEN_KEY = 'vyuh.guestToken';

type AuthStatus = 'loading' | 'authenticated' | 'anonymous';

interface AuthContextValue {
  mode: 'local' | 'supabase';
  status: AuthStatus;
  user: MeResponse | null;
  error: string | null;
  /** AUTH_MODE=local only. */
  loginDev: (email: string) => Promise<void>;
  /** AUTH_MODE=supabase only. */
  loginSupabase: (email: string, password: string) => Promise<void>;
  /** "Try the demo" (NEXT_PUBLIC_GUEST_MODE): a short-lived guest account from the API. */
  loginGuest: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readToken(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeToken(key: string, token: string | null): void {
  try {
    if (token) window.localStorage.setItem(key, token);
    else window.localStorage.removeItem(key);
  } catch {
    // storage unavailable (private mode) — session lasts until reload
  }
}

/** The API client (zod and the shared schemas) loads on first call, not with every page. */
const loadApi = () => import('./api').then((m) => m.api);

const readLocalToken = () => readToken(LOCAL_TOKEN_KEY);
const writeLocalToken = (t: string | null) => writeToken(LOCAL_TOKEN_KEY, t);

async function currentToken(): Promise<string | null> {
  const guest = readToken(GUEST_TOKEN_KEY);
  if (guest) return guest;
  if (env.authMode === 'local') return readLocalToken();
  if (!hasStoredSupabaseSession()) return null;
  const { data } = await (await getSupabase()).auth.getSession();
  return data.session?.access_token ?? null;
}

function describe(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unexpected error';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<MeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!(await currentToken())) {
      writeGuardCookies(null);
      setUser(null);
      setStatus('anonymous');
      return;
    }
    try {
      const me = await (await loadApi()).me();
      writeGuardCookies(me.role);
      setUser(me);
      setStatus('authenticated');
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED') {
        // An expired guest goes back to the public pages; a stale local token is dropped.
        writeToken(GUEST_TOKEN_KEY, null);
        if (env.authMode === 'local') writeLocalToken(null);
      }
      setUser(null);
      setStatus('anonymous');
      setError(describe(err));
    }
  }, []);

  // Supabase auth events, watched once the client is loaded: at mount when a
  // session is stored, else after signing in.
  const unwatch = useRef<(() => void) | null>(null);
  const watchSupabase = useCallback(async () => {
    if (unwatch.current) return;
    unwatch.current = () => undefined;
    const { data } = (await getSupabase()).auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        void refresh();
      }
    });
    unwatch.current = () => data.subscription.unsubscribe();
  }, [refresh]);

  useEffect(() => {
    setTokenGetter(currentToken);
    // Initial session check after mount; refresh() sets state once the API answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    if (env.authMode === 'supabase' && hasStoredSupabaseSession()) void watchSupabase();
    return () => {
      unwatch.current?.();
      unwatch.current = null;
    };
  }, [refresh, watchSupabase]);

  const loginDev = useCallback(
    async (email: string) => {
      setError(null);
      try {
        const token = await (await loadApi()).devLogin(email);
        writeLocalToken(token.accessToken);
      } catch (err) {
        setError(describe(err));
        throw err;
      }
      await refresh();
    },
    [refresh],
  );

  const loginSupabase = useCallback(
    async (email: string, password: string) => {
      setError(null);
      const { error: authError } = await (
        await getSupabase()
      ).auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        throw authError;
      }
      void watchSupabase();
      await refresh();
    },
    [refresh, watchSupabase],
  );

  const loginGuest = useCallback(async () => {
    setError(null);
    try {
      const token = await (await loadApi()).guestLogin();
      writeToken(GUEST_TOKEN_KEY, token.accessToken);
    } catch (err) {
      setError(describe(err));
      throw err;
    }
    await refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    invalidate();
    writeGuardCookies(null);
    writeToken(GUEST_TOKEN_KEY, null);
    if (env.authMode === 'local') writeLocalToken(null);
    else if (hasStoredSupabaseSession()) await (await getSupabase()).auth.signOut();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      mode: env.authMode,
      status,
      user,
      error,
      loginDev,
      loginSupabase,
      loginGuest,
      logout,
    }),
    [status, user, error, loginDev, loginSupabase, loginGuest, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
