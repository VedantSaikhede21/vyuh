'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** "Start the demo": a guest account from the API, then Training (the tour is 6E). */
export function StartDemo() {
  const { loginGuest } = useAuth();
  const router = useRouter();
  const [state, setState] = useState<{ kind: 'idle' | 'busy' } | { kind: 'error'; text: string }>({
    kind: 'idle',
  });
  const start = () => {
    setState({ kind: 'busy' });
    loginGuest()
      .then(() => router.push('/train'))
      .catch((err: unknown) =>
        setState({
          kind: 'error',
          text:
            err instanceof ApiError && (err.status === 404 || err.status === 405)
              ? 'The demo is not open on this server yet. Sign in instead, or try again later.'
              : err instanceof ApiError && err.code === 'NETWORK'
                ? 'The server did not answer. Check the connection and try again.'
                : 'The demo could not start. Try again in a minute.',
        }),
      );
  };
  return (
    <div className="space-y-2">
      <Button
        variant="primary"
        className="min-h-11"
        onClick={start}
        loading={state.kind === 'busy'}
        data-testid="start-demo"
      >
        {state.kind === 'busy' ? 'Starting the demo…' : 'Start the demo'}
      </Button>
      {state.kind === 'error' && (
        <p className="text-small text-text-body" role="alert">
          {state.text}
        </p>
      )}
    </div>
  );
}
