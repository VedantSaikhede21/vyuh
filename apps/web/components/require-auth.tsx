'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

/** Client-side guard: tokens live in browser storage, so the server can't check them. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();
  const path = usePathname();

  // Back to this page after signing in.
  useEffect(() => {
    if (status === 'anonymous') router.replace(`/login?next=${encodeURIComponent(path ?? '/')}`);
  }, [status, router, path]);

  if (status !== 'authenticated') {
    return (
      <p className="text-label px-4 py-10 text-center" role="status">
        {status === 'loading' ? 'Verifying credentials…' : 'Redirecting to login…'}
      </p>
    );
  }
  return <>{children}</>;
}
