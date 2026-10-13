'use client';

import type { MeResponse } from '@vyuh/shared';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ApiError, api, setTokenGetter } from './api';
import { env } from './env';
import { getSupabase } from './supabase';

const LOCAL_TOKEN_KEY = 'vyuh.localToken';

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
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function readLocalToken(): string | null {
  try {
    return window.localStorage.getItem(LOCAL_TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeLocalToken(token: string | null): void {
  try {
    if (token) window.localStorage.setItem(LOCAL_TOKEN_KEY, token);
    else window.localStorage.removeItem(LOCAL_TOKEN_KEY);
  } catch {
    // storage unavailable (private mode) — session lasts until reload
  }
}

async function currentToken(): Promise<string | null> {
  if (env.authMode === 'local') return readLocalToken();
  const { data } = await getSupabase().auth.getSession();
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
      setUser(null);
      setStatus('anonymous');
      return;
    }
    try {
      setUser(await api.me());
      setStatus('authenticated');
      setError(null);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'UNAUTHORIZED' && env.authMode === 'local') {
        writeLocalToken(null);
      }
      setUser(null);
      setStatus('anonymous');
      setError(describe(err));
    }
  }, []);

  useEffect(() => {
    setTokenGetter(currentToken);
    // Initial session check after mount; refresh() sets state once the API answers.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh();
    if (env.authMode !== 'supabase') return;
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'TOKEN_REFRESHED') {
        void refresh();
      }
    });
    return () => data.subscription.unsubscribe();
  }, [refresh]);

  const loginDev = useCallback(
    async (email: string) => {
      setError(null);
      try {
        const token = await api.devLogin(email);
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
      const { error: authError } = await getSupabase().auth.signInWithPassword({ email, password });
      if (authError) {
        setError(authError.message);
        throw authError;
      }
      await refresh();
    },
    [refresh],
  );

  const logout = useCallback(async () => {
    if (env.authMode === 'local') writeLocalToken(null);
    else await getSupabase().auth.signOut();
    setUser(null);
    setStatus('anonymous');
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ mode: env.authMode, status, user, error, loginDev, loginSupabase, logout }),
    [status, user, error, loginDev, loginSupabase, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
