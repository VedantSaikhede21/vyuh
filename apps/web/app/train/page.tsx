'use client';

import { Suspense } from 'react';
import {
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  Readout,
  Skeleton,
} from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { GeneratePanel } from '@/components/training/generate-panel';
import { OwnGeneratedTable } from '@/components/training/own-generated';
import { ScenarioTable } from '@/components/training/scenario-table';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { isGuest } from '@/lib/nav';

function OperatorPanel() {
  const { user } = useAuth();
  if (!user) return null;
  return (
    <Panel>
      <PanelHeader title="Operator">
        <Badge tone="strong" data-testid="role">
          {user.role}
        </Badge>
      </PanelHeader>
      <PanelBody className="space-y-3">
        <dl className="grid grid-cols-[5rem_1fr] gap-y-1.5 text-body">
          <dt className="text-label self-center">Name</dt>
          <dd data-testid="user-name">{user.name}</dd>
          <dt className="text-label self-center">Email</dt>
          <dd className="truncate" data-testid="user-email">
            {user.email ?? '—'}
          </dd>
          <dt className="text-label self-center">Unit</dt>
          <dd data-testid="user-unit">
            {isGuest(user.role) ? 'Demo guest' : (user.unit?.name ?? 'Unassigned')}
          </dd>
        </dl>
        <Readout label="Rating" value={user.rating} flash={false} />
      </PanelBody>
    </Panel>
  );
}

function GenerateForUser() {
  const { user } = useAuth();
  if (!user) return null;
  // Guests do not generate freely (Phase 6E): the demo builds one scenario from text.
  if (isGuest(user.role))
    return (
      <Panel data-testid="guest-generate">
        <PanelHeader title="Generate" />
        <PanelBody className="space-y-2">
          <p className="text-small text-text-body">
            In the demo, a scenario is built from one preset text.
          </p>
          <Link href="/instructor/text" className="text-label underline underline-offset-2">
            Open From text
          </Link>
        </PanelBody>
      </Panel>
    );
  return <GeneratePanel role={user.role} />;
}

function GuestHint() {
  const { user } = useAuth();
  if (!isGuest(user?.role)) return null;
  return (
    <p className="text-body text-text-body" data-testid="guest-hint">
      Start with S15 Birds or Drone? in Practice: one quadcopter among birds.
    </p>
  );
}

export default function TrainPage() {
  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          reference="Training · scenarios and briefings"
          title="Training"
          context="Choose a scenario to open its briefing, or generate a new one."
        />
        <GuestHint />
        <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <OperatorPanel />
            <GenerateForUser />
          </div>
          <div className="space-y-4">
            <Suspense fallback={<Skeleton label="Loading scenarios" />}>
              <ScenarioTable />
            </Suspense>
            <OwnGeneratedTable />
          </div>
        </div>
      </div>
    </RequireAuth>
  );
}
