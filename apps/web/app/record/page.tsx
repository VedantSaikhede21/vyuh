'use client';

import { RECORD_LABEL, type LevelStatus, type ServiceRecordResponse } from '@vyuh/shared';
import { Check, Minus } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import {
  DemoBadge,
  ErrorState,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  QualificationChip,
  SkeletonRows,
  StateChip,
} from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStaff } from '@/lib/nav';
import {
  LEVEL_NUMBER,
  criterionTarget,
  criterionValue,
  highestQualified,
  levelNote,
  signoffByText,
} from '@/lib/record';
import { formatCount, formatDate, formatDateTime } from '@/lib/strings';
import { useApiData } from '@/lib/use-api-data';
import { cn } from '@/lib/utils';

// Service record (SPEC §9.7): representative training levels and endorsements,
// computed on the server from Assessment sessions. `?user=` for staff. Prints on a
// light stylesheet for the unit training file.

function SignOff({
  level,
  userId,
  onDone,
}: {
  level: LevelStatus;
  userId: string;
  onDone: (r: ServiceRecordResponse) => void;
}) {
  const [armed, setArmed] = useState(false);
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'error'; text: string }>({
    kind: 'idle',
  });
  const sign = () => {
    setState({ kind: 'busy' });
    api
      .signOff(userId, level.level)
      .then((r) => {
        setState({ kind: 'idle' });
        setArmed(false);
        onDone(r);
      })
      .catch((err: unknown) =>
        setState({ kind: 'error', text: err instanceof Error ? err.message : 'Not saved.' }),
      );
  };
  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      {armed ? (
        <>
          <Button
            variant="primary"
            size="sm"
            onClick={sign}
            loading={state.kind === 'busy'}
            data-testid="signoff-confirm"
          >
            {state.kind === 'busy' ? 'Signing off…' : `Confirm sign-off · ${level.name}`}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
            Cancel
          </Button>
        </>
      ) : (
        <Button variant="primary" size="sm" onClick={() => setArmed(true)} data-testid="signoff">
          Sign off {level.name}
        </Button>
      )}
      {state.kind === 'error' && (
        <span className="text-small text-crit" role="alert">
          Not signed off: {state.text}
        </span>
      )}
    </div>
  );
}

function LevelPanel({
  level,
  canSign,
  userId,
  onSigned,
}: {
  level: LevelStatus;
  canSign: boolean;
  userId: string;
  onSigned: (r: ServiceRecordResponse) => void;
}) {
  const note = levelNote(level);
  return (
    <Panel data-print-block data-testid={`level-${level.level}`}>
      <PanelHeader title={`${LEVEL_NUMBER[level.level]} · ${level.name}`}>
        {level.reviewDue && (
          <Badge tone="warn" data-testid="review-due">
            Review due
          </Badge>
        )}
        <QualificationChip state={level.state} />
      </PanelHeader>
      <PanelBody className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p
            className={cn(
              'text-body',
              level.state === 'IN_PROGRESS' && level.criteriaMet ? 'text-text-1' : 'text-text-body',
            )}
            data-testid="level-note"
          >
            {level.signoff ? (
              <>
                Signed off by {level.signoff.byName} on {formatDate(level.signoff.at)}
                {level.signoff.isDemo && <DemoBadge className="ml-2 align-middle" />}
              </>
            ) : (
              (note ?? '')
            )}
          </p>
          <p className="text-small text-text-2">{signoffByText(level.signoffBy)}</p>
        </div>
        {level.signoff && note && <p className="text-small text-warn">{note}</p>}
        <Table aria-label={`${level.name} criteria`}>
          <thead>
            <tr>
              <Th className="w-full">Criterion</Th>
              <Th align="right">Now</Th>
              <Th align="right">Needed</Th>
              <Th>Met</Th>
            </tr>
          </thead>
          <tbody>
            {level.criteria.map((c) => (
              <Tr key={c.id}>
                <Td className="whitespace-normal py-1.5 text-body text-text-body">{c.label}</Td>
                <Td
                  align="right"
                  className={cn('text-readout', c.value === null ? 'text-text-2' : 'text-text-1')}
                >
                  {criterionValue(c)}
                </Td>
                <Td align="right" className="text-readout text-text-2">
                  {criterionTarget(c)}
                </Td>
                <Td className="text-label">
                  {c.met ? (
                    <span className="inline-flex items-center gap-1 text-ok">
                      <Check aria-hidden size={14} strokeWidth={1.5} /> Met
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-text-2">
                      <Minus aria-hidden size={14} strokeWidth={1.5} /> Not yet
                    </span>
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        {canSign && <SignOff level={level} userId={userId} onDone={onSigned} />}
      </PanelBody>
    </Panel>
  );
}

function Endorsements({ data }: { data: ServiceRecordResponse }) {
  return (
    <Panel data-print-block data-testid="endorsements">
      <PanelHeader title="Endorsements">
        <span className="text-label">Earned automatically from Assessment sessions</span>
      </PanelHeader>
      <Table>
        <thead>
          <tr>
            <Th className="w-full">Endorsement</Th>
            <Th>State</Th>
            <Th>First earned</Th>
          </tr>
        </thead>
        <tbody>
          {data.endorsements.map((e) => (
            <Tr key={e.code} data-testid="endorsement">
              <Td className="whitespace-normal py-2">
                <p className="text-body text-text-1">{e.name}</p>
                <p className="max-w-prose-ui text-small text-text-body">{e.description}</p>
              </Td>
              <Td className="align-top py-2">
                {e.earned ? (
                  <StateChip tone="ok">Earned</StateChip>
                ) : e.progress ? (
                  <span className="text-readout text-text-2">
                    {e.progress.count} / {e.progress.of}
                  </span>
                ) : (
                  <span className="text-label text-text-2">Not yet</span>
                )}
              </Td>
              {/* Wraps: a 200-character scenario name must not widen the table (break-ui 6C). */}
              <Td className="w-64 min-w-48 whitespace-normal py-2 align-top text-small">
                {e.sessionId && e.earnedAt ? (
                  <Link
                    href={`/aar/session/${e.sessionId}`}
                    className="text-text-1 underline decoration-line-2 underline-offset-2 hover:decoration-text-2"
                    title="Open the after-action review"
                  >
                    {e.scenarioName} · {formatDate(e.earnedAt)}
                  </Link>
                ) : (
                  <span className="text-text-2">—</span>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </Panel>
  );
}

function Record() {
  const { user } = useAuth();
  const params = useSearchParams();
  const userId = params.get('user') ?? user?.id ?? null;
  const staff = isStaff(user?.role);
  const loaded = useApiData(userId, (signal) => api.record(userId!, signal));
  const [signed, setSigned] = useState<ServiceRecordResponse | null>(null);
  const data =
    signed && loaded.data && signed.user.id === loaded.data.user.id ? signed : loaded.data;
  const own = data !== null && data.user.id === user?.id;
  const top = data ? highestQualified(data.levels) : null;
  return (
    <div className="space-y-6">
      <PageHeader
        {...(staff && !own
          ? {
              crumbs: [
                { label: 'Unit', href: '/instructor' },
                { label: 'Readiness', href: '/instructor/readiness' },
                { label: 'Service record' },
              ],
            }
          : { reference: 'Service record' })}
        title={data ? data.user.name : 'Service record'}
        context={
          <>
            {data?.user.unit && <span>{data.user.unit.name}. </span>}
            {RECORD_LABEL}
          </>
        }
        {...(data
          ? {
              facts: [
                { label: 'Level', value: top ? top.name : 'None yet', muted: !top },
                { label: 'Assessments', value: formatCount(data.assessments) },
                { label: 'Rating', value: formatCount(data.rating) },
              ],
            }
          : {})}
        actions={
          data && (
            <Button size="sm" className="print:hidden" onClick={() => window.print()}>
              Print record
            </Button>
          )
        }
      />
      {loaded.error !== null ? (
        <Panel>
          <ErrorState error={loaded.error} subject="service record" onRetry={loaded.reload} />
        </Panel>
      ) : !data ? (
        <Panel>
          <SkeletonRows rows={6} label="Loading the service record" />
        </Panel>
      ) : (
        <>
          {data.demoAssessments > 0 && (
            <p className="flex items-center gap-2 text-small text-text-2">
              <DemoBadge />
              {formatCount(data.demoAssessments)} of {formatCount(data.assessments)} Assessment
              sessions are demo history.
            </p>
          )}
          {data.assessments === 0 && (
            <p className="max-w-prose-ui text-body text-text-body">
              {own
                ? 'Nothing counts yet: levels and endorsements come from Assessment sessions only. Run a scenario in Assessment mode from Training.'
                : 'No Assessment sessions yet.'}
            </p>
          )}
          <div className="space-y-4" data-testid="levels">
            {data.levels.map((lv) => (
              <LevelPanel
                key={lv.level}
                level={lv}
                canSign={data.canSignOff.includes(lv.level)}
                userId={data.user.id}
                onSigned={setSigned}
              />
            ))}
          </div>
          <Endorsements data={data} />
          <p className="hidden text-small text-text-2 print:block">
            Printed {formatDateTime(new Date().toISOString())} from VYUH · ruleset {data.ruleset}.{' '}
            {RECORD_LABEL}
          </p>
        </>
      )}
    </div>
  );
}

export default function RecordPage() {
  return (
    <RequireAuth>
      <Suspense fallback={null}>
        <Record />
      </Suspense>
    </RequireAuth>
  );
}
