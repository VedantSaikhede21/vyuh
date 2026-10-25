'use client';

import type {
  Scenario,
  ScenarioDetailResponse,
  SessionMode,
  TerrainPresetMeta,
} from '@vyuh/shared';
import { timeOfDayAt } from '@vyuh/sim-core';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BriefingMap } from '@/components/briefing/briefing-map';
import { ModeToggle } from '@/components/briefing/mode-toggle';
import {
  ErrorState,
  Kbd,
  Panel,
  PanelBody,
  PanelHeader,
  Pips,
  Skeleton,
  StateChip,
} from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { api } from '@/lib/api';
import {
  COVERAGE_ALTITUDES,
  DEFAULT_ALTITUDE,
  sensorSites,
  type CoverageAltitude,
} from '@/lib/briefing/coverage';
import { intelAxisDeg } from '@/lib/briefing/intel';
import { sections } from '@/lib/briefing/sections';
import { useCoverage } from '@/lib/briefing/use-coverage';
import { conditions, terrainLabel, visibilityKm } from '@/lib/scenario/library';
import { loadPresetMeta } from '@/lib/terrain/load-world';
import { ROE_LABEL } from '@/lib/strings';

// Briefing page (DESIGN §11.4, plan Step 12): map left, mission card right, mode
// toggle and Begin (Enter), which creates the session in the chosen mode.

const QUICK_KEYS: [string, string][] = [
  ['Tab', 'Next track'],
  ['Space', 'Cue camera'],
  ['T', 'Day / thermal'],
  ['C 1–9', 'Classify'],
  ['H F N U', 'Affiliation'],
  ['J / S', 'Jam / spoof'],
  ['I Enter', 'Intercept'],
  ['?', 'All shortcuts'],
];

function Num({ value, unit }: { value: ReactNode; unit?: string }) {
  return (
    <span className="text-readout">
      {value}
      {unit && <span className="text-text-2"> {unit}</span>}
    </span>
  );
}

type Sensor = Scenario['sensors'][number];
type Effector = Scenario['effectors'][number];

const km = (m: number) => (m / 1000).toFixed(1);

function sensorLine(s: Sensor): [string, ReactNode] {
  switch (s.kind) {
    case 'RADAR':
      return [
        'Radar',
        <>
          <Num value={km(s.refRangeM)} unit="km" /> small quad · scan{' '}
          <Num value={s.scanPeriodS} unit="s" />
        </>,
      ];
    case 'EO_IR':
      return [
        'EO/IR camera',
        <>
          FOV <Num value={`${s.fovDegMin}–${s.fovDegMax}`} unit="°" /> · day and thermal
        </>,
      ];
    case 'RF':
      return [
        'RF detector',
        <>
          <Num value={km(s.rangeM)} unit="km" /> · bearing ±<Num value={s.bearingErrDeg} unit="°" />
        </>,
      ];
  }
}

function effectorLine(e: Effector): [string, ReactNode] {
  switch (e.kind) {
    case 'EW_JAM':
      return [
        'RF jammer',
        <>
          <Num value={km(e.rangeM)} unit="km" /> · ±<Num value={10} unit="°" /> · cycle{' '}
          <Num value={e.cooldownS} unit="s" />
        </>,
      ];
    case 'EW_SPOOF':
      return [
        'GNSS spoofer',
        <>
          <Num value={km(e.rangeM)} unit="km" /> · ±<Num value={10} unit="°" /> · cycle{' '}
          <Num value={e.cooldownS} unit="s" />
        </>,
      ];
    case 'INTERCEPT':
      return [
        'Interceptor',
        <>
          <Num value={km(e.rangeM)} unit="km" /> · <Num value={e.ammo ?? 0} unit="rounds" /> ·
          reload <Num value={e.cooldownS} unit="s" />
        </>,
      ];
  }
}

function MissionCard({
  scenario,
  meta,
  mode,
  onMode,
  onBegin,
  busy,
  error,
}: {
  scenario: Scenario;
  meta: TerrainPresetMeta | null;
  mode: SessionMode;
  onMode: (m: SessionMode) => void;
  onBegin: () => void;
  busy: boolean;
  error: string | null;
}) {
  const env = scenario.environment;
  const tod = meta ? timeOfDayAt(env.date, env.time, meta) : null;
  const text = sections(scenario.briefing).filter((s) => s.title.toLowerCase() !== 'assets');
  const w = env.weather;
  return (
    <Panel className="flex min-h-0 flex-col">
      <PanelHeader title="Mission" />
      <PanelBody className="min-h-0 flex-1 space-y-4 overflow-y-auto" data-testid="mission-body">
        {text.map((sec, i) =>
          sec.title.toUpperCase() === 'ROE' ? (
            <section key={i} className="border border-line-2 bg-bg-2 p-3" data-testid="roe-callout">
              <h2 className="text-panel-title text-text-1">
                Rules of engagement · {ROE_LABEL[scenario.roe]}
              </h2>
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
                  {l.replace(/^- /, '')}
                </p>
              ))}
            </section>
          ),
        )}
        <section className="space-y-1">
          <h2 className="text-label">Sensors and effectors</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-body">
            {[...scenario.sensors.map(sensorLine), ...scenario.effectors.map(effectorLine)].map(
              ([name, detail]) => (
                <div key={name} className="contents">
                  <dt className="text-text-2">{name}</dt>
                  <dd>{detail}</dd>
                </div>
              ),
            )}
          </dl>
        </section>
        <section className="space-y-1">
          <h2 className="text-label">Environment</h2>
          <dl className="grid grid-cols-[8rem_1fr] gap-x-3 gap-y-1 text-body">
            <dt className="text-text-2">Date, time</dt>
            <dd>
              <Num value={env.date} /> <Num value={env.time} unit="local" />
            </dd>
            <dt className="text-text-2">Light</dt>
            <dd>
              {tod ? (
                <>
                  {tod.label} · sun <Num value={tod.sunElDeg.toFixed(1)} unit="°" />
                </>
              ) : (
                '—'
              )}
            </dd>
            <dt className="text-text-2">Visibility</dt>
            <dd>
              {conditions(w).label} · <Num value={visibilityKm(w.visibilityM)} unit="km" />
              {w.rainMmph > 0 && (
                <>
                  {' '}
                  · rain <Num value={w.rainMmph.toFixed(1)} unit="mm/h" />
                </>
              )}
            </dd>
            <dt className="text-text-2">Wind</dt>
            <dd>
              <Num value={w.windMps.toFixed(1)} unit="m/s" /> from{' '}
              <Num value={String(Math.round(w.windDirDeg) % 360).padStart(3, '0')} unit="°" />
            </dd>
          </dl>
        </section>
        <section className="space-y-1">
          <h2 className="text-label">Controls</h2>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-small">
            {QUICK_KEYS.map(([k, a]) => (
              <div key={k} className="flex items-center gap-2">
                <Kbd>{k}</Kbd>
                <span className="text-text-2">{a}</span>
              </div>
            ))}
          </dl>
        </section>
      </PanelBody>
      <div className="space-y-2 border-t border-line-1 p-3">
        {error && (
          <p className="text-small text-crit" role="alert">
            Could not start the session: {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <ModeToggle mode={mode} onChange={onMode} />
          <Button
            variant="primary"
            onClick={onBegin}
            disabled={busy}
            data-testid="start-session"
            autoFocus
          >
            {busy ? 'Starting…' : 'Begin'}{' '}
            <Kbd className="border-primary-fg/40 text-primary-fg">Enter</Kbd>
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function Briefing({ detail }: { detail: ScenarioDetailResponse }) {
  const router = useRouter();
  const scenario = detail.scenario;
  const preset = scenario.terrain.preset;
  const [meta, setMeta] = useState<TerrainPresetMeta | null>(null);
  const [mode, setMode] = useState<SessionMode>('PRACTICE');
  const [altitude, setAltitude] = useState<CoverageAltitude>(DEFAULT_ALTITUDE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [legendShown, setLegendShown] = useState(false);
  const sites = useMemo(() => sensorSites(scenario), [scenario]);
  const coverage = useCoverage(preset, sites, altitude);
  const axis = useMemo(() => intelAxisDeg(scenario.briefing), [scenario.briefing]);

  useEffect(() => {
    let live = true;
    loadPresetMeta(preset)
      .then((m) => {
        if (live) setMeta(m);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [preset]);

  const begin = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { sessionId } = await api.createSession(detail.scenarioId, mode);
      router.push(`/train/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error');
      setBusy(false);
    }
  }, [busy, detail.scenarioId, mode, router]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Enter' || t?.closest('button, a, input, select, textarea')) return;
      e.preventDefault();
      void begin();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [begin]);

  return (
    <div
      className="flex h-[calc(100vh-7.5rem)] min-h-[36rem] flex-col gap-3"
      data-testid="briefing"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <p className="text-label">
            <Link href="/train" className="hover:text-text-1">
              Training
            </Link>{' '}
            / Briefing
          </p>
          <h1 className="text-h1">
            {detail.code && <span className="text-readout-lg mr-2 text-text-2">{detail.code}</span>}
            {scenario.name}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <Pips value={scenario.difficulty} />
          <StateChip>{ROE_LABEL[scenario.roe]}</StateChip>
          <StateChip tone="muted">{terrainLabel(preset)}</StateChip>
        </div>
      </div>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1fr)_30rem]">
        <Panel className="flex min-h-0 flex-col">
          <PanelHeader title="Map">
            <span className="text-label" data-testid="coverage-status">
              {coverage.status === 'loading'
                ? `Computing LOS coverage · ${Math.round(coverage.progress * 100)}%`
                : coverage.status === 'error'
                  ? 'Coverage unavailable'
                  : `LOS coverage · ${altitude} m AGL`}
            </span>
            <SegmentedControl
              label="Coverage altitude"
              size="strip"
              value={String(altitude)}
              onChange={(v) => setAltitude(Number(v) as CoverageAltitude)}
              items={COVERAGE_ALTITUDES.map((a) => ({
                value: String(a),
                label: (
                  <span className="font-mono tnum">
                    {a}
                    <span className="text-text-2"> m</span>
                  </span>
                ),
              }))}
            />
          </PanelHeader>
          <div className="flex min-h-0 flex-1 items-center justify-center bg-bg-0 p-2">
            <BriefingMap
              scenario={scenario}
              sizeM={meta?.sizeM ?? 14_000}
              sites={sites}
              coverage={coverage}
              intelAxisDeg={axis}
              altitude={altitude}
              onLegend={setLegendShown}
            />
          </div>
          {!legendShown && (
            <p className="border-t border-line-1 px-3 py-1.5 text-small text-text-2">
              Shaded: masked from the radar and camera for a contact {altitude} m above the ground,
              within 1.5 × radar range.{' '}
              {axis !== null ? 'Arrow: expected axis from the intel.' : ''}
            </p>
          )}
        </Panel>
        <MissionCard
          scenario={scenario}
          meta={meta}
          mode={mode}
          onMode={setMode}
          onBegin={() => void begin()}
          busy={busy}
          error={error}
        />
      </div>
    </div>
  );
}

function BriefingLoader({ id }: { id: string }) {
  const [detail, setDetail] = useState<ScenarioDetailResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .getScenario(id, ctrl.signal)
      .then(setDetail)
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err);
      });
    return () => ctrl.abort();
  }, [id, attempt]);

  if (error !== null)
    return (
      <Panel className="mx-auto max-w-xl">
        <ErrorState
          error={error}
          subject="briefing"
          onRetry={() => {
            setError(null);
            setAttempt((a) => a + 1);
          }}
          action={
            <Button asChild variant="secondary" size="sm">
              <Link href="/train">Back to scenarios</Link>
            </Button>
          }
        />
      </Panel>
    );
  if (!detail) return <Skeleton label="Loading briefing" className="p-6" />;
  return <Briefing detail={detail} />;
}

export default function BriefingPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <RequireAuth>
      <BriefingLoader id={id} />
    </RequireAuth>
  );
}
