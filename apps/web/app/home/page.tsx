'use client';

import type { HomeResponse } from '@vyuh/shared';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DemoBadge,
  ErrorState,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Pips,
  QualificationChip,
  SkeletonRows,
  StageStrip,
  type StageCell,
} from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { isOverdue } from '@/lib/aar/answers';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { lossAnswer, stageLosses, worstStage } from '@/lib/home';
import { NOTICE_KIND_LABEL } from '@/lib/notices';
import { criterionTarget, criterionValue, levelNote } from '@/lib/record';
import { formatCount, formatDate, formatDateTime } from '@/lib/strings';
import { useApiData } from '@/lib/use-api-data';

// Operator home (Phase 6C, UI-PREP §2): what to do next, where points go, what
// came in, and the next training level. Trainees land here after sign-in.

const MODE: Record<'PRACTICE' | 'ASSESSMENT', string> = {
  PRACTICE: 'Practice',
  ASSESSMENT: 'Assessment',
};

function NextUp({ data, firstRun }: { data: HomeResponse; firstRun: boolean }) {
  const a = data.assignment;
  // First run: the tutorial scenario's id comes from the list (only then).
  const s01 = useApiData(firstRun && !a ? 'home-s01' : null, (signal) =>
    api.listScenarios(signal),
  ).data?.items.find((s) => s.code === 'S01');
  if (a) {
    const overdue = isOverdue({ assigned: 1, completed: 0, dueAt: a.dueAt }, new Date());
    return (
      <Panel data-testid="home-assignment">
        <PanelHeader title="Next assignment">
          {data.openAssignments > 1 && (
            <span className="text-label">{formatCount(data.openAssignments)} open</span>
          )}
        </PanelHeader>
        <PanelBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="text-h2 text-text-1 [overflow-wrap:anywhere]">
              {a.scenarioCode && (
                <span className="mr-2 font-mono text-text-2">{a.scenarioCode}</span>
              )}
              {a.scenarioName}
            </p>
            <p className="flex flex-wrap items-center gap-2 text-small text-text-body">
              {a.dueAt ? <>Due {formatDateTime(a.dueAt)}</> : 'No due date'}
              {overdue && <Badge tone="warn">Overdue</Badge>}
              {a.assignedByName && <span>· from {a.assignedByName}</span>}
              <span>· complete it in Assessment mode</span>
            </p>
          </div>
          <Button asChild variant="primary" data-testid="home-primary">
            <Link href={`/train/scenario/${a.scenarioId}`}>Open briefing</Link>
          </Button>
        </PanelBody>
      </Panel>
    );
  }
  if (firstRun) {
    return (
      <Panel data-testid="home-welcome">
        <PanelHeader title="Start here" />
        <PanelBody className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-prose-ui space-y-1">
            <p className="text-h2 text-text-1">S01 First Contact, in Practice</p>
            <p className="text-body text-text-body">
              One small drone, one interceptor. Practice gives a next-step hint in the action bar
              and lets you pause. When it feels routine, run it again in Assessment: only Assessment
              runs count towards your record.
            </p>
          </div>
          <Button asChild variant="primary" data-testid="home-primary">
            <Link href={s01 ? `/train/scenario/${s01.id}` : '/train'}>
              {s01 ? 'Open S01 briefing' : 'Open training'}
            </Link>
          </Button>
        </PanelBody>
      </Panel>
    );
  }
  return (
    <Panel data-testid="home-assignment">
      <PanelHeader title="Next assignment" />
      <PanelBody className="flex flex-wrap items-center justify-between gap-4">
        <p className="text-body text-text-body">
          No open assignments. Choose a scenario, or practise your weakest stage.
        </p>
        <Button asChild>
          <Link href="/train">Open training</Link>
        </Button>
      </PanelBody>
    </Panel>
  );
}

function Losing({ data }: { data: HomeResponse }) {
  const losses = stageLosses(data.stages);
  const worst = worstStage(losses);
  const cells: Partial<Record<string, StageCell>> = Object.fromEntries(
    losses.map((l) => [
      l.stage,
      l.lostPct === null
        ? { value: '—', note: 'not yet', state: 'none' as const }
        : {
            value: `${l.lostPct} %`,
            note: `of ${formatCount(l.total)}`,
            state: worst && worst.stage === l.stage && l.lostPct > 0 ? ('weak' as const) : 'ok',
          },
    ]),
  );
  return (
    <Panel data-testid="home-losing">
      <PanelHeader title="Where am I losing points?">
        {data.demoAssessments > 0 && <DemoBadge />}
      </PanelHeader>
      <PanelBody className="space-y-2">
        <StageStrip stages={cells} aria-label="Share of threat contacts not done right, by stage" />
        <p className="text-body text-text-1">{lossAnswer(losses)}</p>
        <p className="text-small text-text-2">
          Share of threat contacts not done right at each kill-chain stage, over your{' '}
          {formatCount(data.assessments)} Assessment{' '}
          {data.assessments === 1 ? 'session' : 'sessions'}.{' '}
          <Link href="/aar/trends" className="underline decoration-line-2 underline-offset-2">
            Open trends
          </Link>
        </p>
      </PanelBody>
    </Panel>
  );
}

function Recent({ data }: { data: HomeResponse }) {
  const router = useRouter();
  return (
    <Panel data-testid="home-recent">
      <PanelHeader title="Recent sessions">
        <span className="text-label">A row opens its replay</span>
      </PanelHeader>
      {data.recent.length === 0 ? (
        <p className="px-3 py-2 text-small text-text-2">
          No completed sessions yet. Finished runs appear here with a replay.
        </p>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th>
              <Th className="w-full">Scenario</Th>
              <Th>Mode</Th>
              <Th>Difficulty</Th>
              <Th align="right">Total</Th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((s) => (
              <Tr
                key={s.sessionId}
                interactive
                onClick={(e) => {
                  if ((e.target as HTMLElement).closest('a')) return;
                  router.push(`/aar/session/${s.sessionId}`);
                }}
              >
                <Td className="text-readout text-text-2">{formatDate(s.endedAt)}</Td>
                <Td className="max-w-0 text-body">
                  <Link
                    href={`/aar/session/${s.sessionId}`}
                    className="block truncate hover:underline"
                    title={`Replay ${s.scenarioName}`}
                  >
                    {s.scenarioCode && (
                      <span className="mr-2 text-readout text-text-2">{s.scenarioCode}</span>
                    )}
                    {s.scenarioName}
                  </Link>
                </Td>
                <Td className="text-small text-text-body">
                  {MODE[s.mode]}
                  {s.isDemo && <DemoBadge className="ml-2" label="Demo" />}
                </Td>
                <Td>
                  <Pips value={s.difficulty} />
                </Td>
                <Td align="right" className="text-readout">
                  {s.total}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

function NextLevel({ data }: { data: HomeResponse }) {
  const lv = data.nextLevel;
  return (
    <Panel data-testid="home-level">
      <PanelHeader title="Next training level">
        {lv && <QualificationChip state={lv.state} />}
      </PanelHeader>
      <PanelBody className="space-y-2">
        {lv ? (
          <>
            <p className="text-h2 text-text-1">{lv.name}</p>
            <p className="text-small text-text-body">{levelNote(lv)}</p>
            <ul className="space-y-1">
              {lv.criteria.map((c) => (
                <li
                  key={c.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 border-t border-line-1 pt-1 text-small"
                >
                  <span className="text-text-body">{c.label}</span>
                  <span className={c.met ? 'text-readout text-ok' : 'text-readout text-text-2'}>
                    {criterionValue(c)} / {criterionTarget(c)}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-body text-text-body">Every training level is qualified.</p>
        )}
        <Link
          href="/record"
          className="inline-block text-label underline decoration-line-2 underline-offset-2 hover:text-text-1"
        >
          Open service record
        </Link>
      </PanelBody>
    </Panel>
  );
}

function HomeNotices({ data }: { data: HomeResponse }) {
  return (
    <Panel data-testid="home-notices">
      <PanelHeader title="Notices">
        {data.unreadCount > 0 && (
          <span className="text-label">{formatCount(data.unreadCount)} unread</span>
        )}
      </PanelHeader>
      {data.notices.length === 0 ? (
        <p className="px-3 py-2 text-small text-text-2">No notices yet.</p>
      ) : (
        <ol>
          {data.notices.map((n) => (
            <li key={n.id} className="border-t border-line-1 px-3 py-2 first:border-t-0">
              <p className="text-label">
                {NOTICE_KIND_LABEL[n.kind]}
                {n.unread && <span className="ml-1.5 text-text-1">· New</span>}
              </p>
              {n.href ? (
                <Link
                  href={n.href}
                  className="block text-small text-text-1 [overflow-wrap:anywhere] hover:underline"
                >
                  {n.title}
                </Link>
              ) : (
                <p className="text-small text-text-1">{n.title}</p>
              )}
            </li>
          ))}
        </ol>
      )}
      <div className="border-t border-line-1 px-3 py-2">
        <Link
          href="/notices"
          className="text-label underline decoration-line-2 underline-offset-2 hover:text-text-1"
        >
          All notices
        </Link>
      </div>
    </Panel>
  );
}

function Home() {
  const { user } = useAuth();
  const { data, error, reload } = useApiData(user?.id ?? null, (signal) => api.home(signal));
  const firstRun = data !== null && data.recent.length === 0 && data.assessments === 0;
  return (
    <div className="space-y-6">
      <PageHeader
        reference={`Home · ${formatDate(new Date().toISOString())}`}
        title={user?.name ?? 'Home'}
        {...(user?.unit ? { context: user.unit.name } : {})}
        {...(data
          ? {
              facts: [
                { label: 'Rating', value: formatCount(data.rating) },
                { label: 'Assessments', value: formatCount(data.assessments) },
                {
                  label: 'Unread',
                  value: formatCount(data.unreadCount),
                  muted: data.unreadCount === 0,
                },
              ],
            }
          : {})}
      />
      {error !== null ? (
        <Panel>
          <ErrorState error={error} subject="home page" onRetry={reload} />
        </Panel>
      ) : !data ? (
        <Panel>
          <SkeletonRows rows={5} label="Loading your home page" />
        </Panel>
      ) : (
        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
          <div className="min-w-0 space-y-4">
            <NextUp data={data} firstRun={firstRun} />
            <Losing data={data} />
            <Recent data={data} />
          </div>
          <div className="min-w-0 space-y-4">
            <NextLevel data={data} />
            <HomeNotices data={data} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function HomePage() {
  return (
    <RequireAuth>
      <Home />
    </RequireAuth>
  );
}
