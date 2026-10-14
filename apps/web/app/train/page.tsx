'use client';

import type { ScenarioListItem, SessionMode, TerrainPresetMeta } from '@vyuh/shared';
import { isNightAt } from '@vyuh/sim-core';
import { Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import {
  Panel,
  PanelBody,
  PanelHeader,
  Pips,
  Readout,
  Skeleton,
  StatusNotice,
  Tooltip,
} from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { Badge } from '@/components/ui/badge';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { loadPresetMeta } from '@/lib/terrain/load-world';
import { ROE_LABEL } from '@/lib/strings';
import { cn } from '@/lib/utils';

function OperatorPanel() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Panel>
      <PanelHeader title="Operator">
        <Badge tone="strong" data-testid="role">
          {user.role}
        </Badge>
      </PanelHeader>
      <PanelBody className="space-y-3">
        <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5 text-body">
          <dt className="text-label self-center">Name</dt>
          <dd data-testid="user-name">{user.name}</dd>
          <dt className="text-label self-center">Email</dt>
          <dd className="truncate" data-testid="user-email">
            {user.email ?? '—'}
          </dd>
          <dt className="text-label self-center">Unit</dt>
          <dd data-testid="user-unit">{user.unit?.name ?? 'Unassigned'}</dd>
        </dl>
        <Readout label="Rating" value={user.rating} flash={false} />
      </PanelBody>
    </Panel>
  );
}

const MODES: { value: SessionMode; label: string; hint: string }[] = [
  { value: 'PRACTICE', label: 'Practice', hint: 'Pause allowed' },
  { value: 'ASSESSMENT', label: 'Assessment', hint: 'Fixed clock, no pause' },
];

function ModeToggle({ mode, onChange }: { mode: SessionMode; onChange: (m: SessionMode) => void }) {
  return (
    <div className="flex" role="radiogroup" aria-label="Session mode">
      {MODES.map((m) => (
        <Tooltip key={m.value} content={m.hint} side="bottom" align="end">
          <button
            role="radio"
            aria-checked={mode === m.value}
            onClick={() => onChange(m.value)}
            className={cn(
              'h-6 border px-2 text-label transition-colors duration-150 ease-ui first:rounded-l-sm last:rounded-r-sm',
              mode === m.value
                ? 'border-select bg-bg-3 text-text-1'
                : 'border-line-2 hover:text-text-1',
            )}
          >
            {m.label}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}

const TH = 'h-7 bg-bg-2 px-3 text-left text-label font-medium whitespace-nowrap';
const TD = 'h-8 px-3 whitespace-nowrap';

/** Scenario table (DESIGN §11.3, restyle; the full redesign is Phase 3b). */
function ScenarioTable() {
  const router = useRouter();
  const [items, setItems] = useState<ScenarioListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<SessionMode>('PRACTICE');
  const [starting, setStarting] = useState<string | null>(null);
  const [metas, setMetas] = useState<Record<string, TerrainPresetMeta>>({});

  const fetchList = useCallback((signal?: AbortSignal) => {
    api
      .listScenarios(signal)
      .then((r) => setItems(r.items))
      .catch((err: unknown) => {
        if (!signal?.aborted) setError(err instanceof Error ? err.message : 'Network error');
      });
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchList(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchList]);

  const retry = () => {
    setError(null);
    setItems(null);
    fetchList();
  };

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
    if (starting) return;
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
    <Panel>
      <PanelHeader title="Scenarios">
        <ModeToggle mode={mode} onChange={setMode} />
      </PanelHeader>
      {error && (
        <StatusNotice tone="error" title="Could not load scenarios." onRetry={retry}>
          {error}. Check that the API is running, then retry.
        </StatusNotice>
      )}
      {items === null && !error && <Skeleton label="Loading scenarios" />}
      {items?.length === 0 && (
        <StatusNotice title="No scenarios yet.">
          An administrator seeds them with <code>uv run python -m app.seed.demo</code>.
        </StatusNotice>
      )}
      {items && items.length > 0 && (
        <table className="w-full border-collapse" aria-label="Scenarios">
          <thead>
            <tr>
              <th className={TH}>Code</th>
              <th className={cn(TH, 'w-full')}>Scenario</th>
              <th className={TH}>Difficulty</th>
              <th className={TH}>Light</th>
              <th className={TH}>ROE</th>
              <th className={cn(TH, 'text-right')}>Duration</th>
            </tr>
          </thead>
          <tbody>
            {items.map((s) => {
              const night = isNight(s);
              const busy = starting === s.id;
              return (
                <tr
                  key={s.id}
                  data-testid={`scenario-${s.code ?? s.id}`}
                  onClick={() => void begin(s.id)}
                  className={cn(
                    'cursor-pointer border-t border-line-1 transition-colors duration-150 ease-ui hover:bg-bg-2',
                    busy && 'bg-bg-3',
                  )}
                >
                  <td className={cn(TD, 'text-readout text-text-2')}>{s.code ?? '—'}</td>
                  <td className={cn(TD, 'text-body')}>
                    {/* The row is clickable; this button gives keyboard users the same action. */}
                    <button
                      type="button"
                      className="text-left text-text-1 hover:underline"
                      onClick={(e) => {
                        e.stopPropagation();
                        void begin(s.id);
                      }}
                      disabled={starting !== null}
                      aria-label={`Open the briefing for ${s.name}`}
                    >
                      {s.name}
                    </button>
                    {busy && <span className="ml-2 text-small text-text-2">Opening briefing…</span>}
                    {s.tags.includes('test') && (
                      <Badge className="ml-2" tone="default">
                        Test
                      </Badge>
                    )}
                  </td>
                  <td className={TD}>
                    <Pips value={s.difficulty} />
                  </td>
                  <td className={cn(TD, 'text-body text-text-2')}>
                    <span className="flex items-center gap-1.5">
                      {night ? (
                        <Moon size={16} strokeWidth={1.5} aria-hidden />
                      ) : (
                        <Sun size={16} strokeWidth={1.5} aria-hidden />
                      )}
                      {night ? 'Night' : 'Day'}
                    </span>
                  </td>
                  <td className={cn(TD, 'text-label text-text-1')}>{ROE_LABEL[s.roe]}</td>
                  <td className={cn(TD, 'text-right text-readout')}>
                    {Math.round(s.durationS / 60)}
                    <span className="text-text-3"> min</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

export default function TrainPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-h1">Training</h1>
          <p className="text-body text-text-2">Choose a scenario to open its briefing.</p>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
          <OperatorPanel />
          <ScenarioTable />
        </div>
      </div>
    </RequireAuth>
  );
}
