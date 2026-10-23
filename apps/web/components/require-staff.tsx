'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { Panel, StatusNotice } from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { useAuth } from '@/lib/auth';

/** Instructor / admin pages. The API enforces the role; this only explains it. */
export function RequireStaff({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <StaffOnly>{children}</StaffOnly>
    </RequireAuth>
  );
}

function StaffOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role === 'INSTRUCTOR' || user?.role === 'ADMIN') return <>{children}</>;
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
