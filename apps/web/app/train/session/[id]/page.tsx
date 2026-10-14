'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { ResultScreen } from '@/components/sim/result-screen';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useCommands } from '@/lib/sim/commands';
import { useSimLoop } from '@/lib/sim/use-sim-loop';
import { useTrainingSession } from '@/lib/sim/use-training-session';
import { useUiStore } from '@/lib/sim/ui-store';
import { ROE_LABEL } from '@/lib/strings';

// WebGL only exists in the browser.
const SimPlayer = dynamic(() => import('@/components/sim/player').then((m) => m.SimPlayer), {
  ssr: false,
  loading: () => <p className="hud-label p-6">Loading 3D view…</p>,
});

function Briefing({
  name,
  briefing,
  mode,
  roe,
  onStart,
}: {
  name: string;
  briefing: string;
  mode: string;
  roe: keyof typeof ROE_LABEL;
  onStart: () => void;
}) {
  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader className="flex items-center justify-between">
        <CardTitle>{name}</CardTitle>
        <span className="hud-label">
          {mode} · {ROE_LABEL[roe]}
        </span>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Briefings are simple markdown; headings and paragraphs are shown as plain text. */}
        <div className="space-y-2 text-sm">
          {briefing.split('\n').map((line, i) =>
            line.startsWith('## ') ? (
              <h3 key={i} className="hud-label pt-2">
                {line.slice(3)}
              </h3>
            ) : (
              <p key={i}>{line}</p>
            ),
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Press <kbd className="font-mono text-primary">?</kbd> during the session for keyboard
          shortcuts.{' '}
          {mode === 'ASSESSMENT'
            ? 'Assessment runs on a fixed clock with no pause.'
            : 'Practice mode: P pauses.'}
        </p>
        <Button onClick={onStart} autoFocus data-testid="start-session">
          Start session
        </Button>
      </CardContent>
    </Card>
  );
}

function Session({ sessionId }: { sessionId: string }) {
  const { phase, upload, start, finish, recordFrame } = useTrainingSession(sessionId);
  const runtime = phase.kind === 'running' || phase.kind === 'submitting' ? phase.runtime : null;
  const commands = useCommands(runtime);
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

  switch (phase.kind) {
    case 'loading':
      return <p className="hud-label p-6">Loading session…</p>;
    case 'briefing':
      return (
        <Briefing
          name={phase.scenario.name}
          briefing={phase.scenario.briefing}
          mode={phase.mode}
          roe={phase.scenario.roe}
          onStart={() => void start()}
        />
      );
    case 'preparing':
      return (
        <p className="hud-label p-6" role="status">
          Loading terrain…
        </p>
      );
    case 'running':
      return commands ? (
        <SimPlayer runtime={phase.runtime} commands={commands} upload={upload} />
      ) : null;
    case 'submitting':
      return (
        <p className="hud-label p-6" role="status">
          Session over. Uploading events and scoring on the server…
        </p>
      );
    case 'result':
      return <ResultScreen score={phase.score} scenarioName={phase.scenarioName} />;
    case 'interrupted':
      return (
        <Card className="mx-auto max-w-xl">
          <CardContent className="space-y-3 pt-4 text-sm">
            <p>
              This session was interrupted (the page was reloaded or closed mid-run) and cannot be
              resumed.
            </p>
            <Button asChild>
              <Link href="/train">Start a new session</Link>
            </Button>
          </CardContent>
        </Card>
      );
    case 'error':
      return (
        <Card className="mx-auto max-w-xl">
          <CardContent className="space-y-3 pt-4 text-sm">
            <p className="text-destructive">{phase.message}</p>
            <div className="flex gap-2">
              {phase.retry && <Button onClick={phase.retry}>Retry</Button>}
              <Button asChild variant="outline">
                <Link href="/train">Back to scenarios</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
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
