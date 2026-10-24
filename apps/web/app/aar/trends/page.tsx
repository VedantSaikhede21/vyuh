'use client';

import type { TraineeTrendsResponse } from '@vyuh/shared';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { TrendsView } from '@/components/aar/trends-view';
import { ErrorState, PageHeader, Panel, Skeleton } from '@/components/hud/primitives';
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
  const [error, setError] = useState<unknown>(null);
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
        if (!ctrl.signal.aborted) setError(err);
      });
    return () => ctrl.abort();
  }, [userId, attempt]);

  const own = data !== null && data.user.id === user?.id;
  return (
    <div className="space-y-6">
      <PageHeader
        {...(staff && !own && data
          ? {
              crumbs: [{ label: 'Unit', href: '/instructor' }, { label: 'Trainee trends' }],
            }
          : { reference: 'After-action · trends over Assessment sessions' })}
        title={data ? (own ? 'My trends' : data.user.name) : 'Trends'}
        {...(data?.user.unitName ? { context: data.user.unitName } : {})}
      />
      {error !== null && (
        <Panel>
          <ErrorState
            error={error}
            subject="trends page"
            onRetry={() => {
              setError(null);
              reload();
            }}
          />
        </Panel>
      )}
      {!data && error === null && <Skeleton label="Loading trends" />}
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
