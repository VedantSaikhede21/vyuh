'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Panel, PanelBody, PanelHeader } from '@/components/hud/primitives';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import { useAuth } from '@/lib/auth';

// Seeded by `uv run python -m app.seed.demo` (SPEC §22). Local/offline mode only.
const DEMO_ACCOUNTS = [
  'admin@demo',
  'instructor@demo',
  ...Array.from({ length: 6 }, (_, i) => `trainee${i + 1}@demo`),
];

function safeNext(next: string | null): string {
  return next?.startsWith('/') && !next.startsWith('//') ? next : '/train';
}

function LoginForm() {
  const { mode, status, error, loginDev, loginSupabase } = useAuth();
  const router = useRouter();
  const next = safeNext(useSearchParams().get('next'));
  const [email, setEmail] = useState(mode === 'local' ? 'trainee1@demo' : '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated') router.replace(next);
  }, [status, next, router]);

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
    <Panel className="mx-auto w-full max-w-md">
      <PanelHeader title={mode === 'local' ? 'Dev login (local mode)' : 'Sign in'} />
      <PanelBody>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'local' ? (
            <div className="space-y-1.5">
              <Label htmlFor="email">Demo account</Label>
              <Select id="email" value={email} onChange={(e) => setEmail(e.target.value)}>
                {DEMO_ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </Select>
              <p className="text-body text-text-2">
                Offline development only — no password. Disabled when the API runs with ENV=prod.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </>
          )}
          {error ? (
            <p role="alert" className="rounded-sm border border-crit px-3 py-2 text-body text-crit">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="primary"
            className="w-full"
            disabled={busy || status === 'loading'}
          >
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </PanelBody>
    </Panel>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
