'use client';

import { useCallback, useEffect, useState } from 'react';

interface Entry {
  data: unknown;
  at: number;
}

const TTL_MS = 30_000;
const entries = new Map<string, Entry>();
const inflight = new Map<string, Promise<unknown>>();

/**
 * Forget cached resources whose key starts with `prefix` (S6): call after a
 * mutation. Without a prefix, forgets everything (sign-out, user change).
 */
export function invalidate(prefix = ''): void {
  for (const key of [...entries.keys()]) {
    if (key.startsWith(prefix)) entries.delete(key);
  }
  for (const key of [...inflight.keys()]) {
    if (key.startsWith(prefix)) inflight.delete(key);
  }
}

/** One shared request per key: two mounts asking at once get one fetch. */
export function loadResource<T>(
  key: string,
  fetcher: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const running = inflight.get(key);
  if (running) return running as Promise<T>;
  const promise = fetcher(new AbortController().signal).then(
    (data) => {
      if (inflight.get(key) === promise) {
        entries.set(key, { data, at: Date.now() });
        inflight.delete(key);
      }
      return data;
    },
    (err: unknown) => {
      if (inflight.get(key) === promise) inflight.delete(key);
      throw err;
    },
  );
  inflight.set(key, promise);
  return promise;
}

/**
 * Load one API resource: data, the last error, and `reload` for the retry button.
 * `key` re-runs the fetch when it changes (null skips loading, e.g. before sign-in).
 *
 * Stale-while-revalidate (S6, decision 165): a cached value shows at once, so
 * navigation doesn't blank to a skeleton; it is refetched when older than the
 * TTL. An error keeps the stale data on screen and reports the error beside it.
 */
export function useApiData<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): { data: T | null; error: unknown; reload: () => void } {
  const [state, setState] = useState<{ key: string | null; data: T | null }>(() => ({
    key,
    data: key === null ? null : ((entries.get(key)?.data as T | undefined) ?? null),
  }));
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  // A new key shows that key's cached value, never the previous key's data.
  // Pre-cache behaviour kept the old data until the new fetch landed; pages key
  // on an id, and the old record under a new id is worse than a skeleton.
  if (state.key !== key) {
    setState({
      key,
      data: key === null ? null : ((entries.get(key)?.data as T | undefined) ?? null),
    });
  }

  useEffect(() => {
    if (key === null) return;
    const cached = entries.get(key);
    const fresh = attempt === 0 && cached !== undefined && Date.now() - cached.at < TTL_MS;
    if (fresh) return;
    if (attempt > 0) entries.delete(key);
    let live = true;
    loadResource(key, fetcher)
      .then((d) => {
        if (!live) return;
        setState({ key, data: d });
        setError(null);
      })
      .catch((err: unknown) => {
        if (live) setError(err);
      });
    return () => {
      live = false;
    };
    // `fetcher` is a fresh closure every render; `key` names what it fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  return { data: state.data, error, reload };
}

/** The cached value for `key`, if any. */
export function cachedResource<T>(key: string): T | undefined {
  return entries.get(key)?.data as T | undefined;
}
