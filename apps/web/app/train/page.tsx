'use client';

import type { ScenarioListItem, SessionMode } from '@vyuh/shared';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ROE_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';

function OperatorCard() {
  const { user } = useAuth();
  if (!user) return null;
  const rows: [string, string][] = [
    ['Name', user.name],
    ['Email', user.email ?? '—'],
    ['Unit', user.unit?.name ?? 'Unassigned'],
  ];
  return (
    <Card>
      <CardHeader className="flex items-center justify-between">
        <CardTitle>Operator</CardTitle>
        <Badge tone="primary" data-testid="role">
          {user.role}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="hud-label self-center">{k}</dt>
              <dd className="font-mono" data-testid={`user-${k.toLowerCase()}`}>
                {v}
              </dd>
            </div>
          ))}
          <dt className="hud-label self-center">Rating</dt>
          <dd className="num">{user.rating}</dd>
        </dl>
      </CardContent>
    </Card>
  );
}

const MODES: { value: SessionMode; label: string; hint: string }[] = [
  { value: 'PRACTICE', label: 'Practice', hint: 'Pause allowed' },
  { value: 'ASSESSMENT', label: 'Assessment', hint: 'Fixed clock, no pause' },
];

function ScenarioList() {
  const router = useRouter();
  const [items, setItems] = useState<ScenarioListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SessionMode>('PRACTICE');
  const [starting, setStarting] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .listScenarios(ctrl.signal)
      .then((r) => setItems(r.items))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Failed to load');
      });
    return () => ctrl.abort();
  }, []);

  const begin = async (scenarioId: string) => {
    setStarting(scenarioId);
    try {
      const { sessionId } = await api.createSession(scenarioId, mode);
      router.push(`/train/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session');
      setStarting(null);
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <CardTitle>Scenarios</CardTitle>
        <div className="flex gap-1" role="radiogroup" aria-label="Session mode">
          {MODES.map((m) => (
            <button
              key={m.value}
              role="radio"
              aria-checked={mode === m.value}
              title={m.hint}
              onClick={() => setMode(m.value)}
              className={cn(
                'rounded-sm border px-2 py-0.5 font-mono text-xs uppercase',
                mode === m.value
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-destructive">{error}</p>}
        {items === null && !error && <p className="hud-label">Loading scenarios…</p>}
        {items?.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No scenarios yet. Run the seed: <code>uv run python -m app.seed.demo</code>
          </p>
        )}
        {items?.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 border border-border p-2"
            data-testid={`scenario-${s.code ?? s.id}`}
          >
            <div className="min-w-0">
              <div className="font-mono text-sm font-bold">
                {s.code && <span className="text-primary">{s.code} · </span>}
                {s.name}
              </div>
              <div className="hud-label">
                Difficulty {s.difficulty} · {Math.round(s.durationS / 60)} min · {ROE_LABEL[s.roe]}
                {s.isNight ? ' · night' : ''}
              </div>
            </div>
            <Button size="sm" disabled={starting !== null} onClick={() => void begin(s.id)}>
              {starting === s.id ? 'Starting…' : 'Start'}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default function TrainPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <h1 className="font-mono text-xl font-semibold uppercase tracking-[0.2em]">Training</h1>
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <OperatorCard />
          <ScenarioList />
        </div>
      </div>
    </RequireAuth>
  );
}
