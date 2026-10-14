'use client';

import type { SessionMode } from '@vyuh/shared';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { ResultScreen } from '@/components/sim/result-screen';
import { Button } from '@/components/ui/button';
import { Kbd, Panel, PanelBody, Skeleton, StateChip } from '@/components/hud/primitives';
import { useCommands } from '@/lib/sim/commands';
import { useSimLoop } from '@/lib/sim/use-sim-loop';
import { useTrainingSession } from '@/lib/sim/use-training-session';
import { useUiStore } from '@/lib/sim/ui-store';
import { ROE_LABEL } from '@/lib/strings';

// WebGL only exists in the browser.
const SimPlayer = dynamic(() => import('@/components/sim/player').then((m) => m.SimPlayer), {
  ssr: false,
  loading: () => <Skeleton label="Loading 3D view" className="p-6" />,
});

/** Split simple briefing markdown into `## Heading` sections. */
function sections(md: string): { title: string; lines: string[] }[] {
  const out: { title: string; lines: string[] }[] = [];
  for (const line of md.split('\n')) {
    if (line.startsWith('## ')) out.push({ title: line.slice(3).trim(), lines: [] });
    else if (line.trim()) {
      if (out.length === 0) out.push({ title: '', lines: [] });
      out.at(-1)!.lines.push(line);
    }
  }
  return out;
}

/** Pre-mission briefing (restyle only; the map briefing of DESIGN §11.4 is Phase 3b). */
function Briefing({
  name,
  briefing,
  mode,
  roe,
  onStart,
}: {
  name: string;
  briefing: string;
  mode: SessionMode;
  roe: keyof typeof ROE_LABEL;
  onStart: () => void;
}) {
  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1">
        <p className="text-label">Briefing</p>
        <h1 className="text-h1">{name}</h1>
        <div className="flex gap-2">
          <StateChip>{ROE_LABEL[roe]}</StateChip>
          <StateChip tone="muted">{mode}</StateChip>
        </div>
      </div>
      <Panel>
        <PanelBody className="space-y-4">
          {sections(briefing).map((sec, i) =>
            sec.title.toUpperCase() === 'ROE' ? (
              <section key={i} className="border border-line-2 bg-bg-2 p-3">
                <h2 className="text-panel-title text-text-1">Rules of engagement</h2>
                {sec.lines.map((l, k) => (
                  <p key={k} className="text-body">
                    {l}
                  </p>
                ))}
              </section>
            ) : (
              <section key={i} className="space-y-1">
                {sec.title && <h2 className="text-label">{sec.title}</h2>}
                {sec.lines.map((l, k) => (
                  <p key={k} className="text-body">
                    {l}
                  </p>
                ))}
              </section>
            ),
          )}
        </PanelBody>
      </Panel>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="primary" onClick={onStart} autoFocus data-testid="start-session">
          Begin <Kbd className="border-primary-fg/40 text-primary-fg">Enter</Kbd>
        </Button>
        <p className="text-small text-text-2">
          <Kbd>?</Kbd> shows every shortcut during the session.{' '}
          {mode === 'ASSESSMENT'
            ? 'Assessment runs on a fixed clock with no pause.'
            : 'Practice: P pauses.'}
        </p>
      </div>
    </div>
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
  // Playwright hook (decision 67): never part of a production build.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production' || !runtime) return;
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
