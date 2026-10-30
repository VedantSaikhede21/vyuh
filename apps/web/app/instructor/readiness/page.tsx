'use client';

import type { ReadinessResponse } from '@vyuh/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense } from 'react';
import {
  ErrorState,
  PageHeader,
  Panel,
  PanelHeader,
  SkeletonRows,
  StatusNotice,
} from '@/components/hud/primitives';
import { UnitNav } from '@/components/builder-nav';
import { RequireStaff } from '@/components/require-staff';
import { useUnitScope, UnitSelect } from '@/components/unit-scope';
import { Badge } from '@/components/ui/badge';
import { Table, TableNotice, Td, Th, Tr } from '@/components/ui/table';
import { STAGE_LABEL } from '@/lib/aar/answers';
import { readinessAnswer } from '@/lib/unit-views';
import { api } from '@/lib/api';
import { formatCount, formatDate } from '@/lib/strings';
import { useApiData } from '@/lib/use-api-data';

// Unit readiness board (Phase 6C, UI-PREP §2): one row per trainee — level,
// sign-off waiting, last assessment, weakest stage, overdue assignments.

const LEVEL_NAME: Record<string, string> = {
  BASIC_OPERATOR: 'Basic operator',
  SENSOR_OPERATOR: 'Sensor operator',
  ENGAGEMENT_CONTROLLER: 'Engagement controller',
  INSTRUCTOR: 'Instructor',
};

function Board({ d }: { d: ReadinessResponse }) {
  const router = useRouter();
  return (
    <Panel>
      <PanelHeader title="Who is ready for what?">
        <span className="text-label">A row opens the service record</span>
      </PanelHeader>
      <p className="border-b border-line-1 px-3 py-2 text-body text-text-1">{readinessAnswer(d)}</p>
      <Table data-testid="readiness">
        <thead>
          <tr>
            <Th className="w-full">Trainee</Th>
            <Th>Level</Th>
            <Th>Sign-off</Th>
            <Th align="right">Assessments</Th>
            <Th>Last assessment</Th>
            <Th align="right">Last total</Th>
            <Th>Weakest stage</Th>
            <Th align="right">Overdue</Th>
          </tr>
        </thead>
        <tbody>
          {d.rows.length === 0 && (
            <TableNotice colSpan={8}>No trainees in this unit yet.</TableNotice>
          )}
          {d.rows.map((r) => (
            <Tr
              key={r.userId}
              interactive
              data-testid="readiness-row"
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a')) return;
                router.push(`/record?user=${r.userId}`);
              }}
            >
              <Td className="max-w-0 text-body">
                <Link
                  href={`/record?user=${r.userId}`}
                  className="block truncate hover:underline"
                  title={`${r.name}: service record`}
                >
                  {r.name}
                </Link>
              </Td>
              <Td className={r.level ? 'text-body text-text-1' : 'text-small text-text-2'}>
                {r.level ? LEVEL_NAME[r.level] : 'None yet'}
              </Td>
              <Td>
                <span className="flex items-center gap-1.5">
                  {r.awaitingSignoff && (
                    <Badge tone="strong" title="Criteria met: open the record to sign off">
                      {LEVEL_NAME[r.awaitingSignoff]} · ready to sign
                    </Badge>
                  )}
                  {r.reviewDue && <Badge tone="warn">Review due</Badge>}
                  {!r.awaitingSignoff && !r.reviewDue && <span className="text-text-2">—</span>}
                </span>
              </Td>
              <Td align="right" className="text-readout">
                {formatCount(r.assessments)}
              </Td>
              <Td className="text-readout text-text-2">
                {r.lastAssessmentAt ? formatDate(r.lastAssessmentAt) : '—'}
              </Td>
              <Td align="right" className="text-readout">
                {r.lastTotal ?? <span className="text-text-2">—</span>}
              </Td>
              <Td className="text-small text-text-body">
                {r.weakestStage ? STAGE_LABEL[r.weakestStage] : '—'}
              </Td>
              <Td align="right" className="text-readout">
                {r.overdueAssignments > 0 ? (
                  <span className="text-warn">{formatCount(r.overdueAssignments)}</span>
                ) : (
                  <span className="text-text-2">0</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

function Readiness() {
  const scope = useUnitScope();
  const board = useApiData(scope.unitId ? `readiness:${scope.unitId}` : null, (signal) =>
    api.readiness(scope.unitId!, signal),
  );
  const d = board.data && board.data.unit.id === scope.unitId ? board.data : null;
  const error = scope.error ?? board.error;
  return (
    <div className="space-y-6">
      <PageHeader
        reference="Unit · readiness · Assessment sessions only"
        title={scope.unit?.name ?? 'Unit'}
        context="Representative training levels per trainee, who is waiting for a sign-off, and what is overdue."
        {...(d
          ? {
              facts: [
                { label: 'Trainees', value: d.rows.length },
                {
                  label: 'Awaiting sign-off',
                  value: d.rows.filter((r) => r.awaitingSignoff).length,
                },
              ],
            }
          : {})}
        actions={<UnitSelect units={scope.units} unitId={scope.unitId} />}
      />
      <UnitNav />
      {error !== null && error !== undefined ? (
        <Panel>
          <ErrorState
            error={error}
            subject="readiness board"
            onRetry={() => {
              scope.reload();
              board.reload();
            }}
          />
        </Panel>
      ) : scope.units?.length === 0 ? (
        <Panel>
          <StatusNotice title="No units yet.">
            An administrator creates units and assigns trainees.
          </StatusNotice>
        </Panel>
      ) : !d ? (
        <Panel>
          <SkeletonRows rows={6} label="Loading the readiness board" />
        </Panel>
      ) : (
        <Board d={d} />
      )}
    </div>
  );
}

export default function ReadinessPage() {
  return (
    <RequireStaff>
      <Suspense fallback={null}>
        <Readiness />
      </Suspense>
    </RequireStaff>
  );
}
