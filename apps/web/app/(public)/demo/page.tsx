import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HeroBand } from '@/components/layout/hero';
import { StartDemo } from '@/components/landing/start-demo';
import { env } from '@/lib/env';

// Guest entry (Phase 6C, built behind NEXT_PUBLIC_GUEST_MODE; switched on in 6E with
// POST /auth/guest). Says what the visitor will see before anything starts.

export const metadata: Metadata = { title: 'Try the demo — VYUH' };

// The same six steps as the demo path strip (lib/demo-path.ts), in its words.
const PATH: readonly [string, string][] = [
  [
    'Play S15 in Practice',
    'A short tour of the console first, then about three minutes: one quadcopter among birds. Use the camera and the spectrogram before you engage.',
  ],
  ['Score and debrief', 'Scored on the server, with what went well and what to fix.'],
  ['Replay with ground truth', 'What was really there, stage by stage.'],
  [
    'Unit view, demo data',
    "A unit's progress and weakest stage, on labelled demo data, read-only.",
  ],
  ['Scenario from text', 'Plain words read into generator parameters, then a briefing.'],
  ['Sources', 'Where every model and number comes from.'],
];

export default function DemoPage() {
  if (!env.guestMode) notFound();
  return (
    <div className="space-y-8 pb-8">
      <HeroBand code="S15" className="min-h-[340px]">
        <h1 className="text-display text-text-1">Try the demo</h1>
        <p className="mt-2 max-w-prose-ui text-body text-text-1">
          About five minutes. You play one scenario, see how it was scored and replay it, then look
          at a unit&apos;s progress on demo data. No account and no setup: a guest account is made
          for you and deleted automatically afterwards.
        </p>
        <div className="mt-4">
          <StartDemo />
        </div>
      </HeroBand>
      <ol
        className="grid gap-x-8 gap-y-5 md:grid-cols-2 lg:grid-cols-3"
        aria-label="What the demo shows"
        data-testid="demo-outline"
      >
        {PATH.map(([head, body]) => (
          <li key={head} className="space-y-1">
            <p className="text-h3 text-text-1">{head}</p>
            <p className="text-body text-text-body">{body}</p>
          </li>
        ))}
      </ol>
      <p className="max-w-prose-ui text-small text-text-2">
        The console needs a screen at least 1280 px wide (a laptop or desktop). On a phone you can
        read about VYUH, but not play.
      </p>
    </div>
  );
}
