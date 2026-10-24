import type { AiTrustMetrics } from '@vyuh/shared';
import { Readout } from '@/components/hud/primitives';
import { trustAnswer } from '@/lib/aar/answers';

// AI-assist over- and under-trust (SPEC §9.4): an insight next to the score, never in it.

const pct = (v: number | null) => (v === null ? '—' : String(Math.round(v * 100)));

export function TrustInsight({
  trust,
  compact = false,
}: {
  trust: AiTrustMetrics;
  /** The 320 px AAR side panel. */
  compact?: boolean;
}) {
  const ignoredWrong = trust.shownWrong - trust.acceptedWrong - trust.rejectedWrong;
  const ignoredRight = trust.shownCorrect - trust.acceptedCorrect - trust.rejectedCorrect;
  const TH = 'h-6 px-2 text-left text-label font-medium';
  const TD = 'h-7 px-2 text-right text-readout';
  return (
    <div className="space-y-2" data-testid="trust-metrics">
      {compact && <p className="text-small text-text-1">{trustAnswer(trust)}</p>}
      <div className={compact ? 'flex flex-wrap gap-4' : 'flex flex-wrap gap-8'}>
        <Readout
          label="Over-trust"
          value={pct(trust.overTrust)}
          unit={trust.overTrust === null ? undefined : '%'}
          flash={false}
        />
        <Readout
          label="Under-trust"
          value={pct(trust.underTrust)}
          unit={trust.underTrust === null ? undefined : '%'}
          flash={false}
        />
        <Readout
          label={compact ? 'Shown' : 'Suggestions shown'}
          value={trust.shown}
          flash={false}
        />
      </div>
      <table className="w-full max-w-md border-collapse" aria-label="AI suggestions by outcome">
        <thead>
          <tr className="bg-bg-2">
            <th className={TH}>Suggestion was</th>
            <th className={`${TH} text-right`}>Accepted</th>
            <th className={`${TH} text-right`}>Rejected</th>
            <th className={`${TH} text-right`}>Ignored</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-t border-line-1">
            <td className="h-7 px-2 text-body">Wrong</td>
            <td className={TD}>{trust.acceptedWrong}</td>
            <td className={TD}>{trust.rejectedWrong}</td>
            <td className={TD}>{ignoredWrong}</td>
          </tr>
          <tr className="border-t border-line-1">
            <td className="h-7 px-2 text-body">Right</td>
            <td className={TD}>{trust.acceptedCorrect}</td>
            <td className={TD}>{trust.rejectedCorrect}</td>
            <td className={TD}>{ignoredRight}</td>
          </tr>
        </tbody>
      </table>
      <p className="text-small text-text-3">
        Insight only, not part of the score. Over-trust = wrong suggestions accepted; under-trust =
        right suggestions rejected.
      </p>
    </div>
  );
}
