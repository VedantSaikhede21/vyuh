'use client';

import type { ScenarioListItem, SessionMode, TerrainPresetMeta } from '@vyuh/shared';
import { isNightAt } from '@vyuh/sim-core';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { RequireAuth } from '@/components/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import { loadPresetMeta } from '@/lib/terrain/load-world';
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
        <Badge tone="strong" data-testid="role">
          {user.role}
        </Badge>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-body">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-label self-center">{k}</dt>
              <dd className="font-mono" data-testid={`user-${k.toLowerCase()}`}>
                {v}
              </dd>
            </div>
          ))}
          <dt className="text-label self-center">Rating</dt>
          <dd className="font-mono tnum">{user.rating}</dd>
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
  const [metas, setMetas] = useState<Record<string, TerrainPresetMeta>>({});

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

  // Night is computed from the preset meta (as in the sim); the stored flag shows until it loads.
  useEffect(() => {
    if (!items) return;
    let live = true;
    for (const preset of new Set(items.map((s) => s.terrainPreset))) {
      loadPresetMeta(preset)
        .then((meta) => {
          if (live) setMetas((m) => ({ ...m, [preset]: meta }));
        })
        .catch(() => undefined);
    }
    return () => {
      live = false;
    };
  }, [items]);

  const isNight = (s: ScenarioListItem): boolean => {
    const meta = metas[s.terrainPreset];
    return meta ? isNightAt(s.date, s.time, meta) : s.isNight;
  };

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
                'rounded-sm border px-2 py-0.5 text-readout uppercase',
                mode === m.value
                  ? 'border-select bg-primary-bg text-primary-fg'
                  : 'border-line-1 text-text-2 hover:text-text-1',
              )}
            >
              {m.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-body text-crit">{error}</p>}
        {items === null && !error && <p className="text-label">Loading scenarios…</p>}
        {items?.length === 0 && (
          <p className="text-body text-text-2">
            No scenarios yet. Run the seed: <code>uv run python -m app.seed.demo</code>
          </p>
        )}
        {items?.map((s) => (
          <div
            key={s.id}
            className="flex items-center justify-between gap-3 border border-line-1 p-2"
            data-testid={`scenario-${s.code ?? s.id}`}
          >
            <div className="min-w-0">
              <div className="text-readout">
                {s.code && <span className="text-text-1">{s.code} · </span>}
                {s.name}
              </div>
              <div className="text-label">
                Difficulty {s.difficulty} · {Math.round(s.durationS / 60)} min · {ROE_LABEL[s.roe]}
                {isNight(s) ? ' · night' : ''}
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
        <h1 className="text-h1">Training</h1>
        <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
          <OperatorCard />
          <ScenarioList />
        </div>
      </div>
    </RequireAuth>
  );
}
