'use client';

import { Suspense, useState } from 'react';
import { PageHeader, Panel, PanelBody, PanelHeader, Skeleton } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { GeneratePanel } from '@/components/training/generate-panel';
import { OwnGeneratedTable } from '@/components/training/own-generated';
import { ScenarioTable } from '@/components/training/scenario-table';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import Link from 'next/link';
import { useAuth } from '@/lib/auth';
import { isGuest } from '@/lib/nav';

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

/** Generate lives in a dialog: the gallery is the page (DESIGN §11.3). */
function GenerateAction() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)} data-testid="open-generate">
        Generate scenario
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Generate scenario">
        <GenerateForUser />
      </Dialog>
    </>
  );
}

export default function TrainPage() {
  return (
    <RequireAuth>
      <div className="space-y-6">
        <PageHeader
          title="Training"
          context="Choose a mission to open its briefing, or generate a new one."
          actions={<GenerateAction />}
        />
        <GuestHint />
        <Suspense fallback={<Skeleton label="Loading scenarios" />}>
          <ScenarioTable />
        </Suspense>
        <OwnGeneratedTable />
      </div>
    </RequireAuth>
  );
}
