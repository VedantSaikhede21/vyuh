'use client';

import type { AarSessionResponse } from '@vyuh/shared';
import { SIM_VERSION, type World } from '@vyuh/sim-core';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { FallbackView } from '@/components/aar/fallback-view';
import { Panel, PanelBody, Skeleton } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { replayGate, type ReplayGate } from '@/lib/replay/gate';
import { useKeyframes } from '@/lib/replay/use-keyframes';
import { loadWorld } from '@/lib/terrain/load-world';

// WebGL only exists in the browser.
const ReplayView = dynamic(() => import('@/components/aar/replay-view').then((m) => m.ReplayView), {
  ssr: false,
  loading: () => <Skeleton label="Loading 3D view" className="p-6" />,
});

type Loaded = { data: AarSessionResponse; world: World; gate: ReplayGate };

function AarSession({ sessionId, initialTMs }: { sessionId: string; initialTMs: number }) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      const data = await api.getAar(sessionId, ctrl.signal);
      const world = await loadWorld(data.scenario.terrain.preset);
      // Built-in presets have no meta file: revision 1, as the server records it.
      const gate = replayGate(data.session, SIM_VERSION, world.meta?.revision ?? 1);
      setLoaded({ data, world, gate });
    })().catch((err: unknown) => {
      if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Network error');
    });
    return () => ctrl.abort();
  }, [sessionId]);

  const kf = useKeyframes(loaded?.gate.ok ? loaded.data : null);

  if (error) {
    return (
      <Panel className="mx-auto max-w-xl">
        <PanelBody className="space-y-3 pt-4 text-body">
          <p className="text-crit">Could not open the after-action review: {error}</p>
          <Button asChild>
            <Link href="/train">Back to training</Link>
          </Button>
        </PanelBody>
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
          initialTMs={initialTMs}
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
  const t = Number(useSearchParams().get('t'));
  return <AarSession sessionId={id} initialTMs={Number.isFinite(t) && t > 0 ? t : 0} />;
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
