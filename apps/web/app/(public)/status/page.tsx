'use client';

import type { StatusResponse } from '@vyuh/shared';
import { SIM_VERSION } from '@vyuh/sim-core';
import { useState } from 'react';
import { StateChip } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatDateTime } from '@/lib/strings';
import { useApiData } from '@/lib/use-api-data';

// System status (public, decision 156): up / down and versions only.

const WEB_BUILD = process.env.NEXT_PUBLIC_WEB_BUILD ?? 'unknown';

type State = 'OK' | 'DOWN' | 'ON' | 'OFF' | 'UNKNOWN';

const CHIP: Record<State, { tone: 'ok' | 'crit' | 'muted' | 'neutral'; label: string }> = {
  OK: { tone: 'ok', label: 'OK' },
  DOWN: { tone: 'crit', label: 'Down' },
  ON: { tone: 'neutral', label: 'On' },
  OFF: { tone: 'muted', label: 'Off' },
  UNKNOWN: { tone: 'muted', label: 'Unknown' },
};

function StatusChip({ state }: { state: State }) {
  return (
    <StateChip tone={CHIP[state].tone} data-testid="status-chip">
      {CHIP[state].label}
    </StateChip>
  );
}

function rows(data: StatusResponse | null, failed: boolean): [string, string, State][] {
  if (failed || !data) {
    const s: State = failed ? 'DOWN' : 'UNKNOWN';
    return [
      ['Web app', 'This page', 'OK'],
      ['API', 'Scoring, sessions, scenarios', s],
      ['Database', 'Users, sessions, scores', 'UNKNOWN'],
      ['LLM features', 'Debrief and text-to-scenario (templates when off)', 'UNKNOWN'],
    ];
  }
  return [
    ['Web app', 'This page', 'OK'],
    ['API', 'Scoring, sessions, scenarios', data.components.api],
    ['Database', 'Users, sessions, scores', data.components.database],
    [
      'LLM features',
      'Debrief and text-to-scenario (templates when off)',
      data.components.llmEnabled ? 'ON' : 'OFF',
    ],
  ];
}

export default function StatusPage() {
  const [checked, setChecked] = useState(() => new Date().toISOString());
  // The check time is the key: a new time fetches again.
  const { data, error } = useApiData(checked, (signal) => api.status(signal));
  const failed = error !== null;
  const versions: [string, string][] = [
    ['Web build', WEB_BUILD],
    ['Simulation (SIM_VERSION)', String(SIM_VERSION)],
    ['API', data?.versions.api ?? '—'],
    ['Scenario generator', data ? String(data.versions.generator) : '—'],
    ...Object.entries(data?.versions.terrain ?? {}).map(
      ([preset, rev]) => [`Terrain ${preset}`, `revision ${rev}`] as [string, string],
    ),
  ];
  return (
    <div className="max-w-3xl space-y-6 pb-8">
      <header className="space-y-1 border-b border-line-1 pb-4">
        <p className="text-meta">System status</p>
        <h1 className="text-h1 text-text-1">Status</h1>
        <p className="max-w-prose-ui text-body text-text-body">
          Whether each part of VYUH answers, and which versions are running. Useful when a session
          will not start, and for checking an offline unit install.
        </p>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-readout text-text-2">Checked {formatDateTime(checked)}</span>
        <Button
          size="sm"
          className="min-h-11 sm:min-h-0"
          onClick={() => setChecked(new Date().toISOString())}
        >
          Check again
        </Button>
      </div>
      <section aria-labelledby="components-h" className="space-y-2">
        <h2 id="components-h" className="text-h2">
          Components
        </h2>
        <div className="overflow-x-auto border border-line-1">
          <Table data-testid="status-components">
            <thead>
              <tr>
                <Th>Component</Th>
                <Th className="w-full">Covers</Th>
                <Th>State</Th>
              </tr>
            </thead>
            <tbody>
              {rows(data, failed).map(([name, covers, state]) => (
                <Tr key={name}>
                  <Td className="text-body text-text-1">{name}</Td>
                  <Td className="whitespace-normal py-1.5 text-small text-text-body">{covers}</Td>
                  <Td>
                    <StatusChip state={state} />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
        {failed && (
          <p className="text-small text-text-body" role="status">
            The API did not answer. Sessions cannot start or be scored until it is back; try again
            in a minute.
          </p>
        )}
      </section>
      <section aria-labelledby="versions-h" className="space-y-2">
        <h2 id="versions-h" className="text-h2">
          Versions
        </h2>
        <div className="border border-line-1">
          <Table data-testid="status-versions" className="table-fixed">
            <tbody>
              {versions.map(([name, v]) => (
                <Tr key={name}>
                  <Td className="w-[55%] whitespace-normal py-1.5 text-body text-text-body [overflow-wrap:anywhere]">
                    {name}
                  </Td>
                  {/* Fixed shares (55 / 45 %): long versions wrap instead of widening the page or
                      collapsing the column (break-ui 6C, 360 px). */}
                  <Td
                    align="right"
                    className="whitespace-normal py-1.5 text-readout text-text-1 [overflow-wrap:anywhere]"
                  >
                    {v}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </div>
      </section>
    </div>
  );
}
