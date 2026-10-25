'use client';

import type {
  ComponentPct,
  ScoringTreeSummary,
  TraineeTrendsResponse,
  TrendPoint,
} from '@vyuh/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { DemoBadge, Panel, PanelHeader, Pips, StatusNotice } from '@/components/hud/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import {
  COMPONENT_LABEL,
  accuracyAnswer,
  componentAnswer,
  difficultyAnswer,
  difficultyRuns,
  latencyAnswer,
  mistakesAnswer,
  ratingAnswer,
  scoreAnswer,
  trustAnswer,
  weakestStageAnswer,
} from '@/lib/aar/answers';
import { api } from '@/lib/api';
import { QuestionPanel, SeriesChart, StageBars, type SeriesPoint } from './charts';
import { TrustInsight } from './trust-insight';

// Trainee trends (SPEC §12 Phase 4, DESIGN §11.7): Assessment sessions only, each
// chart a question with its one-line answer, then the sessions with links to their
// AAR. Instructors also get an explicit re-score per session (SPEC §9.6).

const TH = 'h-7 bg-bg-2 px-2 text-left text-label font-medium whitespace-nowrap';
const TD = 'h-8 px-2 whitespace-nowrap';

const series = (points: readonly TrendPoint[], value: (p: TrendPoint) => number | null) =>
  points.map<SeriesPoint>((p, i) => ({
    n: i + 1,
    value: value(p),
    label: `${p.scenarioCode ?? p.scenarioName} · ${p.endedAt.slice(0, 10)}`,
  }));

const COMPONENTS = Object.keys(COMPONENT_LABEL) as (keyof ComponentPct)[];

function Rescore({
  point,
  trees,
  onDone,
}: {
  point: TrendPoint;
  trees: readonly ScoringTreeSummary[];
  onDone: () => void;
}) {
  const base = trees.find((t) => t.id === point.treeVersion)?.baseId ?? point.treeVersion;
  const options = trees.filter((t) => t.baseId === base && t.id !== point.treeVersion);
  const [tree, setTree] = useState('');
  const [state, setState] = useState<'idle' | 'busy' | string>('idle');
  if (options.length === 0)
    return (
      <span className="text-small text-text-2" title="No other version of this tree yet">
        —
      </span>
    );
  return (
    <span className="flex items-center gap-1">
      <Select
        aria-label={`Re-score session ${point.sessionId} with`}
        className="h-7 w-auto py-0 pr-7 text-small"
        value={tree}
        onChange={(e) => setTree(e.target.value)}
      >
        <option value="">Version…</option>
        {options.map((t) => (
          <option key={t.id} value={t.id}>
            {t.id}
          </option>
        ))}
      </Select>
      <Button
        size="sm"
        variant="secondary"
        disabled={!tree || state === 'busy'}
        title={tree ? `Writes a new score row with ${tree}` : 'Choose a version first'}
        onClick={() => {
          setState('busy');
          api
            .rescore(point.sessionId, tree)
            .then(() => {
              setState('idle');
              onDone();
            })
            .catch((err: unknown) => setState(err instanceof Error ? err.message : 'Failed'));
        }}
      >
        {state === 'busy' ? 'Scoring…' : 'Re-score'}
      </Button>
      {state !== 'idle' && state !== 'busy' && (
        <span className="text-small text-crit" role="alert">
          {state}
        </span>
      )}
    </span>
  );
}

export function TrendsView({
  data,
  staff,
  onReload,
}: {
  data: TraineeTrendsResponse;
  staff: boolean;
  onReload: () => void;
}) {
  const { points } = data;
  const [trees, setTrees] = useState<ScoringTreeSummary[]>([]);
  useEffect(() => {
    if (!staff) return;
    const ctrl = new AbortController();
    api
      .listTrees(ctrl.signal)
      .then((r) => setTrees(r.items))
      .catch(() => undefined);
    return () => ctrl.abort();
  }, [staff]);

  const demo = points.some((p) => p.isDemo);
  const weakest = useMemo(() => {
    const scored = data.stages.filter((s) => s.rate !== null);
    return scored.length
      ? scored.reduce((a, b) => ((b.rate ?? 1) < (a.rate ?? 1) ? b : a)).stage
      : null;
  }, [data.stages]);

  if (points.length === 0) {
    return (
      <Panel>
        <PanelHeader title="Trends" />
        <StatusNotice title="No Assessment sessions yet.">
          Trends use Assessment runs only. Open a scenario from Training, choose Assessment and
          complete the run.
        </StatusNotice>
      </Panel>
    );
  }

  return (
    <div className="space-y-3" data-testid="trends">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-label">
          {points.length} Assessment {points.length === 1 ? 'session' : 'sessions'} ·{' '}
          {points[0]!.endedAt.slice(0, 10)} to {points.at(-1)!.endedAt.slice(0, 10)}
        </span>
        {demo && <DemoBadge />}
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <QuestionPanel
          question="Is my score improving?"
          answer={scoreAnswer(points)}
          testId="chart-score"
        >
          <SeriesChart
            data={series(points, (p) => p.total)}
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            ariaLabel="Total score per Assessment session"
          />
        </QuestionPanel>
        <QuestionPanel
          question="Where do I lose points?"
          answer={componentAnswer(points)}
          testId="chart-components"
          definition="Score components: points earned as a share of each component's maximum, per session."
        >
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            {COMPONENTS.map((c) => {
              const s = series(points, (p) => p.components[c]);
              const last = [...s].reverse().find((x) => x.value !== null)?.value ?? null;
              return (
                <div key={c}>
                  <p className="flex justify-between text-label">
                    {COMPONENT_LABEL[c]}
                    <span className="text-readout text-text-1">
                      {last === null ? '—' : last}
                      <span className="text-text-2"> %</span>
                    </span>
                  </p>
                  <SeriesChart
                    data={s}
                    domain={[0, 100]}
                    ticks={[0, 100]}
                    unit="%"
                    height={58}
                    ariaLabel={`${COMPONENT_LABEL[c]} as a percentage of its maximum per session`}
                  />
                </div>
              );
            })}
          </div>
        </QuestionPanel>
        <QuestionPanel
          question="Is detection getting faster?"
          answer={latencyAnswer(points)}
          testId="chart-latency"
        >
          <SeriesChart
            data={series(points, (p) => p.detectionLatencyS)}
            domain={[0, 'auto']}
            unit="s"
            digits={1}
            height={120}
            ariaLabel="Mean detection latency per session, seconds"
          />
        </QuestionPanel>
        <QuestionPanel
          question="Am I classifying correctly?"
          answer={accuracyAnswer(points)}
          testId="chart-accuracy"
        >
          <SeriesChart
            data={series(points, (p) =>
              p.classificationAccuracy === null ? null : p.classificationAccuracy * 100,
            )}
            domain={[0, 100]}
            ticks={[0, 50, 100]}
            unit="%"
            height={120}
            ariaLabel="Share of tracks classified exactly per session"
          />
        </QuestionPanel>
        <QuestionPanel
          question="Which kill-chain stage is weakest?"
          answer={weakestStageAnswer(data.stages)}
          testId="chart-stages"
          definition="Kill-chain stages: how often each step was done right for a contact, across all sessions. Not the score."
        >
          <StageBars stages={data.stages} weakest={weakest} />
        </QuestionPanel>
        <QuestionPanel
          question="What mistakes keep recurring?"
          answer={mistakesAnswer(data.mistakes, points.length)}
          testId="mistakes"
        >
          {data.mistakes.length === 0 ? (
            <p className="text-small text-text-2">Nothing recurring across sessions.</p>
          ) : (
            <ul className="space-y-1">
              {data.mistakes.map((m) => (
                <li key={m.code} className="flex items-baseline justify-between gap-3 text-body">
                  <span>{m.text}</span>
                  <span className="shrink-0 text-readout text-text-2">
                    {m.sessions}
                    <span className="text-text-2"> of {points.length} sessions</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </QuestionPanel>
        <QuestionPanel
          question="Is my rating rising?"
          answer={ratingAnswer(points, data.rating)}
          testId="chart-rating"
        >
          <SeriesChart
            data={series(points, (p) => p.ratingAfter)}
            domain={['auto', 'auto']}
            yWidth={38}
            height={120}
            ariaLabel="Elo rating after each rated Assessment session"
          />
        </QuestionPanel>
        <QuestionPanel
          question="Do I trust the AI assist too much?"
          answer={trustAnswer(data.aiTrust)}
          testId="trust-insight"
        >
          <TrustInsight trust={data.aiTrust} />
        </QuestionPanel>
        <QuestionPanel
          question="What difficulty should I train at next?"
          answer={difficultyAnswer(points, data.rating)}
          testId="chart-difficulty"
          className="lg:col-span-2"
        >
          {/* A step readout, not a chart: the value only moves in whole levels (audit P1-15). */}
          <div className="flex flex-wrap items-center gap-6" data-testid="difficulty-steps">
            <span className="flex items-center gap-2">
              <span className="text-label">Next</span>
              <Pips value={points.at(-1)!.recommendedDifficulty} />
              <span className="text-readout-lg">D{points.at(-1)!.recommendedDifficulty}</span>
            </span>
            <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-text-2">
              {difficultyRuns(points).map((r, i) => (
                <li key={r.from} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden>→</span>}
                  <span>
                    {r.from === r.to ? `Session ${r.from}` : `Sessions ${r.from}–${r.to}`}{' '}
                    <span className="font-mono tnum text-text-1">D{r.difficulty}</span>
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </QuestionPanel>
      </div>
      <Panel>
        <PanelHeader title="Assessment sessions">
          <span className="text-label">Newest first · open a row for its AAR</span>
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" data-testid="trend-sessions">
            <thead>
              <tr>
                <th className={TH}>#</th>
                <th className={TH}>Date</th>
                <th className={`${TH} w-full`}>Scenario</th>
                <th className={TH}>Difficulty</th>
                <th className={`${TH} text-right`}>Total</th>
                <th className={`${TH} text-right`}>Rating</th>
                <th className={TH}>Tree</th>
                <th className={TH}>Next</th>
                {staff && <th className={TH}>Re-score</th>}
              </tr>
            </thead>
            <tbody>
              {[...points].reverse().map((p, i) => (
                <tr key={p.sessionId} className="border-t border-line-1 hover:bg-bg-2">
                  <td className={`${TD} text-readout text-text-2`}>{points.length - i}</td>
                  <td className={`${TD} text-readout text-text-2`}>{p.endedAt.slice(0, 10)}</td>
                  <td className={`${TD} text-body`}>
                    <Link
                      href={`/aar/session/${p.sessionId}`}
                      className="hover:text-text-1 hover:underline"
                    >
                      {p.scenarioCode && (
                        <span className="mr-2 text-readout text-text-2">{p.scenarioCode}</span>
                      )}
                      {p.scenarioName}
                    </Link>
                    {p.isDemo && (
                      <Badge className="ml-2" tone="default">
                        Demo
                      </Badge>
                    )}
                  </td>
                  <td className={TD}>
                    <Pips value={p.difficulty} />
                  </td>
                  <td className={`${TD} text-right text-readout`}>{p.total}</td>
                  <td className={`${TD} text-right text-readout`}>
                    {p.ratingAfter === null || p.ratingBefore === null ? (
                      <span className="text-text-2">—</span>
                    ) : (
                      <>
                        {p.ratingAfter}
                        <span className="text-text-2">
                          {' '}
                          {p.ratingAfter >= p.ratingBefore ? '+' : '−'}
                          {Math.abs(p.ratingAfter - p.ratingBefore)}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={`${TD} text-readout text-text-2`}>{p.treeVersion}</td>
                  <td className={`${TD} text-readout`}>D{p.recommendedDifficulty}</td>
                  {staff && (
                    <td className={TD}>
                      <Rescore point={p} trees={trees} onDone={onReload} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
