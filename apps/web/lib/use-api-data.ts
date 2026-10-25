'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Load one API resource: data, the last error, and `reload` for the retry button.
 * `key` re-runs the fetch when it changes (null skips loading, e.g. before sign-in).
 */
export function useApiData<T>(
  key: string | null,
  fetcher: (signal: AbortSignal) => Promise<T>,
): { data: T | null; error: unknown; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => {
    setError(null);
    setAttempt((a) => a + 1);
  }, []);

  useEffect(() => {
    if (key === null) return;
    const ctrl = new AbortController();
    fetcher(ctrl.signal)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err);
      });
    return () => ctrl.abort();
    // `fetcher` is a fresh closure every render; `key` names what it fetches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, attempt]);

  return { data, error, reload };
}
