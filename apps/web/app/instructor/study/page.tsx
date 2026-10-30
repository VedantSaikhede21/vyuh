'use client';

import type { StudyResultsResponse } from '@vyuh/shared';
import { useState } from 'react';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  SkeletonRows,
} from '@/components/hud/primitives';
import { FactRow } from '@/components/layout/hero';
import { RequireAuth } from '@/components/require-auth';
import { Button } from '@/components/ui/button';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useApiData } from '@/lib/use-api-data';
import { firstLastMean } from '@/lib/study';

// User study results (Part 6I): real participants under codes, kept apart from
// demo data and labelled so nobody can take one for the other.

function Results({ data }: { data: StudyResultsResponse }) {
  const change = firstLastMean(data.rows);
  return (
    <div className="space-y-6">
      <FactRow
        className="max-w-3xl"
        facts={[
          { label: 'Participants', value: data.participants },
          { label: 'Assessment runs', value: data.rows.length },
          { label: 'Mean, first run', value: change?.first ?? '—', muted: !change },
          { label: 'Mean, last run', value: change?.last ?? '—', muted: !change },
        ]}
      />
      <Panel>
        <PanelHeader title="Every run" />
        <Table>
          <thead>
            <tr>
              <Th>Participant</Th>
              <Th align="right">Run</Th>
              <Th className="w-full">Scenario</Th>
              <Th align="right">Total</Th>
              <Th align="right">Detection</Th>
              <Th align="right">Exact class</Th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((r) => (
              <Tr key={`${r.participant}-${r.run}`}>
                <Td className="font-mono">{r.participant}</Td>
                <Td align="right">{r.run}</Td>
                <Td>{r.scenario}</Td>
                <Td align="right" className="tnum">
                  {Math.round(r.total)}
                </Td>
                <Td align="right" className="tnum">
                  {r.detectionLatencyS === null ? '—' : `${r.detectionLatencyS} s`}
                </Td>
                <Td align="right" className="tnum">
                  {r.exactClassification === null
                    ? '—'
                    : `${Math.round(r.exactClassification * 100)} %`}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
    </div>
  );
}

function Study() {
  const { data, error, reload } = useApiData('study:results', (signal) => api.study(signal));
  const [exporting, setExporting] = useState(false);
  const exportCsv = () => {
    setExporting(true);
    void api
      .studyCsv()
      .then((text) => {
        const url = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = 'vyuh-user-study.csv';
        a.click();
        URL.revokeObjectURL(url);
      })
      .finally(() => setExporting(false));
  };
  return (
    <div className="space-y-6" data-testid="study-page">
      <PageHeader
        title={`User study: real participants (n = ${data?.participants ?? 0})`}
        context="Assessment runs under participant codes. Demo data is never included."
        actions={
          <Button
            onClick={exportCsv}
            loading={exporting}
            disabled={!data || data.rows.length === 0}
          >
            {exporting ? 'Exporting…' : 'Export CSV'}
          </Button>
        }
      />
      {error !== null ? (
        <Panel>
          <ErrorState error={error} subject="study results" onRetry={reload} />
        </Panel>
      ) : !data ? (
        <Panel>
          <SkeletonRows label="Loading study results" />
        </Panel>
      ) : data.rows.length === 0 ? (
        <Panel>
          <EmptyState title="No study runs yet.">
            Create participants with pnpm study:enrol, then each signs in with a code and runs S01,
            S15 and S04 in Assessment, three rounds.
          </EmptyState>
        </Panel>
      ) : (
        <Results data={data} />
      )}
    </div>
  );
}

export default function StudyPage() {
  return (
    <RequireAuth>
      <Study />
    </RequireAuth>
  );
}
