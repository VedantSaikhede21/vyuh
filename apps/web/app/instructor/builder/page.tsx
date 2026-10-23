'use client';

import type {
  AuthorPreviewResponse,
  AuthorScenarioRequest,
  FalseContactDensity,
  Roe,
  Scenario,
  ScoringTreeSummary,
  TerrainPresetMeta,
  TimeBand,
  WeatherPreset,
} from '@vyuh/shared';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BriefingMap } from '@/components/briefing/briefing-map';
import {
  Kbd,
  Panel,
  PanelBody,
  PanelHeader,
  Pips,
  Skeleton,
  StateChip,
} from '@/components/hud/primitives';
import { RequireStaff } from '@/components/require-staff';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { DEFAULT_ALTITUDE, sensorSites } from '@/lib/briefing/coverage';
import { sections } from '@/lib/briefing/sections';
import { useCoverage } from '@/lib/briefing/use-coverage';
import { terrainLabel } from '@/lib/scenario/library';
import { CLASS_LABEL, ROE_LABEL } from '@/lib/strings';
import { loadPresetMeta } from '@/lib/terrain/load-world';
import { cn } from '@/lib/utils';

// Scenario builder (SPEC §12 Phase 4, decision 124): a form over the generator's
// request, the asset position and extra NO_KINETIC zones drawn on the 2D briefing
// map, a live preview from POST /scenarios/preview (server-side static checks), and
// Save as AUTHORED, after which the scenario is in the library and assignable.

const PRESETS = ['PUNJAB_PLAINS', 'JK_MOUNTAIN', 'URBAN_GENERIC'] as const;
const TIME_BANDS: TimeBand[] = ['DAY', 'DUSK', 'NIGHT'];
const WEATHER: WeatherPreset[] = ['CLEAR', 'HAZE', 'FOG', 'RAIN'];
const ROES: Roe[] = ['WEAPONS_FREE', 'WEAPONS_TIGHT', 'WEAPONS_HOLD'];
const DENSITY: FalseContactDensity[] = ['LOW', 'MED', 'HIGH'];
const PREVIEW_DELAY_MS = 500;

type Mode = 'view' | 'asset' | 'zone';
type Pt = [number, number];

interface Form {
  name: string;
  note: string;
  terrainPreset: string;
  difficulty: number;
  seed: number;
  timeBand: TimeBand | '';
  weatherPreset: WeatherPreset | '';
  roe: Roe | '';
  density: FalseContactDensity | '';
  swarmSize: string;
  tree: string;
}

const INITIAL: Form = {
  name: 'Canal Bridge',
  note: '',
  terrainPreset: 'PUNJAB_PLAINS',
  difficulty: 3,
  seed: 4242,
  timeBand: '',
  weatherPreset: '',
  roe: '',
  density: '',
  swarmSize: '',
  tree: '',
};

function toRequest(f: Form, asset: Pt | null, zones: { name: string; polygon: Pt[] }[]) {
  const swarm = Number.parseInt(f.swarmSize, 10);
  const req: AuthorScenarioRequest = {
    name: f.name.trim() || 'Untitled',
    generate: {
      terrainPreset: f.terrainPreset,
      difficulty: f.difficulty,
      seed: f.seed,
      ...(f.timeBand && { timeBand: f.timeBand }),
      ...(f.weatherPreset && { weatherPreset: f.weatherPreset }),
      ...(f.roe && { roe: f.roe }),
      ...(f.density && { falseContactDensity: f.density }),
      ...(Number.isInteger(swarm) && swarm >= 1 && { swarmSize: swarm }),
    },
    noKineticZones: zones,
    ...(asset && { assetXz: asset }),
    ...(f.note.trim() && { note: f.note.trim() }),
    ...(f.tree && { scoringTreeId: f.tree }),
  };
  return req;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-label">{label}</span>
      {children}
    </label>
  );
}

function Summary({
  preview,
  scenario,
}: {
  preview: AuthorPreviewResponse | null;
  scenario: Scenario | null;
}) {
  if (!scenario) return null;
  const text = sections(scenario.briefing).filter((s) => s.title.toLowerCase() !== 'assets');
  return (
    <div className="space-y-3">
      <section className="space-y-1">
        <h2 className="text-label">Composition</h2>
        <ul className="text-body">
          {Object.entries(preview?.threatMix ?? {}).map(([cls, n]) => (
            <li key={cls} className="flex justify-between">
              <span>{CLASS_LABEL[cls as keyof typeof CLASS_LABEL] ?? cls}</span>
              <span className="text-readout">{n}</span>
            </li>
          ))}
          <li className="flex justify-between text-text-2">
            <span>Birds, civilian and own drones</span>
            <span className="text-readout">{preview?.nonThreats ?? 0}</span>
          </li>
        </ul>
        <p className="text-small text-text-3">
          {Math.round(scenario.durationS / 60)} min · {scenario.environment.date}{' '}
          {scenario.environment.time} · scoring {scenario.scoringTreeId}
        </p>
      </section>
      {text.map((sec, i) => (
        <section
          key={i}
          className={cn(
            'space-y-1',
            sec.title.toUpperCase() === 'ROE' && 'border border-line-2 bg-bg-2 p-2',
          )}
        >
          {sec.title && <h2 className="text-label">{sec.title}</h2>}
          {sec.lines.map((l, k) => (
            <p key={k} className="text-small">
              {l.replace(/^- /, '')}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

function Builder() {
  const [form, setForm] = useState<Form>(INITIAL);
  const [asset, setAsset] = useState<Pt | null>(null);
  const [zones, setZones] = useState<{ name: string; polygon: Pt[] }[]>([]);
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<Pt[]>([]);
  const [zoneName, setZoneName] = useState('school');
  // The last answer from POST /scenarios/preview, keyed by the request it answers.
  const [result, setResult] = useState<{
    key: string;
    preview: AuthorPreviewResponse | null;
    error: string | null;
  } | null>(null);
  // The last preview that produced a scenario: the map and summary keep showing it
  // while a change fails its checks.
  const [shownPreview, setShownPreview] = useState<AuthorPreviewResponse | null>(null);
  const shown: Scenario | null = shownPreview?.scenario ?? null;
  const [saved, setSaved] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [meta, setMeta] = useState<TerrainPresetMeta | null>(null);
  const [trees, setTrees] = useState<ScoringTreeSummary[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const request = useMemo(() => toRequest(form, asset, zones), [form, asset, zones]);
  const requestKey = useMemo(() => JSON.stringify(request), [request]);
  const loading = result?.key !== requestKey;
  const preview = result?.preview ?? null;
  const netError = result?.error ?? null;
  const set = <K extends keyof Form>(k: K, v: Form[K]) => {
    setSaved(null);
    setForm((f) => ({ ...f, [k]: v }));
  };

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .listTrees(ctrl.signal)
      .then((r) => setTrees(r.items.filter((t) => t.baseId === 'default_v4')))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    let live = true;
    loadPresetMeta(form.terrainPreset)
      .then((m) => live && setMeta(m))
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [form.terrainPreset]);

  useEffect(() => {
    const ctrl = new AbortController();
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      api
        .previewAuthored(request, ctrl.signal)
        .then((p) => {
          setResult({ key: requestKey, preview: p, error: null });
          if (p.scenario) setShownPreview(p);
        })
        .catch((err: unknown) => {
          if (ctrl.signal.aborted) return;
          const error = err instanceof Error ? err.message : 'Network error';
          setResult({ key: requestKey, preview: null, error });
        });
    }, PREVIEW_DELAY_MS);
    return () => ctrl.abort();
  }, [request, requestKey]);

  const finishZone = useCallback(() => {
    if (draft.length < 3) return;
    setZones((z) => [...z, { name: zoneName.trim() || `zone ${z.length + 1}`, polygon: draft }]);
    setZoneName(`zone ${zones.length + 2}`);
    setDraft([]);
    setMode('view');
    setSaved(null);
  }, [draft, zoneName, zones.length]);

  useEffect(() => {
    if (mode !== 'zone') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement | null)?.closest('input, select, textarea')) return;
      if (e.key === 'Enter') finishZone();
      else if (e.key === 'Escape') {
        setDraft([]);
        setMode('view');
      } else if (e.key === 'Backspace') setDraft((d) => d.slice(0, -1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, finishZone]);

  const onPick = (p: Pt) => {
    if (mode === 'asset') {
      setAsset(p);
      setMode('view');
      setSaved(null);
    } else if (mode === 'zone') setDraft((d) => [...d, p]);
  };

  const sites = useMemo(() => (shown ? sensorSites(shown) : []), [shown]);
  const coverage = useCoverage(shown?.terrain.preset ?? null, sites, DEFAULT_ALTITUDE);
  const problems = preview?.problems ?? [];
  const canSave = !loading && preview?.scenario != null && problems.length === 0 && !saving;

  const save = () => {
    setSaving(true);
    setSaveError(null);
    api
      .saveAuthored(request)
      .then((r) => setSaved({ id: r.scenarioId, name: r.scenario.name }))
      .catch((err: unknown) => setSaveError(err instanceof Error ? err.message : 'Failed'))
      .finally(() => setSaving(false));
  };

  const status = loading
    ? 'Checking · generating preview'
    : netError
      ? 'Preview unavailable'
      : problems.length
        ? `${problems.length} ${problems.length === 1 ? 'problem' : 'problems'}`
        : 'Checks passed';

  return (
    <div className="space-y-3" data-testid="builder">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-label">Instructor / Scenario builder</p>
          <h1 className="text-h1">{form.name || 'Untitled'}</h1>
        </div>
        <div className="flex items-center gap-3">
          <Pips value={form.difficulty} />
          <StateChip tone="muted">{terrainLabel(form.terrainPreset)}</StateChip>
          <StateChip
            tone={problems.length || netError ? 'warn' : loading ? 'muted' : 'ok'}
            data-testid="builder-status"
          >
            {status}
          </StateChip>
        </div>
      </div>
      <div className="grid gap-3 lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_18rem]">
        <Panel>
          <PanelHeader title="Request" />
          <PanelBody className="space-y-2.5">
            <Field label="Name">
              <Input
                value={form.name}
                maxLength={80}
                onChange={(e) => set('name', e.target.value)}
              />
            </Field>
            <Field label="Terrain">
              <Select
                value={form.terrainPreset}
                onChange={(e) => {
                  set('terrainPreset', e.target.value);
                  setAsset(null);
                  setZones([]);
                  setShownPreview(null);
                }}
              >
                {PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {terrainLabel(p)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Difficulty">
                <Select
                  value={form.difficulty}
                  onChange={(e) => set('difficulty', Number(e.target.value))}
                >
                  {[1, 2, 3, 4, 5].map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Seed">
                <div className="flex gap-1">
                  <Input
                    type="number"
                    min={0}
                    className="tnum px-2"
                    value={form.seed}
                    onChange={(e) =>
                      set('seed', Math.max(0, Math.floor(Number(e.target.value) || 0)))
                    }
                  />
                </div>
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Time">
                <Select
                  value={form.timeBand}
                  onChange={(e) => set('timeBand', e.target.value as Form['timeBand'])}
                >
                  <option value="">By difficulty</option>
                  {TIME_BANDS.map((t) => (
                    <option key={t} value={t}>
                      {t.charAt(0) + t.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Weather">
                <Select
                  value={form.weatherPreset}
                  onChange={(e) => set('weatherPreset', e.target.value as Form['weatherPreset'])}
                >
                  <option value="">By difficulty</option>
                  {WEATHER.map((w) => (
                    <option key={w} value={w}>
                      {w.charAt(0) + w.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <Field label="ROE">
              <Select value={form.roe} onChange={(e) => set('roe', e.target.value as Form['roe'])}>
                <option value="">By difficulty</option>
                {ROES.map((r) => (
                  <option key={r} value={r}>
                    {ROE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid grid-cols-2 gap-2">
              <Field label="False contacts">
                <Select
                  value={form.density}
                  onChange={(e) => set('density', e.target.value as Form['density'])}
                >
                  <option value="">By difficulty</option>
                  {DENSITY.map((d) => (
                    <option key={d} value={d}>
                      {d.charAt(0) + d.slice(1).toLowerCase()}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Swarm size">
                <Input
                  type="number"
                  min={1}
                  max={50}
                  placeholder="Auto"
                  className="tnum px-2"
                  value={form.swarmSize}
                  onChange={(e) => set('swarmSize', e.target.value)}
                />
              </Field>
            </div>
            <Field label="Scoring">
              <Select value={form.tree} onChange={(e) => set('tree', e.target.value)}>
                <option value="">default_v4 (built-in)</option>
                {trees
                  .filter((t) => !t.builtIn)
                  .map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.id}
                    </option>
                  ))}
              </Select>
            </Field>
            <Field label="Instructor note (briefing)">
              <textarea
                className="min-h-14 w-full rounded-sm border border-line-2 bg-bg-3 px-2 py-1 text-small text-text-1 placeholder:text-text-3"
                maxLength={600}
                placeholder="Shown to the trainee under the briefing"
                value={form.note}
                onChange={(e) => set('note', e.target.value)}
              />
            </Field>
          </PanelBody>
        </Panel>
        <Panel className="flex h-[calc(100vh-9.5rem)] min-h-[32rem] flex-col">
          <PanelHeader title="Map">
            <div className="flex items-center gap-1" role="group" aria-label="Map tool">
              <Button
                size="hud"
                variant={mode === 'asset' ? 'primary' : 'secondary'}
                onClick={() => setMode(mode === 'asset' ? 'view' : 'asset')}
                title="Click the map to place the defended asset"
              >
                Place asset
              </Button>
              <Button
                size="hud"
                variant={mode === 'zone' ? 'primary' : 'secondary'}
                disabled={zones.length >= 6}
                title={
                  zones.length >= 6 ? 'At most six extra zones' : 'Click corners, Enter to close'
                }
                onClick={() => {
                  setDraft([]);
                  setMode(mode === 'zone' ? 'view' : 'zone');
                }}
              >
                Draw no-kinetic zone
              </Button>
            </div>
          </PanelHeader>
          <div className="flex items-center gap-3 border-b border-line-1 px-3 py-1.5 text-small text-text-2">
            {mode === 'asset' && <span>Click the map where the defended asset should be.</span>}
            {mode === 'zone' && (
              <>
                <label className="flex items-center gap-2">
                  <span className="text-label">Zone name</span>
                  <Input
                    className="h-7 w-32 px-2 text-small"
                    value={zoneName}
                    maxLength={40}
                    onChange={(e) => setZoneName(e.target.value)}
                  />
                </label>
                <span>
                  {draft.length} {draft.length === 1 ? 'corner' : 'corners'} · <Kbd>Enter</Kbd>{' '}
                  close · <Kbd>Backspace</Kbd> undo · <Kbd>Esc</Kbd> cancel
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={draft.length < 3}
                  onClick={finishZone}
                  title={draft.length < 3 ? 'A zone needs at least three corners' : undefined}
                >
                  Close zone
                </Button>
              </>
            )}
            {mode === 'view' && (
              <span>
                Asset{' '}
                {asset ? (
                  <span className="text-readout text-text-1">
                    {asset[0]}, {asset[1]} m
                  </span>
                ) : (
                  'placed by the generator'
                )}{' '}
                · {zones.length} extra {zones.length === 1 ? 'zone' : 'zones'}
              </span>
            )}
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-bg-0 p-2">
            {shown ? (
              <BriefingMap
                scenario={shown}
                sizeM={meta?.sizeM ?? 14_000}
                sites={sites}
                coverage={coverage}
                intelAxisDeg={null}
                altitude={DEFAULT_ALTITUDE}
                onPick={mode === 'view' ? undefined : onPick}
                draft={mode === 'zone' ? draft : undefined}
                pending={preview && !preview.scenario ? zones.map((z) => z.polygon) : undefined}
              />
            ) : (
              <Skeleton label={`Generating preview · ${terrainLabel(form.terrainPreset)}`} />
            )}
          </div>
        </Panel>
        <div className="space-y-3 lg:col-span-2 xl:col-span-1">
          <Panel>
            <PanelHeader title="Checks" />
            <PanelBody className="space-y-2" data-testid="builder-checks">
              {netError && <p className="text-small text-crit">Preview failed: {netError}</p>}
              {!netError && problems.length === 0 && !loading && (
                <p className="text-small text-ok">All static checks passed.</p>
              )}
              {problems.length > 0 && (
                <ul className="list-disc space-y-1 pl-4 text-small text-warn">
                  {problems.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {(asset || zones.length > 0) && (
                <ul className="space-y-1 border-t border-line-1 pt-2 text-small">
                  {asset && (
                    <li className="flex items-center justify-between">
                      <span>
                        Asset at{' '}
                        <span className="text-readout">
                          {asset[0]}, {asset[1]}
                        </span>
                      </span>
                      <button
                        type="button"
                        className="text-label hover:text-text-1"
                        onClick={() => setAsset(null)}
                      >
                        Reset
                      </button>
                    </li>
                  )}
                  {zones.map((z, i) => (
                    <li key={i} className="flex items-center justify-between">
                      <span>
                        No kinetic · {z.name}{' '}
                        <span className="text-text-3">({z.polygon.length} corners)</span>
                      </span>
                      <button
                        type="button"
                        className="text-label hover:text-text-1"
                        onClick={() => setZones((zs) => zs.filter((_, j) => j !== i))}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <div className="flex items-center gap-3 border-t border-line-1 pt-2">
                <Button
                  variant="primary"
                  disabled={!canSave}
                  onClick={save}
                  title={canSave ? 'Save as an authored scenario' : 'Fix the problems first'}
                  data-testid="builder-save"
                >
                  {saving ? 'Saving…' : 'Save scenario'}
                </Button>
                {saveError && (
                  <span className="text-small text-crit" role="alert">
                    {saveError}
                  </span>
                )}
              </div>
              {saved && (
                <p className="text-small text-ok" role="status">
                  Saved “{saved.name}”.{' '}
                  <Link href={`/train/scenario/${saved.id}`} className="underline">
                    Open briefing
                  </Link>{' '}
                  ·{' '}
                  <Link href="/instructor" className="underline">
                    Assign from the unit dashboard
                  </Link>
                </p>
              )}
            </PanelBody>
          </Panel>
          <Panel>
            <PanelHeader title="Briefing preview" />
            <PanelBody>
              <Summary preview={shownPreview} scenario={shown} />
            </PanelBody>
          </Panel>
        </div>
      </div>
    </div>
  );
}

export default function BuilderPage() {
  return (
    <RequireStaff>
      <Builder />
    </RequireStaff>
  );
}
