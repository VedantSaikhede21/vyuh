'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { renderFor } from '@/lib/renders';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import {
  Panel,
  PanelBody,
  PanelHeader,
  StateChip,
  StatusNotice,
} from '@/components/hud/primitives';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';
import { env } from '@/lib/env';
import { homeHref } from '@/lib/nav';

// Seeded by `uv run python -m app.seed.demo` (SPEC §22). Local/offline mode only.
const DEMO_ACCOUNTS = [
  'admin@demo',
  'instructor@demo',
  ...Array.from({ length: 6 }, (_, i) => `trainee${i + 1}@demo`),
];

/** A same-site path to return to, else null (then the role's landing page). */
function safeNext(next: string | null): string | null {
  return next?.startsWith('/') && !next.startsWith('//') ? next : null;
}

function LoginForm() {
  const { mode, status, user, error, loginDev, loginSupabase } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [email, setEmail] = useState(mode === 'local' ? 'trainee1@demo' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next ?? homeHref(user?.role));
  }, [status, next, router, user?.role]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === 'local') await loginDev(email);
      else await loginSupabase(email, password);
    } catch {
      // error is shown from auth context
    } finally {
      setBusy(false);
    }
  }

  return (
    <Panel className="w-full">
      <PanelHeader title="Sign in">
        {mode === 'local' && <StateChip tone="muted">Local mode</StateChip>}
      </PanelHeader>
      <PanelBody>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'local' ? (
            <div className="space-y-1">
              <Label htmlFor="email">Account</Label>
              <Select
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11 md:h-9"
              >
                {DEMO_ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
              <p className="text-small text-text-2">
                Offline unit install: choose your account. Accounts are set up by the administrator;
                this mode has no passwords.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  className="h-11 md:h-9"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="h-11 md:h-9"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}
          {error && (
            <StatusNotice tone="error" title="Sign-in failed." className="p-0">
              {error}
            </StatusNotice>
          )}
          <Button
            type="submit"
            variant="primary"
            className="min-h-11 w-full"
            disabled={busy || status === 'loading'}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
        {env.guestMode && (
          <p className="mt-4 border-t border-line-1 pt-3 text-small text-text-body">
            No account?{' '}
            <Link
              href="/demo"
              className="text-text-1 underline decoration-line-2 underline-offset-2 hover:decoration-text-2"
            >
              Try the demo instead
            </Link>
            : about five minutes, nothing to set up.
          </p>
        )}
      </PanelBody>
    </Panel>
  );
}

/**
 * Login (DESIGN §11.2): the form beside a still of a real place. "Try the demo
 * instead" appears with guest mode (NEXT_PUBLIC_GUEST_MODE).
 */
export default function LoginPage() {
  return (
    <div className="grid min-h-[calc(100dvh-8.5rem)] items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className="mx-auto w-full max-w-md space-y-6">
        <div className="space-y-2">
          <h1 className="text-h1 text-text-1">Sign in</h1>
          <p className="text-body text-text-body">
            Counter-drone decision training on real terrain. Scored on the server; every session can
            be reviewed.
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
      <figure className="relative hidden h-full min-h-[32rem] overflow-hidden rounded-lg bg-bg-1 lg:block">
        {/* eslint-disable-next-line @next/next/no-img-element -- static decorative picture */}
        <img
          src={renderFor('S09').w1920}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
        <figcaption className="absolute bottom-2 right-2 rounded-sm bg-scrim-2 px-2 py-1 text-small text-text-body">
          Punjab plains preset. Contains modified Copernicus Sentinel data.
        </figcaption>
      </figure>
    </div>
  );
}
