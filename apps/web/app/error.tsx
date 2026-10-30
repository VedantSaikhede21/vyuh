'use client';

import Link from 'next/link';
import { useEffect } from 'react';
import { ErrorState, PageHeader } from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { reportError } from '@/lib/report-error';

// Route error boundary (audit P1-7): plain words and a retry; the error itself
// (message, stack) is never shown — only Next's digest, to quote when reporting it.
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => reportError(error), [error]);
  return (
    <div className="space-y-6">
      <PageHeader reference="Error" title="This page stopped working" />
      <ErrorState
        title="Something on this page failed."
        onRetry={reset}
        action={
          <Button asChild variant="ghost" size="sm">
            <Link href="/train">Open training</Link>
          </Button>
        }
      >
        Try again. If it repeats, reload the page or tell your instructor
        {error.digest ? (
          <>
            {' '}
            and quote reference <span className="text-readout text-text-1">{error.digest}</span>
          </>
        ) : null}
        .
      </ErrorState>
    </div>
  );
}
