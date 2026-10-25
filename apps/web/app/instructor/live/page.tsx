'use client';

import type { ActiveSessionsResponse } from '@vyuh/shared';
import { Suspense, useEffect, useState } from 'react';
import {
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  SkeletonRows,
} from '@/components/hud/primitives';
import { UnitNav } from '@/components/builder-nav';
import { RequireStaff } from '@/components/require-staff';
import { useUnitScope, UnitSelect } from '@/components/unit-scope';
import { Table, TableNotice, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { formatClock, formatDateTime } from '@/lib/strings';
import { ago } from '@/lib/unit-views';
import { useApiData } from '@/lib/use-api-data';

// Live session monitor (Phase 6C, read-only): sessions running now in the unit,
// polled every 10 s. No score: the server scores a session when it ends.

const POLL_MS = 10_000;

const MODE: Record<'PRACTICE' | 'ASSESSMENT', string> = {
  PRACTICE: 'Practice',
  ASSESSMENT: 'Assessment',
};

function Rows({ d }: { d: ActiveSessionsResponse }) {
  const now = Date.parse(d.polledAt);
  return (
    <Table data-testid="live">
      <thead>
        <tr>
          <Th>Trainee</Th>
          <Th className="w-full">Scenario</Th>
          <Th>Mode</Th>
          <Th align="right">Sim time</Th>
          <Th>Started</Th>
          <Th>Last update</Th>
        </tr>
      </thead>
      <tbody>
        {d.items.length === 0 && (
          <TableNotice colSpan={6}>
            No sessions running in this unit. A session shows here while its trainee plays.
          </TableNotice>
        )}
        {d.items.map((s) => (
          <Tr key={s.sessionId} data-testid="live-row">
            <Td className="max-w-48 truncate text-body" title={s.userName}>
              {s.userName}
            </Td>
            <Td className="max-w-0 truncate text-body" title={s.scenarioName}>
              {s.scenarioCode && (
                <span className="mr-2 text-readout text-text-2">{s.scenarioCode}</span>
              )}
              {s.scenarioName}
            </Td>
            <Td className="text-small text-text-body">{MODE[s.mode]}</Td>
            <Td align="right" className="text-readout">
              {formatClock(s.simTMs)}
            </Td>
            <Td className="text-readout text-text-2">{formatDateTime(s.startedAt)}</Td>
            <Td className="text-readout text-text-2">{ago(s.lastBatchAt, now)}</Td>
          </Tr>
        ))}
      </tbody>
    </Table>
  );
}

function Live() {
  const scope = useUnitScope();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), POLL_MS);
    return () => clearInterval(id);
  }, []);
  const live = useApiData(scope.unitId ? `${scope.unitId}:${tick}` : null, (signal) =>
    api.activeSessions(scope.unitId!, signal),
  );
  const error = scope.error ?? live.error;
  return (
    <div className="space-y-6">
      <PageHeader
        reference="Unit · live sessions · read-only"
        title={scope.unit?.name ?? 'Unit'}
        context="Who is in a session right now. Updates every 10 s; scores appear when a session ends."
        {...(live.data
          ? {
              facts: [
                { label: 'Running', value: live.data.items.length },
                {
                  label: 'Checked',
                  value: formatDateTime(live.data.polledAt).slice(11),
                },
              ],
            }
          : {})}
        actions={<UnitSelect units={scope.units} unitId={scope.unitId} />}
      />
      <UnitNav />
      <Panel>
        <PanelHeader title="Sessions running now" />
        {error !== null && error !== undefined ? (
          <ErrorState
            error={error}
            subject="live sessions"
            onRetry={() => {
              scope.reload();
              live.reload();
            }}
          />
        ) : !live.data ? (
          <SkeletonRows rows={3} label="Checking for running sessions" />
        ) : (
          <Rows d={live.data} />
        )}
      </Panel>
    </div>
  );
}

export default function LivePage() {
  return (
    <RequireStaff>
      <Suspense fallback={null}>
        <Live />
      </Suspense>
    </RequireStaff>
  );
}
