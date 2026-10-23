'use client';

import type { TraineeTrendsResponse } from '@vyuh/shared';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { TrendsView } from '@/components/aar/trends-view';
import { Panel, Skeleton, StatusNotice } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

// /aar/trends — your own trends; `?user=<id>` for an instructor's drill-down.

function Trends() {
  const { user } = useAuth();
  const params = useSearchParams();
  const userId = params.get('user') ?? user?.id ?? null;
  const staff = user?.role === 'INSTRUCTOR' || user?.role === 'ADMIN';
  const [data, setData] = useState<TraineeTrendsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);

  useEffect(() => {
    if (!userId) return;
    const ctrl = new AbortController();
    api
      .trends(userId, ctrl.signal)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Network error');
      });
    return () => ctrl.abort();
  }, [userId, attempt]);

  const own = data !== null && data.user.id === user?.id;
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <p className="text-label">
          {staff && !own ? (
            <>
              <Link href="/instructor" className="hover:text-text-1">
                Unit
              </Link>{' '}
              / Trainee trends
            </>
          ) : (
            'After-action review / Trends'
          )}
        </p>
        <h1 className="text-h1">
          {data ? (own ? 'My trends' : data.user.name) : 'Trends'}
          {data?.user.unitName && (
            <span className="ml-3 text-body text-text-2">{data.user.unitName}</span>
          )}
        </h1>
      </div>
      {error && (
        <Panel>
          <StatusNotice
            tone="error"
            title="Could not load trends."
            onRetry={() => {
              setError(null);
              reload();
            }}
          >
            {error}. Check that the API is running, then retry.
          </StatusNotice>
        </Panel>
      )}
      {!data && !error && <Skeleton label="Loading trends" />}
      {data && <TrendsView data={data} staff={staff} onReload={reload} />}
    </div>
  );
}

export default function TrendsPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Skeleton label="Loading trends" />}>
        <Trends />
      </Suspense>
    </RequireAuth>
  );
}
