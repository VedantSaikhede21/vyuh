'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <CardTitle>{mode === 'local' ? 'Dev login (local mode)' : 'Sign in'}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => void onSubmit(e)}>
          {mode === 'local' ? (
            <div className="space-y-1.5">
              <Label htmlFor="email">Demo account</Label>
              <select
                id="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-10 w-full rounded-md border border-input bg-muted px-3 font-mono text-sm"
              >
                {DEMO_ACCOUNTS.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <p className="text-sm text-muted-foreground">
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
            <p
              role="alert"
              className="rounded-md border border-destructive px-3 py-2 text-sm text-destructive"
            >
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy || status === 'loading'}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
