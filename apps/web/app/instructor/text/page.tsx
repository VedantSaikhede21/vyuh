'use client';

import type { AiStatusResponse, FromTextResponse, GenerateRequest } from '@vyuh/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Skeleton,
  StatusNotice,
  Tooltip,
} from '@/components/hud/primitives';
import { BuilderNav } from '@/components/builder-nav';
import { RequireStaff } from '@/components/require-staff';
import { Button } from '@/components/ui/button';
import { FIELD_CLASS } from '@/components/ui/input';
import { Kbd } from '@/components/hud/primitives';
import { api } from '@/lib/api';
import { DISABLED_REASON, parameterRows } from '@/lib/ai/from-text';
import { cn } from '@/lib/utils';

// Text-to-scenario (SPEC §13.2): the LLM reads the text into generator parameters only;
// the instructor checks them, then the deterministic generator builds the scenario and
// its briefing opens. Off (with the reason) when the server has LLM_ENABLED=false.

const EXAMPLES = [
  'night swarm of 8 from the north with 2 decoys, hard',
  'foggy dawn on the mountain, two FPVs from the west, weapons tight',
  'easy daytime lesson in town, one small quad, few birds',
];

type Parse =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'error'; message: string }
  | { kind: 'ok'; data: FromTextResponse; text: string };

function FromText() {
  const router = useRouter();
  const [status, setStatus] = useState<AiStatusResponse | null>(null);
  const [statusError, setStatusError] = useState(false);
  const [text, setText] = useState(EXAMPLES[0]!);
  const [parse, setParse] = useState<Parse>({ kind: 'idle' });
  const [gen, setGen] = useState<{ kind: 'idle' | 'busy' } | { kind: 'error'; message: string }>({
    kind: 'idle',
  });

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .aiStatus(ctrl.signal)
      .then(setStatus)
      .catch(() => {
        if (!ctrl.signal.aborted) setStatusError(true);
      });
    return () => ctrl.abort();
  }, []);

  const off = status !== null && !status.llmEnabled;
  const read = async () => {
    if (off || text.trim().length < 3) return;
    setParse({ kind: 'busy' });
    setGen({ kind: 'idle' });
    try {
      const data = await api.scenarioFromText(text.trim());
      setParse({ kind: 'ok', data, text: text.trim() });
    } catch (err) {
      setParse({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' });
    }
  };
  const generate = async (req: GenerateRequest) => {
    setGen({ kind: 'busy' });
    try {
      const { scenarioId } = await api.generateScenario(req);
      router.push(`/train/scenario/${scenarioId}`);
    } catch (err) {
      setGen({ kind: 'error', message: err instanceof Error ? err.message : 'Network error' });
    }
  };
  const stale = parse.kind === 'ok' && parse.text !== text.trim();

  return (
    <div className="space-y-4" data-testid="from-text">
      <PageHeader
        crumbs={[{ label: 'Unit', href: '/instructor' }, { label: 'Scenario builder' }]}
        title="Scenario from text"
        context="Describe the scenario. The LLM reads it into generator parameters only; you check them, then the generator builds the scenario from them, the same way every time."
      />
      <BuilderNav />
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel>
          <PanelHeader title="Describe the scenario">
            {status?.llmEnabled && <span className="text-label">LLM · {status.model}</span>}
          </PanelHeader>
          <PanelBody className="space-y-3">
            <label className="block space-y-1">
              <span className="text-label">Scenario text</span>
              <textarea
                className={cn(FIELD_CLASS, 'h-24 resize-none py-2')}
                value={text}
                maxLength={600}
                disabled={off}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    void read();
                  }
                }}
                aria-describedby="text-hint"
                data-testid="from-text-input"
              />
            </label>
            <p id="text-hint" className="text-small text-text-2">
              Threats, numbers, direction, time of day, weather, terrain, ROE, difficulty.{' '}
              <span className="font-mono tnum">{text.length}</span> / 600
            </p>
            <div className="space-y-1">
              <p className="text-label">Examples</p>
              <ul className="space-y-1">
                {EXAMPLES.map((ex) => (
                  <li key={ex}>
                    <button
                      type="button"
                      disabled={off}
                      onClick={() => setText(ex)}
                      className="text-left text-small text-text-2 underline decoration-line-2 underline-offset-2 hover:text-text-1 disabled:no-underline disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-select"
                    >
                      {ex}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
            {off ? (
              <Tooltip content={DISABLED_REASON}>
                <span className="inline-block" tabIndex={0} data-testid="from-text-disabled">
                  <Button variant="primary" disabled>
                    Read parameters
                  </Button>
                </span>
              </Tooltip>
            ) : (
              <Button
                variant="primary"
                disabled={status === null || parse.kind === 'busy' || text.trim().length < 3}
                onClick={() => void read()}
                data-testid="from-text-read"
              >
                {parse.kind === 'busy' ? 'Reading the text…' : 'Read parameters'} <Kbd>Enter</Kbd>
              </Button>
            )}
            {off && (
              <StatusNotice title="LLM off on this server.">
                {DISABLED_REASON}{' '}
                <Link href="/instructor/builder" className="underline">
                  Open the Builder
                </Link>
              </StatusNotice>
            )}
            {statusError && (
              <StatusNotice tone="error" title="Could not check whether the LLM is on." />
            )}
          </PanelBody>
        </Panel>

        <Panel data-testid="from-text-params">
          <PanelHeader title="Parsed parameters — check before generating">
            {parse.kind === 'ok' && <span className="text-label">{parse.data.model}</span>}
          </PanelHeader>
          {parse.kind === 'idle' && (
            <StatusNotice title="No parameters yet.">
              Write the scenario on the left and choose Read parameters. Nothing is generated until
              you confirm.
            </StatusNotice>
          )}
          {parse.kind === 'busy' && <Skeleton label="Reading the text · LLM" className="p-3" />}
          {parse.kind === 'error' && (
            <StatusNotice
              tone="error"
              title={`Could not read the text: ${parse.message}`}
              onRetry={() => void read()}
            />
          )}
          {parse.kind === 'ok' && (
            <div className="space-y-3 p-3">
              <table className="w-full border-collapse" aria-label="Parsed parameters">
                <tbody>
                  {parameterRows(parse.data.request).map((r) => (
                    <tr key={r.label} className="border-t border-line-1 first:border-t-0">
                      <th scope="row" className="h-8 w-48 pr-3 text-left text-label font-medium">
                        {r.label}
                      </th>
                      <td
                        className={cn('h-8 text-readout', r.auto ? 'text-text-2' : 'text-text-1')}
                      >
                        {r.value}
                        {r.unit && <span className="text-text-2"> {r.unit}</span>}
                        {r.auto && <span className="ml-2 text-small">set by the generator</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parse.data.notes.length > 0 && (
                <div className="space-y-1 border-t border-line-1 pt-2">
                  <p className="text-label">Changed or ignored</p>
                  <ul
                    className="list-disc space-y-0.5 pl-5 text-small text-warn"
                    data-testid="from-text-notes"
                  >
                    {parse.data.notes.map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                </div>
              )}
              {stale && (
                <p className="text-small text-warn">
                  The text changed since these were read. Read it again first.
                </p>
              )}
              {gen.kind === 'error' && (
                <StatusNotice tone="error" title={`Could not generate: ${gen.message}`} />
              )}
              <div className="flex flex-wrap gap-2 border-t border-line-1 pt-3">
                <Button
                  variant="primary"
                  disabled={gen.kind === 'busy' || stale}
                  onClick={() => void generate(parse.data.request)}
                  data-testid="from-text-generate"
                >
                  {gen.kind === 'busy' ? 'Generating…' : 'Generate and open briefing'}
                </Button>
                <Button variant="ghost" onClick={() => setParse({ kind: 'idle' })}>
                  Discard
                </Button>
              </div>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}

export default function FromTextPage() {
  return (
    <RequireStaff>
      <FromText />
    </RequireStaff>
  );
}
