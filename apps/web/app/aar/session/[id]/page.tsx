'use client';

import type { AarSessionResponse } from '@vyuh/shared';
import { SIM_VERSION, type World } from '@vyuh/sim-core';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { FallbackView } from '@/components/aar/fallback-view';
import { ErrorState, Panel, Skeleton } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { initialReplayTime, replayGate, type ReplayGate } from '@/lib/replay/gate';
import { useKeyframes } from '@/lib/replay/use-keyframes';
import { loadWorld } from '@/lib/terrain/load-world';

// WebGL only exists in the browser.
const ReplayView = dynamic(() => import('@/components/aar/replay-view').then((m) => m.ReplayView), {
  ssr: false,
  loading: () => <Skeleton label="Loading 3D view" className="p-6" />,
});

type Loaded = { data: AarSessionResponse; world: World; gate: ReplayGate };

function AarSession({
  sessionId,
  start,
}: {
  sessionId: string;
  /** `?t=` (ms) or `?penalty=` (index into the score's penalties). */
  start: { t: string | null; penalty: string | null };
}) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<unknown>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const data = await api.getAar(sessionId, ctrl.signal);
      const world = await loadWorld(data.scenario.terrain.preset);
      // Built-in presets have no meta file: revision 1, as the server records it.
      const gate = replayGate(data.session, SIM_VERSION, world.meta?.revision ?? 1);
      setLoaded({ data, world, gate });
    })().catch((err: unknown) => {
      if (!ctrl.signal.aborted) setError(err);
    });
    return () => ctrl.abort();
  }, [sessionId]);

  const kf = useKeyframes(loaded?.gate.ok ? loaded.data : null);

  if (error !== null) {
    return (
      <Panel className="max-w-xl">
        <ErrorState
          error={error}
          subject="after-action review"
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/aar/trends">Open after-action</Link>
            </Button>
          }
        />
      </Panel>
    );
  }
  if (!loaded) return <Skeleton label="Loading after-action review" className="p-6" />;
  const { data, world, gate } = loaded;
  if (!gate.ok) return <FallbackView data={data} why={gate.why} />;
  switch (kf.status) {
    case 'idle':
    case 'running':
      return (
        <Skeleton
          label={`Preparing replay · checking it against the recorded session · ${Math.round(
            (kf.status === 'running' ? kf.progress : 0) * 100,
          )}%`}
          className="p-6"
        />
      );
    case 'error':
      return <FallbackView data={data} why={`The replay could not be prepared: ${kf.message}.`} />;
    case 'done':
      return kf.result.check.ok ? (
        <ReplayView
          data={data}
          world={world}
          keyframes={kf.result.keyframes}
          initialTMs={initialReplayTime(
            start,
            data.session.score,
            data.killChain,
            data.events,
          )}
        />
      ) : (
        <FallbackView
          data={data}
          why={`The replay did not reproduce the recorded session (${kf.result.check.reason}).`}
        />
      );
  }
}

function WithParams() {
  const { id } = useParams<{ id: string }>();
  const q = useSearchParams();
  const t = q.get('t');
  const penalty = q.get('penalty');
  const start = useMemo(() => ({ t, penalty }), [t, penalty]);
  return <AarSession sessionId={id} start={start} />;
}

export default function AarSessionPage() {
  return (
    <RequireAuth>
      <Suspense fallback={<Skeleton label="Loading after-action review" className="p-6" />}>
        <WithParams />
      </Suspense>
    </RequireAuth>
  );
}
