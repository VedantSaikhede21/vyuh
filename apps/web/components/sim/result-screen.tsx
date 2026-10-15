'use client';

import type {
  Affiliation,
  ContactClass,
  PerContactMetrics,
  ScenarioListItem,
  Score,
  ScoreComponents,
  SessionEndReason,
  SessionMode,
} from '@vyuh/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  AffiliationSymbol,
  Panel,
  PanelBody,
  PanelHeader,
  Pips,
  Readout,
  StatusNotice,
} from '@/components/hud/primitives';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { OUTCOME_LABEL, OUTCOME_TONE, humaniseFeedback } from '@/lib/hud/feedback';
import { CLASS_LABEL, formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';

const COMPONENT_LABEL: Record<keyof ScoreComponents, string> = {
  detection: 'Detection',
  classification: 'Classification',
  decision: 'Decision',
  report: 'Report',
  efficiency: 'Efficiency',
};

const END_LABEL: Record<SessionEndReason, string> = {
  TIME_UP: 'Time up',
  ALL_RESOLVED: 'All tracks resolved',
  ABORTED: 'Ended by operator',
};

const RESPONSE_LABEL: Record<string, string> = {
  MONITOR: 'Monitor',
  REPORT: 'Report',
  EW_JAM: 'Jam',
  EW_SPOOF: 'Spoof',
  INTERCEPT: 'Intercept',
};

/** What was really there, as an APP-6 affiliation (shown only after completion). */
function trueAffiliation(c: PerContactMetrics): Affiliation {
  if (c.isThreat) return 'HOSTILE';
  if (c.trueClass === 'FRIENDLY_QUAD' || c.trueClass === 'HELICOPTER_FRIENDLY') return 'FRIENDLY';
  return 'NEUTRAL';
}

const classLabel = (c: ContactClass | undefined) => (c ? CLASS_LABEL[c] : '—');
const TH = 'h-7 bg-bg-2 px-2 text-left text-label font-medium whitespace-nowrap';
const TD = 'px-2 py-1.5 align-top';

/** Pick "next": the first library scenario at the recommended difficulty, else the next one up. */
function pickNext(
  items: ScenarioListItem[],
  currentId: string,
  recommended: number | undefined,
): ScenarioListItem | null {
  const library = items.filter((s) => !s.tags.includes('test'));
  const others = library.filter((s) => s.id !== currentId);
  if (recommended !== undefined) {
    const atLevel = others.find((s) => s.difficulty === recommended);
    if (atLevel) return atLevel;
  }
  const i = library.findIndex((s) => s.id === currentId);
  return (i >= 0 ? library[i + 1] : undefined) ?? others[0] ?? null;
}

/**
 * Result screen (DESIGN §11.6): server-computed total and components, timestamped
 * penalties, what you did vs what was really there per contact, the server's
 * recommended next difficulty, and Retry / Next.
 */
export function ResultScreen({
  score,
  scenarioName,
  scenarioId,
  mode,
  ended,
}: {
  score: Score;
  scenarioName: string;
  scenarioId: string;
  mode: SessionMode;
  ended: { reason: SessionEndReason; tMs: number } | null;
}) {
  const router = useRouter();
  const [items, setItems] = useState<ScenarioListItem[] | null>(null);
  const [busy, setBusy] = useState<'retry' | 'next' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .listScenarios(ctrl.signal)
      .then((r) => setItems(r.items))
      .catch(() => setItems([]));
    return () => ctrl.abort();
  }, []);

  const current = items?.find((s) => s.id === scenarioId) ?? null;
  const next = items ? pickNext(items, scenarioId, score.recommendedDifficulty) : null;

  const start = async (kind: 'retry' | 'next', id: string) => {
    setBusy(kind);
    setError(null);
    try {
      const { sessionId } = await api.createSession(id, mode);
      router.push(`/train/session/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start the session');
      setBusy(null);
    }
  };

  const scored = (Object.keys(COMPONENT_LABEL) as (keyof ScoreComponents)[]).filter(
    (c) => score.componentMax[c] > 0,
  );
  const unscored = (Object.keys(COMPONENT_LABEL) as (keyof ScoreComponents)[]).filter(
    (c) => score.componentMax[c] === 0,
  );
  const penalties = [...score.penalties].sort((a, b) => (a.tMs ?? 0) - (b.tMs ?? 0));
  const contacts = [...score.perContact].sort(
    (a, b) => Number(b.isThreat) - Number(a.isThreat) || a.contactId.localeCompare(b.contactId),
  );

  return (
    <div className="space-y-4" data-testid="result-screen">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <p className="text-label">Debrief · {mode.toLowerCase()}</p>
          <h1 className="text-h1">{scenarioName}</h1>
          {ended && (
            <p className="text-small text-text-2">
              {END_LABEL[ended.reason]} at{' '}
              <span className="font-mono tnum">{formatClock(ended.tMs)}</span>
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" asChild>
            <Link href="/train">Back to training</Link>
          </Button>
          <Button
            disabled={busy !== null || !scenarioId}
            onClick={() => void start('retry', scenarioId)}
          >
            {busy === 'retry' ? 'Starting…' : 'Retry same seed'}
          </Button>
          <Button
            variant="primary"
            disabled={busy !== null || !next}
            onClick={() => next && void start('next', next.id)}
            title={next ? undefined : 'No other scenario in the library'}
          >
            {busy === 'next'
              ? 'Starting…'
              : next
                ? `Next · ${[next.code, next.name].filter(Boolean).join(' ')}`
                : 'Next scenario'}
          </Button>
        </div>
      </header>
      {error && <StatusNotice tone="error" title={`Could not start the session: ${error}`} />}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel>
          <PanelHeader title="Score">
            <span className="text-label">Scored on the server</span>
          </PanelHeader>
          <PanelBody className="space-y-4">
            <div className="flex flex-wrap items-end gap-8">
              <Readout
                label="Total"
                value={<span data-testid="score-total">{score.total.toFixed(0)}</span>}
                unit="/ 100"
                size="lg"
                flash={false}
              />
              {score.recommendedDifficulty !== undefined && (
                <div className="flex flex-col gap-1">
                  <span className="text-label">Recommended next difficulty</span>
                  <span className="flex items-center gap-2">
                    <Pips value={score.recommendedDifficulty} />
                    <span className="text-readout">{score.recommendedDifficulty}</span>
                    {current && (
                      <span className="text-small text-text-3">
                        {score.recommendedDifficulty > current.difficulty
                          ? `up from ${current.difficulty}`
                          : score.recommendedDifficulty < current.difficulty
                            ? `down from ${current.difficulty}`
                            : 'same level'}
                      </span>
                    )}
                  </span>
                </div>
              )}
            </div>
            <div className="space-y-2">
              {scored.map((c) => {
                const pct = (score.components[c] / score.componentMax[c]) * 100;
                return (
                  <div key={c} className="grid grid-cols-[7.5rem_1fr_6.5rem] items-center gap-3">
                    <span className="text-label">{COMPONENT_LABEL[c]}</span>
                    <div
                      className="h-2 bg-bg-3"
                      role="meter"
                      aria-label={COMPONENT_LABEL[c]}
                      aria-valuemin={0}
                      aria-valuemax={score.componentMax[c]}
                      aria-valuenow={score.components[c]}
                    >
                      <div className="h-full bg-text-1" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-right text-readout">
                      {score.components[c].toFixed(1)}
                      <span className="text-text-3"> / {score.componentMax[c]}</span>
                    </span>
                  </div>
                );
              })}
            </div>
            {unscored.length > 0 && (
              <p className="text-small text-text-2">
                Scoring tree {score.treeVersion.replace('default_', '')} does not score{' '}
                {unscored.map((c) => COMPONENT_LABEL[c].toLowerCase()).join(' or ')}.
              </p>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Penalties and bonuses">
            <span className="text-label">{penalties.length}</span>
          </PanelHeader>
          {penalties.length === 0 ? (
            <StatusNotice title="No penalties or bonuses." />
          ) : (
            <table className="w-full border-collapse" aria-label="Penalties and bonuses">
              <thead>
                <tr>
                  <th className={TH}>Time</th>
                  <th className={cn(TH, 'text-right')}>Points</th>
                  <th className={TH}>What happened</th>
                </tr>
              </thead>
              <tbody>
                {penalties.map((p, i) => (
                  <tr key={i} className="border-t border-line-1">
                    <td className={cn(TD, 'text-readout text-text-2')}>
                      {p.tMs === undefined ? '—' : formatClock(p.tMs)}
                    </td>
                    <td
                      className={cn(
                        TD,
                        'text-right text-readout',
                        p.unavoidable
                          ? 'text-text-3'
                          : p.points < 0
                            ? 'text-crit'
                            : p.points > 0
                              ? 'text-ok'
                              : 'text-text-2',
                      )}
                    >
                      {p.points > 0 ? '+' : ''}
                      {p.points}
                    </td>
                    <td className={cn(TD, 'text-body')}>
                      {humaniseFeedback(p.feedback)}
                      {p.unavoidable && (
                        <span className="text-small text-text-3"> · not counted (unavoidable)</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="What was there vs what you did">
          <span className="text-label">
            {contacts.length} {contacts.length === 1 ? 'contact' : 'contacts'}
          </span>
        </PanelHeader>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" aria-label="Per contact">
            <thead>
              <tr>
                <th className={TH}>Was really</th>
                <th className={TH}>Your tracks</th>
                <th className={cn(TH, 'text-right')}>Marked at</th>
                <th className={cn(TH, 'text-right')}>Latency</th>
                <th className={TH}>Your class</th>
                <th className={TH}>Responses</th>
                <th className={TH}>Outcome</th>
                <th className={cn(TH, 'text-right')}>Points</th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.contactId} className="border-t border-line-1">
                  <td className={TD}>
                    <span className="flex items-center gap-2 text-body">
                      <AffiliationSymbol affiliation={trueAffiliation(c)} />
                      {classLabel(c.trueClass)}
                    </span>
                    {c.feedback.length > 0 && (
                      <ul className="mt-1 space-y-0.5 pl-6 text-small text-text-2">
                        {c.feedback.map((f, i) => (
                          <li key={i}>{humaniseFeedback(f)}</li>
                        ))}
                      </ul>
                    )}
                  </td>
                  <td className={cn(TD, 'text-readout text-text-2')}>
                    {c.trackIds.join(', ') || '—'}
                  </td>
                  <td className={cn(TD, 'text-right text-readout')}>
                    {c.traineeDetectedTMs === undefined ? '—' : formatClock(c.traineeDetectedTMs)}
                  </td>
                  <td className={cn(TD, 'text-right text-readout')}>
                    {c.detectionLatencyS === undefined ? (
                      '—'
                    ) : (
                      <>
                        {c.detectionLatencyS.toFixed(1)}
                        <span className="text-text-3"> s</span>
                      </>
                    )}
                  </td>
                  <td
                    className={cn(
                      TD,
                      'text-body',
                      c.classificationCorrect === 'WRONG' && 'text-warn',
                    )}
                  >
                    {classLabel(c.classifiedAs)}
                  </td>
                  <td className={cn(TD, 'text-body')}>
                    {c.responses.length
                      ? c.responses.map((r) => RESPONSE_LABEL[r] ?? r).join(', ')
                      : '—'}
                  </td>
                  <td className={TD}>
                    {c.outcome && (
                      <Badge tone={OUTCOME_TONE[c.outcome]}>
                        {c.outcome === 'LEAKED' && c.droppedTMs !== undefined
                          ? 'Payload delivered'
                          : OUTCOME_LABEL[c.outcome]}
                      </Badge>
                    )}
                    {c.droppedTMs !== undefined && (
                      <p className="mt-1 whitespace-nowrap text-small text-text-2">
                        Payload dropped at{' '}
                        <span className="font-mono tnum">{formatClock(c.droppedTMs)}</span>
                      </p>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right text-readout')}>
                    {c.points === undefined ? '—' : c.points.toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
