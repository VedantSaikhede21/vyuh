'use client';

import { Suspense } from 'react';
import { Panel, PanelBody, PanelHeader, Readout, Skeleton } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { GeneratePanel } from '@/components/training/generate-panel';
import { ScenarioTable } from '@/components/training/scenario-table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/lib/auth';

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
          <dd data-testid="user-unit">{user.unit?.name ?? 'Unassigned'}</dd>
        </dl>
        <Readout label="Rating" value={user.rating} flash={false} />
      </PanelBody>
    </Panel>
  );
}

function GenerateForUser() {
  const { user } = useAuth();
  return user ? <GeneratePanel role={user.role} /> : null;
}

export default function TrainPage() {
  return (
    <RequireAuth>
      <div className="space-y-4">
        <div className="space-y-1">
          <h1 className="text-h1">Training</h1>
          <p className="text-body text-text-2">
            Choose a scenario to open its briefing, or generate a new one.
          </p>
        </div>
        <div className="grid items-start gap-4 lg:grid-cols-[17rem_minmax(0,1fr)]">
          <div className="space-y-4">
            <OperatorPanel />
            <GenerateForUser />
          </div>
          <Suspense fallback={<Skeleton label="Loading scenarios" />}>
            <ScenarioTable />
          </Suspense>
        </div>
      </div>
    </RequireAuth>
  );
}
