import type { Score, ScoreComponents } from '@vyuh/shared';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CLASS_LABEL } from '@/lib/strings';

const COMPONENT_LABEL: Record<keyof ScoreComponents, string> = {
  detection: 'Detection',
  classification: 'Classification',
  decision: 'Decision',
  report: 'Report',
  efficiency: 'Efficiency',
};

const OUTCOME_TONE: Record<string, 'ok' | 'warn' | 'crit'> = {
  NEUTRALISED: 'ok',
  IGNORED_OK: 'ok',
  LEAKED: 'crit',
  FRATRICIDE: 'crit',
  WRONGLY_ENGAGED: 'crit',
  UNRESOLVED: 'warn',
};

/** Result screen: server-computed total, component bars and per-contact feedback. */
export function ResultScreen({ score, scenarioName }: { score: Score; scenarioName: string }) {
  const components = (Object.keys(COMPONENT_LABEL) as (keyof ScoreComponents)[]).filter(
    (c) => score.componentMax[c] > 0,
  );
  return (
    <div className="space-y-4" data-testid="result-screen">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-label">Debrief · {scenarioName}</p>
          <h1 className="font-mono text-readout-lg font-semibold tnum" data-testid="score-total">
            {score.total.toFixed(0)}
            <span className="text-h2 text-text-2"> / 100</span>
          </h1>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="secondary">
            <Link href="/train">Back to scenarios</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Kill-chain breakdown</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {components.map((c) => {
            const pct = (score.components[c] / score.componentMax[c]) * 100;
            return (
              <div key={c} className="grid grid-cols-[9rem_1fr_6rem] items-center gap-3 text-body">
                <span className="text-label">{COMPONENT_LABEL[c]}</span>
                <div className="h-3 bg-bg-3" role="meter" aria-valuenow={pct} aria-label={c}>
                  <div className="h-full bg-primary-bg" style={{ width: `${pct}%` }} />
                </div>
                <span className="text-right font-mono tnum">
                  {score.components[c].toFixed(1)} / {score.componentMax[c]}
                </span>
              </div>
            );
          })}
          <p className="text-small text-text-2">
            Scored on the server with tree {score.treeVersion}. Contact reports and efficiency are
            scored from a later phase.
          </p>
        </CardContent>
      </Card>

      {score.penalties.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Penalties and bonuses</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1 text-body">
              {score.penalties.map((p, i) => (
                <li key={i} className="flex gap-3">
                  <span className={p.points < 0 ? 'font-mono text-crit' : 'font-mono text-ok'}>
                    {p.points > 0 ? '+' : ''}
                    {p.points}
                  </span>
                  <span>{p.feedback}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {score.perContact.map((c) => (
          <Card key={c.contactId}>
            <CardHeader className="flex items-center justify-between">
              <CardTitle>
                {c.isThreat ? 'Threat' : 'Non-threat'} · tracks {c.trackIds.join(', ') || 'none'}
              </CardTitle>
              {c.outcome && <Badge tone={OUTCOME_TONE[c.outcome] ?? 'warn'}>{c.outcome}</Badge>}
            </CardHeader>
            <CardContent className="space-y-2 text-body">
              <dl className="grid grid-cols-[10rem_1fr] gap-y-1 text-readout">
                <dt className="text-label">Detection latency</dt>
                <dd>
                  {c.detectionLatencyS === undefined ? '—' : `${c.detectionLatencyS.toFixed(1)} s`}
                </dd>
                <dt className="text-label">Classified as</dt>
                <dd>{c.classifiedAs ? CLASS_LABEL[c.classifiedAs] : '—'}</dd>
                <dt className="text-label">Responses</dt>
                <dd>{c.responses.length ? c.responses.join(', ') : '—'}</dd>
              </dl>
              <ul className="list-disc space-y-1 pl-5">
                {c.feedback.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
