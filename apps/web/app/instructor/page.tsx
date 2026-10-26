'use client';

import type { ScenarioListItem, UnitDashboardResponse, UnitSummary } from '@vyuh/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { PctBar, QuestionPanel, StageBars } from '@/components/aar/charts';
import {
  ErrorState,
  DemoBadge,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Pips,
  Readout,
  Skeleton,
  StateChip,
  StatusNotice,
} from '@/components/hud/primitives';
import { UnitNav } from '@/components/builder-nav';
import { RequireStaff } from '@/components/require-staff';
import { Button } from '@/components/ui/button';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  COMPONENT_LABEL,
  STAGE_LABEL,
  completionAnswer,
  isOverdue,
  leaderboardAnswer,
  unitComponentAnswer,
  weakestStageAnswer,
} from '@/lib/aar/answers';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isGuest } from '@/lib/nav';

// Unit dashboard (SPEC §12 Phase 4, DESIGN §11.7): unit averages, leaderboard,
// weakest kill-chain stage, common mistakes, assignment completion; rows drill
// down to a trainee's trends and any session's AAR. Assessment sessions only.

function signed(v: number | null) {
  if (v === null) return <span className="text-text-2">—</span>;
  // Display value from the API (decision 149): never re-rounded here.
  return <span className={v <= -5 ? 'text-warn' : undefined}>{v > 0 ? `+${v}` : v}</span>;
}

function AssignForm({ unit, onDone }: { unit: UnitSummary; onDone: () => void }) {
  const [scenarios, setScenarios] = useState<ScenarioListItem[]>([]);
  const [scenarioId, setScenarioId] = useState('');
  const [target, setTarget] = useState('unit');
  const [due, setDue] = useState('');
  const [state, setState] = useState<{ kind: 'idle' | 'busy' | 'ok' | 'error'; text?: string }>({
    kind: 'idle',
  });

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .listScenarios(ctrl.signal)
      .then((r) => setScenarios(r.items.filter((s) => !s.tags.includes('test'))))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);

  const trainees = unit.members.filter((m) => m.role === 'TRAINEE');
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!scenarioId) return;
    setState({ kind: 'busy' });
    api
      .createAssignment({
        scenarioId,
        ...(target === 'unit' ? { unitId: unit.id } : { userIds: [target] }),
        dueAt: due ? new Date(`${due}T18:00:00`).toISOString() : null,
      })
      .then(() => {
        const s = scenarios.find((x) => x.id === scenarioId);
        setState({ kind: 'ok', text: `Assigned ${s?.code ?? s?.name ?? 'scenario'}.` });
        onDone();
      })
      .catch((err: unknown) =>
        setState({ kind: 'error', text: err instanceof Error ? err.message : 'Failed' }),
      );
  };

  return (
    <Panel>
      <PanelHeader title="Assign a scenario" />
      <PanelBody>
        <form className="space-y-2" onSubmit={submit} data-testid="assign-form">
          <label className="block space-y-1">
            <span className="text-label">Scenario</span>
            <Select value={scenarioId} onChange={(e) => setScenarioId(e.target.value)} required>
              <option value="">Choose…</option>
              {scenarios.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.code ? `${s.code} ` : ''}
                  {s.name} · D{s.difficulty}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-label">To</span>
            <Select value={target} onChange={(e) => setTarget(e.target.value)}>
              <option value="unit">Whole unit ({trainees.length} trainees)</option>
              {trainees.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-label">Due (optional)</span>
            <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
          <div className="flex items-center gap-3 pt-1">
            <Button
              type="submit"
              variant="primary"
              disabled={!scenarioId || state.kind === 'busy'}
              title={scenarioId ? undefined : 'Choose a scenario first'}
            >
              {state.kind === 'busy' ? 'Assigning…' : 'Assign'}
            </Button>
            {state.text && (
              <span
                className={state.kind === 'error' ? 'text-small text-crit' : 'text-small text-ok'}
                role={state.kind === 'error' ? 'alert' : 'status'}
              >
                {state.text}
              </span>
            )}
          </div>
          <p className="text-small text-text-2">
            Completed when the trainee finishes it in Assessment mode.
          </p>
        </form>
      </PanelBody>
    </Panel>
  );
}

function Dashboard({
  d,
  unit,
  reload,
  readOnly,
}: {
  d: UnitDashboardResponse;
  unit: UnitSummary;
  reload: () => void;
  /** A demo guest: everything to read, nothing to assign (Phase 6E). */
  readOnly: boolean;
}) {
  const c = d.components;
  const router = useRouter();
  const now = new Date();
  return (
    <div className="space-y-3" data-testid="unit-dashboard">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-label">
          {d.sessions} Assessment sessions · {d.leaderboard.length} trainees
        </span>
        {d.demoSessions > 0 && (
          // A count only when real and demo sessions are mixed.
          <DemoBadge
            label={
              d.demoSessions < d.sessions
                ? `Demo data · ${d.demoSessions} of ${d.sessions}`
                : 'Demo data'
            }
          />
        )}
      </div>
      <Panel>
        <PanelHeader title="Unit averages" />
        <PanelBody className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Readout
            label="Average score"
            value={d.avgTotal === null ? '—' : d.avgTotal}
            unit="/ 100"
            size="lg"
            flash={false}
          />
          <Readout
            label="Detection latency"
            value={d.detectionLatencyS === null ? '—' : d.detectionLatencyS.toFixed(1)}
            unit="s"
            size="lg"
            flash={false}
          />
          <Readout
            label="Exact classification"
            value={
              d.classificationAccuracy === null ? '—' : Math.round(d.classificationAccuracy * 100)
            }
            unit="%"
            size="lg"
            flash={false}
          />
          <Readout
            label="Weakest stage"
            value={d.weakestStage ? STAGE_LABEL[d.weakestStage] : '—'}
            size="lg"
            flash={false}
          />
        </PanelBody>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <QuestionPanel
          question="Who leads, and who needs attention?"
          answer={leaderboardAnswer(d.leaderboard)}
          testId="leaderboard"
          className="lg:col-span-2"
        >
          {d.leaderboard.length > 0 && (
            <Table className="-mx-3 w-[calc(100%+1.5rem)]">
              <thead>
                <tr>
                  <Th>Rank</Th>
                  <Th className="w-full">Trainee</Th>
                  <Th align="right">Sessions</Th>
                  <Th align="right">Average</Th>
                  <Th align="right">Last</Th>
                  <Th align="right">Change</Th>
                  <Th align="right">Latency</Th>
                  <Th align="right">Exact class</Th>
                  <Th>Weakest stage</Th>
                </tr>
              </thead>
              <tbody>
                {d.leaderboard.map((r, i) => (
                  <Tr key={r.userId} className="hover:bg-bg-2">
                    <Td className="text-readout text-text-2">
                      {r.avgTotal === null ? '—' : i + 1}
                    </Td>
                    <Td className="text-body">
                      <Link
                        href={`/aar/trends?user=${r.userId}`}
                        className="hover:text-text-1 hover:underline"
                      >
                        {r.name}
                      </Link>
                    </Td>
                    <Td align="right" className="text-readout">
                      {r.sessions}
                    </Td>
                    <Td align="right" className="text-readout">
                      {r.avgTotal === null ? <span className="text-text-2">—</span> : r.avgTotal}
                    </Td>
                    <Td align="right" className="text-readout">
                      {r.lastTotal === null ? <span className="text-text-2">—</span> : r.lastTotal}
                    </Td>
                    <Td align="right" className="text-readout">
                      {signed(r.change)}
                    </Td>
                    <Td align="right" className="text-readout">
                      {r.detectionLatencyS === null ? (
                        <span className="text-text-2">—</span>
                      ) : (
                        <>
                          {r.detectionLatencyS.toFixed(1)}
                          <span className="text-text-2"> s</span>
                        </>
                      )}
                    </Td>
                    <Td align="right" className="text-readout">
                      {r.classificationAccuracy === null ? (
                        <span className="text-text-2">—</span>
                      ) : (
                        <>
                          {Math.round(r.classificationAccuracy * 100)}
                          <span className="text-text-2"> %</span>
                        </>
                      )}
                    </Td>
                    <Td className="text-label">
                      {r.weakestStage ? STAGE_LABEL[r.weakestStage] : '—'}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </QuestionPanel>
        <QuestionPanel
          question="Which kill-chain stage is weakest across the unit?"
          answer={weakestStageAnswer(d.stages, 'the unit’s')}
          testId="unit-stages"
        >
          <StageBars stages={d.stages} weakest={d.weakestStage} />
        </QuestionPanel>
        <QuestionPanel
          question="Where does the unit lose points?"
          answer={unitComponentAnswer(c)}
          testId="unit-components"
        >
          <div className="space-y-1.5">
            {(Object.keys(COMPONENT_LABEL) as (keyof typeof COMPONENT_LABEL)[]).map((k) => (
              <PctBar key={k} label={COMPONENT_LABEL[k]} value={c[k]} />
            ))}
          </div>
        </QuestionPanel>
        <QuestionPanel
          question="What mistakes are most common?"
          answer={
            d.mistakes[0]
              ? `${d.mistakes[0].text}: ${d.mistakes[0].trainees} of ${d.leaderboard.length} trainees, ${d.mistakes[0].count} times.`
              : 'No scored mistakes yet.'
          }
          testId="unit-mistakes"
        >
          {d.mistakes.length > 0 && (
            <Table>
              <thead>
                <tr>
                  <Th className="w-full">Mistake</Th>
                  <Th align="right">Trainees</Th>
                  <Th align="right">Times</Th>
                </tr>
              </thead>
              <tbody>
                {d.mistakes.map((m) => (
                  <Tr key={m.code}>
                    <Td className="whitespace-normal py-1 text-body">{m.text}</Td>
                    <Td align="right" className="text-readout">
                      {m.trainees}
                    </Td>
                    <Td align="right" className="text-readout">
                      {m.count}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </QuestionPanel>
        <QuestionPanel
          question="Are assignments being completed?"
          answer={completionAnswer(d.assignments, now)}
          testId="unit-assignments"
        >
          {d.assignments.length === 0 ? (
            <p className="text-small text-text-2">Assign a scenario with the form on the right.</p>
          ) : (
            <Table>
              <thead>
                <tr>
                  <Th className="w-full">Scenario</Th>
                  <Th>Due</Th>
                  <Th align="right">Done</Th>
                  <Th>Pending</Th>
                </tr>
              </thead>
              <tbody>
                {d.assignments.map((a) => (
                  <Tr key={a.assignmentId}>
                    {/* max-w-0 on the w-full column: long names truncate, never widen (break-ui 4). */}
                    <Td className="max-w-0 text-body">
                      <span className="block truncate" title={a.scenarioName}>
                        {a.scenarioCode && (
                          <span className="mr-2 text-readout text-text-2">{a.scenarioCode}</span>
                        )}
                        {a.scenarioName}
                      </span>
                    </Td>
                    <Td className="text-readout text-text-2">
                      {a.dueAt ? a.dueAt.slice(0, 10) : '—'}
                      {isOverdue(a, now) && (
                        <StateChip tone="warn" className="ml-2" data-testid="overdue">
                          Overdue
                        </StateChip>
                      )}
                    </Td>
                    <Td align="right" className="text-readout">
                      {a.completed}
                      <span className="text-text-2"> / {a.assigned}</span>
                    </Td>
                    {/* One name, or a count with the names on hover (break-ui 1). */}
                    <Td className="text-small text-text-2">
                      {a.pending.length === 0 ? (
                        '—'
                      ) : (
                        <span
                          className="block max-w-[10rem] truncate"
                          title={a.pending.join(', ')}
                          data-testid="pending"
                        >
                          {a.pending.length === 1 ? a.pending[0] : `${a.pending.length} trainees`}
                        </span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </QuestionPanel>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <PanelHeader title="Recent sessions">
            <span className="text-label">A row opens its AAR</span>
          </PanelHeader>
          {d.recent.length === 0 && (
            <p className="px-3 py-2 text-small text-text-2">
              No Assessment sessions in this unit yet.
            </p>
          )}
          {d.recent.length > 0 && (
            <Table data-testid="unit-recent">
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Trainee</Th>
                  <Th className="w-full">Scenario</Th>
                  <Th>Difficulty</Th>
                  <Th align="right">Total</Th>
                </tr>
              </thead>
              <tbody>
                {d.recent.map((s) => (
                  // The whole row opens the AAR (audit P1-16) and is one tab stop, the
                  // scenario link (6B debt: the trainee name was a second stop; a
                  // trainee's trends open from the leaderboard above).
                  <Tr
                    key={s.sessionId}
                    interactive
                    data-testid="unit-recent-row"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('a')) return;
                      router.push(`/aar/session/${s.sessionId}`);
                    }}
                  >
                    <Td className="text-readout text-text-2">{s.endedAt.slice(0, 10)}</Td>
                    <Td className="max-w-[12rem] truncate text-body" title={s.userName}>
                      {s.userName}
                    </Td>
                    <Td className="max-w-0 text-body">
                      <Link
                        href={`/aar/session/${s.sessionId}`}
                        className="block truncate hover:text-text-1 hover:underline"
                        title={s.scenarioName}
                      >
                        {s.scenarioCode && (
                          <span className="mr-2 text-readout text-text-2">{s.scenarioCode}</span>
                        )}
                        {s.scenarioName}
                      </Link>
                    </Td>
                    <Td>
                      <Pips value={s.difficulty} />
                    </Td>
                    <Td align="right" className="text-readout">
                      {s.total}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Panel>
        {readOnly ? (
          <Panel data-testid="assign-read-only">
            <PanelHeader title="Assign a scenario" />
            <PanelBody>
              <p className="text-small text-text-body">
                Instructors assign scenarios here. This is a read-only view of demo data.
              </p>
            </PanelBody>
          </Panel>
        ) : (
          <AssignForm unit={unit} onDone={reload} />
        )}
      </div>
    </div>
  );
}

function UnitPage() {
  const { user } = useAuth();
  const guest = isGuest(user?.role);
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [units, setUnits] = useState<UnitSummary[] | null>(null);
  const [data, setData] = useState<UnitDashboardResponse | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((a) => a + 1), []);
  const unitId = params.get('unit') ?? units?.[0]?.id ?? null;
  const unit = units?.find((u) => u.id === unitId) ?? null;

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .listUnits(ctrl.signal)
      .then((r) => setUnits(r.items))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err);
      });
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!unitId) return;
    const ctrl = new AbortController();
    api
      .unitDashboard(unitId, ctrl.signal)
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted) setError(err);
      });
    return () => ctrl.abort();
  }, [unitId, attempt]);

  return (
    <div className="space-y-6">
      <PageHeader
        reference={guest ? 'Unit · Demo data · read-only' : 'Unit · Assessment sessions only'}
        title={unit?.name ?? 'Unit'}
        context={
          guest
            ? 'Compare the demo trainees and see the weakest kill-chain stage. Assessment sessions only.'
            : 'Compare trainees, see the weakest kill-chain stage and assign scenarios.'
        }
        actions={
          <div className="flex items-center gap-3">
            {units && units.length > 1 && (
              <label className="flex items-center gap-2">
                <span className="text-label">Unit</span>
                <Select
                  className="h-7 w-auto py-0 pr-7 text-small"
                  value={unitId ?? ''}
                  onChange={(e) => {
                    setData(null);
                    router.replace(`${pathname}?unit=${e.target.value}`, { scroll: false });
                  }}
                >
                  {units.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            {!guest && (
              <Button asChild variant="ghost" size="sm">
                <Link href="/instructor/scoring">Scoring weights</Link>
              </Button>
            )}
          </div>
        }
      />
      {!guest && <UnitNav />}
      {error !== null && (
        <Panel>
          <ErrorState
            error={error}
            subject="unit dashboard"
            onRetry={() => {
              setError(null);
              reload();
            }}
          />
        </Panel>
      )}
      {units?.length === 0 && (
        <Panel>
          <StatusNotice title="No units yet.">
            An administrator creates units and assigns trainees.
          </StatusNotice>
        </Panel>
      )}
      {error === null && units?.length !== 0 && (!data || data.unit.id !== unitId) && (
        <Skeleton label="Loading unit dashboard" />
      )}
      {data && unit && data.unit.id === unitId && (
        <Dashboard d={data} unit={unit} reload={reload} readOnly={guest} />
      )}
    </div>
  );
}

export default function InstructorPage() {
  return (
    <RequireStaff allowGuest>
      <Suspense fallback={<Skeleton label="Loading unit dashboard" />}>
        <UnitPage />
      </Suspense>
    </RequireStaff>
  );
}
