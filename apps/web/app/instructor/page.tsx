'use client';

import type { ScenarioListItem, UnitDashboardResponse, UnitSummary } from '@vyuh/shared';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { PctBar, QuestionPanel, StageBars } from '@/components/aar/charts';
import {
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
import { RequireStaff } from '@/components/require-staff';
import { Button } from '@/components/ui/button';
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

// Unit dashboard (SPEC §12 Phase 4, DESIGN §11.7): unit averages, leaderboard,
// weakest kill-chain stage, common mistakes, assignment completion; rows drill
// down to a trainee's trends and any session's AAR. Assessment sessions only.

const TH = 'h-7 bg-bg-2 px-2 text-left text-label font-medium whitespace-nowrap';
const TD = 'h-8 px-2 whitespace-nowrap';

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
}: {
  d: UnitDashboardResponse;
  unit: UnitSummary;
  reload: () => void;
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
          <table className="-mx-3 w-[calc(100%+1.5rem)] border-collapse">
            <thead>
              <tr>
                <th className={TH}>Rank</th>
                <th className={`${TH} w-full`}>Trainee</th>
                <th className={`${TH} text-right`}>Sessions</th>
                <th className={`${TH} text-right`}>Average</th>
                <th className={`${TH} text-right`}>Last</th>
                <th className={`${TH} text-right`}>Change</th>
                <th className={`${TH} text-right`}>Latency</th>
                <th className={`${TH} text-right`}>Exact class</th>
                <th className={TH}>Weakest stage</th>
              </tr>
            </thead>
            <tbody>
              {d.leaderboard.map((r, i) => (
                <tr key={r.userId} className="border-t border-line-1 hover:bg-bg-2">
                  <td className={`${TD} text-readout text-text-2`}>
                    {r.avgTotal === null ? '—' : i + 1}
                  </td>
                  <td className={`${TD} text-body`}>
                    <Link
                      href={`/aar/trends?user=${r.userId}`}
                      className="hover:text-text-1 hover:underline"
                    >
                      {r.name}
                    </Link>
                  </td>
                  <td className={`${TD} text-right text-readout`}>{r.sessions}</td>
                  <td className={`${TD} text-right text-readout`}>
                    {r.avgTotal === null ? <span className="text-text-2">—</span> : r.avgTotal}
                  </td>
                  <td className={`${TD} text-right text-readout`}>
                    {r.lastTotal === null ? <span className="text-text-2">—</span> : r.lastTotal}
                  </td>
                  <td className={`${TD} text-right text-readout`}>{signed(r.change)}</td>
                  <td className={`${TD} text-right text-readout`}>
                    {r.detectionLatencyS === null ? (
                      <span className="text-text-2">—</span>
                    ) : (
                      <>
                        {r.detectionLatencyS.toFixed(1)}
                        <span className="text-text-2"> s</span>
                      </>
                    )}
                  </td>
                  <td className={`${TD} text-right text-readout`}>
                    {r.classificationAccuracy === null ? (
                      <span className="text-text-2">—</span>
                    ) : (
                      <>
                        {Math.round(r.classificationAccuracy * 100)}
                        <span className="text-text-2"> %</span>
                      </>
                    )}
                  </td>
                  <td className={`${TD} text-label`}>
                    {r.weakestStage ? STAGE_LABEL[r.weakestStage] : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${TH} w-full`}>Mistake</th>
                <th className={`${TH} text-right`}>Trainees</th>
                <th className={`${TH} text-right`}>Times</th>
              </tr>
            </thead>
            <tbody>
              {d.mistakes.map((m) => (
                <tr key={m.code} className="border-t border-line-1">
                  <td className="px-2 py-1 text-body">{m.text}</td>
                  <td className={`${TD} text-right text-readout`}>{m.trainees}</td>
                  <td className={`${TD} text-right text-readout`}>{m.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </QuestionPanel>
        <QuestionPanel
          question="Are assignments being completed?"
          answer={completionAnswer(d.assignments, now)}
          testId="unit-assignments"
        >
          {d.assignments.length === 0 ? (
            <p className="text-small text-text-2">Assign a scenario with the form on the right.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${TH} w-full`}>Scenario</th>
                  <th className={TH}>Due</th>
                  <th className={`${TH} text-right`}>Done</th>
                  <th className={TH}>Pending</th>
                </tr>
              </thead>
              <tbody>
                {d.assignments.map((a) => (
                  <tr key={a.assignmentId} className="border-t border-line-1">
                    <td className={`${TD} text-body`}>
                      {a.scenarioCode && (
                        <span className="mr-2 text-readout text-text-2">{a.scenarioCode}</span>
                      )}
                      {a.scenarioName}
                    </td>
                    <td className={`${TD} text-readout text-text-2`}>
                      {a.dueAt ? a.dueAt.slice(0, 10) : '—'}
                      {isOverdue(a, now) && (
                        <StateChip tone="warn" className="ml-2" data-testid="overdue">
                          Overdue
                        </StateChip>
                      )}
                    </td>
                    <td className={`${TD} text-right text-readout`}>
                      {a.completed}
                      <span className="text-text-2"> / {a.assigned}</span>
                    </td>
                    <td className="px-2 py-1 text-small whitespace-nowrap text-text-2">
                      {a.pending.join(', ') || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </QuestionPanel>
      </div>
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <Panel>
          <PanelHeader title="Recent sessions">
            <span className="text-label">A row opens its AAR · a name opens trends</span>
          </PanelHeader>
          <table className="w-full border-collapse" data-testid="unit-recent">
            <thead>
              <tr>
                <th className={TH}>Date</th>
                <th className={TH}>Trainee</th>
                <th className={`${TH} w-full`}>Scenario</th>
                <th className={TH}>Difficulty</th>
                <th className={`${TH} text-right`}>Total</th>
              </tr>
            </thead>
            <tbody>
              {d.recent.map((s) => (
                // The whole row opens the AAR (audit P1-16); the scenario link is its
                // keyboard target, the trainee name a separate link to their trends.
                <tr
                  key={s.sessionId}
                  className="cursor-pointer border-t border-line-1 hover:bg-bg-2"
                  data-testid="unit-recent-row"
                  onClick={(e) => {
                    if ((e.target as HTMLElement).closest('a')) return;
                    router.push(`/aar/session/${s.sessionId}`);
                  }}
                >
                  <td className={`${TD} text-readout text-text-2`}>{s.endedAt.slice(0, 10)}</td>
                  <td className={`${TD} text-body`}>
                    <Link
                      href={`/aar/trends?user=${s.userId}`}
                      className="underline decoration-line-2 underline-offset-2 hover:text-text-1 hover:decoration-text-2"
                      title={`${s.userName}: trends`}
                    >
                      {s.userName}
                    </Link>
                  </td>
                  <td className={`${TD} text-body`}>
                    <Link
                      href={`/aar/session/${s.sessionId}`}
                      className="hover:text-text-1 hover:underline"
                    >
                      {s.scenarioCode && (
                        <span className="mr-2 text-readout text-text-2">{s.scenarioCode}</span>
                      )}
                      {s.scenarioName}
                    </Link>
                  </td>
                  <td className={TD}>
                    <Pips value={s.difficulty} />
                  </td>
                  <td className={`${TD} text-right text-readout`}>{s.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <AssignForm unit={unit} onDone={reload} />
      </div>
    </div>
  );
}

function UnitPage() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [units, setUnits] = useState<UnitSummary[] | null>(null);
  const [data, setData] = useState<UnitDashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
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
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Network error');
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
        if (!ctrl.signal.aborted) setError(err instanceof Error ? err.message : 'Network error');
      });
    return () => ctrl.abort();
  }, [unitId, attempt]);

  return (
    <div className="space-y-6">
      <PageHeader
        reference="Unit · Assessment sessions only"
        title={unit?.name ?? 'Unit'}
        context="Compare trainees, see the weakest kill-chain stage and assign scenarios."
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
            <Button asChild variant="ghost" size="sm">
              <Link href="/instructor/scoring">Scoring weights</Link>
            </Button>
          </div>
        }
      />
      {error && (
        <Panel>
          <StatusNotice
            tone="error"
            title="Could not load the unit dashboard."
            onRetry={() => {
              setError(null);
              reload();
            }}
          >
            {error}. Check that the API is running, then retry.
          </StatusNotice>
        </Panel>
      )}
      {units?.length === 0 && (
        <Panel>
          <StatusNotice title="No units yet.">
            An administrator creates units and assigns trainees.
          </StatusNotice>
        </Panel>
      )}
      {!error && units?.length !== 0 && (!data || data.unit.id !== unitId) && (
        <Skeleton label="Loading unit dashboard" />
      )}
      {data && unit && data.unit.id === unitId && (
        <Dashboard d={data} unit={unit} reload={reload} />
      )}
    </div>
  );
}

export default function InstructorPage() {
  return (
    <RequireStaff>
      <Suspense fallback={<Skeleton label="Loading unit dashboard" />}>
        <UnitPage />
      </Suspense>
    </RequireStaff>
  );
}
