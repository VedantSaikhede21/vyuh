import Link from 'next/link';
import { AffiliationLegend } from '@/components/affiliation-legend';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { env } from '@/lib/env';

const KILL_CHAIN = ['Detect', 'Track', 'Identify', 'Decide', 'Respond', 'Assess'];

export default function LandingPage() {
  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <p className="text-label">SIH 2026 · PS 26247 · Training simulator</p>
        <h1 className="text-h1 font-semibold tracking-tight">Counter-drone threat trainer</h1>
        <p className="max-w-2xl text-text-2">
          Practise detecting, tracking, identifying and responding to drone and swarm threats in a
          browser, under realistic conditions, with server-side scoring and after-action review.
        </p>
        <div className="flex flex-wrap gap-3 pt-1">
          <Button asChild variant="primary">
            <Link href="/login">Log in</Link>
          </Button>
          {env.guestMode ? (
            <Button variant="secondary" disabled title="Guest demo arrives in Phase 6">
              Try demo
            </Button>
          ) : null}
        </div>
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Kill chain</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-wrap items-center gap-2 text-readout">
              {KILL_CHAIN.map((stage, i) => (
                <li key={stage} className="flex items-center gap-2">
                  <span className="rounded-sm border border-line-1 px-2 py-1">
                    <span className="font-mono tnum text-text-2">
                      {String(i + 1).padStart(2, '0')}
                    </span>{' '}
                    {stage}
                  </span>
                  {i < KILL_CHAIN.length - 1 ? (
                    <span aria-hidden className="text-text-2">
                      →
                    </span>
                  ) : null}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Affiliation (APP-6)</CardTitle>
          </CardHeader>
          <CardContent>
            <AffiliationLegend />
          </CardContent>
        </Card>
      </div>

      <p className="text-label">Status: Phase 0 foundations — simulator arrives in Phase 1.</p>
    </div>
  );
}
