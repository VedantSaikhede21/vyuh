'use client';

import type { DebriefFallbackReason, DebriefResponse } from '@vyuh/shared';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Panel, PanelHeader, Skeleton, StateChip, StatusNotice } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { humaniseFeedback } from '@/lib/hud/feedback';
import { isStaff } from '@/lib/nav';
import { formatClock } from '@/lib/strings';
import { cn } from '@/lib/utils';

// Session debrief (SPEC §13.1): LLM-written, or the template built from the scoring
// feedback. Which one is shown is always labelled. Each mistake's time opens the replay
// there (the result screen) or seeks it (the AAR side panel).

export const FALLBACK_TEXT: Record<DebriefFallbackReason, string> = {
  LLM_DISABLED: 'LLM off on this server',
  ENDED_EARLY: 'Run ended early',
  TIMEOUT: 'LLM timed out',
  INVALID_OUTPUT: 'LLM answer failed validation',
  ERROR: 'LLM unavailable',
  RATE_LIMITED: 'LLM rate limit reached',
  BUDGET: 'Daily LLM budget used up',
};

export function sourceLabel(d: DebriefResponse): { chip: string; detail: string } {
  if (d.source === 'LLM') return { chip: 'LLM', detail: `Written by ${d.model} from your score` };
  const why = d.fallbackReason ? FALLBACK_TEXT[d.fallbackReason] : 'template';
  return { chip: 'TEMPLATE', detail: `Built from the scoring feedback · ${why}` };
}

export function useDebrief(sessionId: string) {
  const [state, setState] = useState<
    { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: DebriefResponse }
  >({ kind: 'loading' });
  const [attempt, setAttempt] = useState({ n: 0, regenerate: false });
  useEffect(() => {
    const ctrl = new AbortController();
    (attempt.regenerate ? api.regenerateDebrief : api.debrief)(sessionId, ctrl.signal)
      .then((data) => setState({ kind: 'ok', data }))
      .catch((err: unknown) => {
        if (!ctrl.signal.aborted)
          setState({
            kind: 'error',
            message: err instanceof Error ? err.message : 'Network error',
          });
      });
    return () => ctrl.abort();
  }, [sessionId, attempt]);
  const retry = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((a) => ({ n: a.n + 1, regenerate: false }));
  }, []);
  const regenerate = useCallback(() => {
    setState({ kind: 'loading' });
    setAttempt((a) => ({ n: a.n + 1, regenerate: true }));
  }, []);
  return { state, retry, regenerate };
}

const TIME_LINK =
  'font-mono tnum text-text-2 underline decoration-line-2 underline-offset-2 hover:text-text-1 hover:decoration-text-2 focus-visible:outline-2 focus-visible:outline-select';

function MistakeTime({
  sessionId,
  tMs,
  onJump,
}: {
  sessionId: string;
  tMs: number;
  onJump?: ((tMs: number) => void) | undefined;
}) {
  const label = `Open the replay at ${formatClock(tMs)}`;
  return onJump ? (
    <button type="button" className={TIME_LINK} aria-label={label} onClick={() => onJump(tMs)}>
      {formatClock(tMs)}
    </button>
  ) : (
    <Link
      href={`/aar/session/${sessionId}?t=${tMs}`}
      className={TIME_LINK}
      aria-label={label}
      data-testid="debrief-time"
    >
      {formatClock(tMs)}
    </Link>
  );
}

/** Debrief body; `compact` for the 320 px AAR side panel. */
export function DebriefBody({
  data,
  compact = false,
  onJump,
}: {
  data: DebriefResponse;
  compact?: boolean;
  onJump?: (tMs: number) => void;
}) {
  const c = data.content;
  return (
    <div className={cn('space-y-3', compact ? 'p-2' : 'p-3')} data-testid="debrief-body">
      <p className={compact ? 'text-small text-text-1' : 'text-body'}>
        {humaniseFeedback(c.summary)}
      </p>
      {c.strengths.length > 0 && (
        <div className="space-y-1">
          <p className="text-label">Went well</p>
          <ul className="list-disc space-y-0.5 pl-5 text-small text-text-1">
            {c.strengths.map((s, i) => (
              <li key={i}>{humaniseFeedback(s)}</li>
            ))}
          </ul>
        </div>
      )}
      <div className="space-y-1">
        <p className="text-label">Mistakes</p>
        {c.mistakes.length === 0 ? (
          <p className="text-small text-text-2">None found in this session.</p>
        ) : compact ? (
          <ol className="space-y-2">
            {c.mistakes.map((m, i) => (
              <li key={i} className="space-y-0.5 text-small">
                <p>
                  <MistakeTime sessionId={data.sessionId} tMs={m.tMs} onJump={onJump} />{' '}
                  <span className="text-text-1">{humaniseFeedback(m.what)}</span>
                </p>
                <p className="text-text-2">Instead: {humaniseFeedback(m.doInstead)}</p>
              </li>
            ))}
          </ol>
        ) : (
          <table className="w-full border-collapse" aria-label="Debrief mistakes">
            <thead>
              <tr>
                {['Time', 'What happened', 'Why it matters', 'Do instead'].map((h) => (
                  <th
                    key={h}
                    className="h-7 bg-bg-2 px-2 text-left text-label font-medium whitespace-nowrap"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {c.mistakes.map((m, i) => (
                <tr key={i} className="border-t border-line-1 align-top">
                  <td className="px-2 py-1.5 text-readout">
                    <MistakeTime sessionId={data.sessionId} tMs={m.tMs} onJump={onJump} />
                  </td>
                  <td className="px-2 py-1.5 text-body">{humaniseFeedback(m.what)}</td>
                  <td className="px-2 py-1.5 text-small text-text-2">
                    {humaniseFeedback(m.whyItMatters)}
                  </td>
                  <td className="px-2 py-1.5 text-small text-text-1">
                    {humaniseFeedback(m.doInstead)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-label">Next drill</p>
        <p className="text-small text-text-1">{humaniseFeedback(c.drill)}</p>
      </div>
    </div>
  );
}

export function SourceChip({ data }: { data: DebriefResponse }) {
  const { chip, detail } = sourceLabel(data);
  return (
    <Tooltip content={detail} align="end">
      <span className="flex items-center gap-2" data-testid="debrief-source" tabIndex={0}>
        <StateChip tone={data.source === 'LLM' ? 'neutral' : 'muted'}>{chip}</StateChip>
        <span className="hidden text-small text-text-2 sm:inline">{detail}</span>
      </span>
    </Tooltip>
  );
}

/** Full panel for the result screen and the timeline fallback. */
export function DebriefPanel({ sessionId }: { sessionId: string }) {
  const { state, retry, regenerate } = useDebrief(sessionId);
  const { user } = useAuth();
  // A template kept because the LLM answer failed validation is not rebuilt on its
  // own (the LLM would likely fail again); staff can ask for it (decision 151).
  const stale =
    state.kind === 'ok' &&
    state.data.source === 'TEMPLATE' &&
    state.data.fallbackReason === 'INVALID_OUTPUT';
  return (
    <Panel data-testid="debrief">
      <PanelHeader title="Instructor debrief">
        {state.kind === 'ok' && (
          <span className="flex items-center gap-2">
            <SourceChip data={state.data} />
            {stale && isStaff(user?.role) && (
              <Button
                size="hud"
                variant="secondary"
                onClick={regenerate}
                data-testid="regenerate-debrief"
              >
                Regenerate debrief
              </Button>
            )}
          </span>
        )}
      </PanelHeader>
      <DebriefState state={state} retry={retry} />
    </Panel>
  );
}

export function DebriefState({
  state,
  retry,
  compact = false,
  onJump,
}: {
  state: ReturnType<typeof useDebrief>['state'];
  retry: () => void;
  compact?: boolean;
  onJump?: (tMs: number) => void;
}) {
  if (state.kind === 'loading')
    return <Skeleton label="Writing debrief · up to 40 s with the LLM" className="p-3" />;
  if (state.kind === 'error')
    return (
      <StatusNotice
        tone="error"
        title={`Could not load the debrief: ${state.message}`}
        onRetry={retry}
      />
    );
  return <DebriefBody data={state.data} compact={compact} {...(onJump ? { onJump } : {})} />;
}
