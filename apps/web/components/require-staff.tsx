'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Panel, StatusNotice } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/lib/auth';
import { isGuest, isStaff } from '@/lib/nav';

/**
 * Instructor / admin pages; `allowGuest` also lets a demo guest in (the page then
 * shows its read-only view, Phase 6E). The API enforces the role; this only explains it.
 */
export function RequireStaff({
  children,
  allowGuest = false,
}: {
  children: ReactNode;
  allowGuest?: boolean;
}) {
  return (
    <RequireAuth>
      <StaffOnly allowGuest={allowGuest}>{children}</StaffOnly>
    </RequireAuth>
  );
}

function StaffOnly({ children, allowGuest }: { children: ReactNode; allowGuest: boolean }) {
  const { user } = useAuth();
  if (isStaff(user?.role) || (allowGuest && isGuest(user?.role))) return <>{children}</>;
  return (
    <Panel className="mx-auto max-w-xl">
      <StatusNotice
        title="Instructors only."
        action={
          <Link href="/aar/trends" className="text-label hover:text-text-1">
            Open my trends
          </Link>
        }
      >
        This page is for instructors and administrators.
      </StatusNotice>
    </Panel>
  );
}
