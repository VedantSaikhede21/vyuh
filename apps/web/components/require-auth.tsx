'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

/** Client-side guard: tokens live in browser storage, so the server can't check them. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login?next=/train');
  }, [status, router]);

  if (status !== 'authenticated') {
    return (
      <p className="text-label px-4 py-10 text-center" role="status">
        {status === 'loading' ? 'Verifying credentials…' : 'Redirecting to login…'}
      </p>
    );
  }
  return <>{children}</>;
}
