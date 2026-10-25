'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
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
 * Login (DESIGN §11.2): left-aligned on a darkened hillshade of a real terrain
 * preset, in the same sheet system as the landing page. "Try the demo instead"
 * appears with guest mode (NEXT_PUBLIC_GUEST_MODE).
 */
export default function LoginPage() {
  return (
    <>
      <div aria-hidden className="fixed inset-0 z-0 bg-bg-0">
        {/* Generated by scripts/hillshade/gen-hillshade.ts from the JK_MOUNTAIN preset. */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static decorative background */}
        <img
          src="/landing/login-hillshade.png"
          alt=""
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="relative z-10 flex min-h-[calc(100dvh-7.5rem)] flex-col justify-between gap-10">
        <div className="max-w-md space-y-6">
          <div className="flex items-baseline justify-between gap-4 border-b border-line-1 pb-2 text-meta">
            <span>PS 26247 · Ministry of Defence</span>
            <span>Sign in</span>
          </div>
          <div className="space-y-2">
            <h1 className="text-h1 text-text-1">Counter-drone decision training</h1>
            <p className="text-body text-text-body">
              Detect, identify and respond to drone threats on real terrain, in a browser. Scored on
              the server; every session can be reviewed.
            </p>
          </div>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
        <p className="max-w-2xl text-small text-text-2">
          Background: hillshade of Copernicus DEM GLO-30 © DLR e.V. 2010–2014 and © Airbus Defence
          and Space GmbH 2014–2018, provided under COPERNICUS by the European Union and ESA.
        </p>
      </div>
    </>
  );
}
