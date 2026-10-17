'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { ResultScreen } from '@/components/sim/result-screen';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, Skeleton } from '@/components/hud/primitives';
import { useCommands } from '@/lib/sim/commands';
import { useSimLoop } from '@/lib/sim/use-sim-loop';
import { useTrainingSession } from '@/lib/sim/use-training-session';
import { useUiStore } from '@/lib/sim/ui-store';

// WebGL only exists in the browser.
const SimPlayer = dynamic(() => import('@/components/sim/player').then((m) => m.SimPlayer), {
  ssr: false,
  loading: () => <Skeleton label="Loading 3D view" className="p-6" />,
});

function Session({ sessionId }: { sessionId: string }) {
  const { phase, upload, start, finish, recordFrame } = useTrainingSession(sessionId);
  const runtime = phase.kind === 'running' || phase.kind === 'submitting' ? phase.runtime : null;
  const commands = useCommands(runtime);
  // The briefing page created this session with Begin, so it starts straight away
  // (once: StrictMode runs effects twice in development).
  const started = useRef(false);
  useEffect(() => {
    if (phase.kind !== 'briefing' || started.current) return;
    started.current = true;
    void start();
  }, [phase.kind, start]);
  useSimLoop(phase.kind === 'running' ? phase.runtime : null, finish, recordFrame);

  const eoFov = useMemo(() => {
    const eo = runtime?.scenario.sensors.find((s) => s.kind === 'EO_IR');
    return eo?.kind === 'EO_IR' ? eo.fovDegMax : 30;
  }, [runtime]);
  useEffect(() => {
    if (runtime)
      useUiStore.getState().reset({
        azDeg: 0,
        elDeg: 0,
        hfovDeg: eoFov,
        lockTrackId: null,
        mode: 'DAY',
        trackMode: 'MANUAL',
      });
  }, [runtime, eoFov]);
  // Playwright hook (decision 67): never part of a production build, and only
  // under automation (navigator.webdriver), because it holds the sim at t = 0
  // until a test steps it.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !runtime || !navigator.webdriver) return;
    let uninstall: (() => void) | undefined;
    let live = true;
    void import('@/lib/e2e/hook').then((m) => {
      if (live) uninstall = m.installE2EHook(runtime);
    });
    return () => {
      live = false;
      uninstall?.();
    };
  }, [runtime]);

  switch (phase.kind) {
    case 'loading':
      return <Skeleton label="Loading session" className="p-6" />;
    case 'briefing':
    case 'preparing':
      return <Skeleton label="Loading terrain and sensors" className="p-6" />;
    case 'running':
      return commands ? (
        <SimPlayer runtime={phase.runtime} commands={commands} upload={upload} />
      ) : null;
    case 'submitting':
      return (
        <Skeleton
          label="Session over · uploading events and scoring on the server"
          className="p-6"
        />
      );
    case 'result':
      return (
        <ResultScreen
          score={phase.score}
          scenarioName={phase.scenarioName}
          scenarioId={phase.scenarioId}
          mode={phase.mode}
          ended={phase.ended}
        />
      );
    case 'interrupted':
      return (
        <Panel className="mx-auto max-w-xl">
          <PanelBody className="space-y-3 pt-4 text-body">
            <p>
              This session was interrupted (the page was reloaded or closed mid-run) and cannot be
              resumed.
            </p>
            <Button asChild variant="primary">
              <Link href="/train">Start a new session</Link>
            </Button>
          </PanelBody>
        </Panel>
      );
    case 'error':
      return (
        <Panel className="mx-auto max-w-xl">
          <PanelBody className="space-y-3 pt-4 text-body">
            <p className="text-crit">{phase.message}</p>
            <div className="flex gap-2">
              {phase.retry && (
                <Button variant="primary" onClick={phase.retry}>
                  Retry
                </Button>
              )}
              <Button asChild variant="secondary">
                <Link href="/train">Back to scenarios</Link>
              </Button>
            </div>
          </PanelBody>
        </Panel>
      );
  }
}

export default function SessionPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <Session sessionId={id} />
    </RequireAuth>
  );
}
