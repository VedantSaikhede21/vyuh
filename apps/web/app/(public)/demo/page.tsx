import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SheetFrame } from '@/components/hud/primitives';
import { StartDemo } from '@/components/landing/start-demo';
import { env } from '@/lib/env';

// Guest entry (Phase 6C, built behind NEXT_PUBLIC_GUEST_MODE; switched on in 6E with
// POST /auth/guest). Says what the visitor will see before anything starts.

export const metadata: Metadata = { title: 'Try the demo — VYUH' };

const PATH: readonly [string, string][] = [
  ['A short tour of the console', 'Radar, camera, track list, actions and the report form.'],
  [
    'S15 Birds or Drone?, in Practice',
    'About three minutes: one quadcopter among birds. Use the camera and the spectrogram before you engage.',
  ],
  ['Your score and debrief', 'Scored on the server, with what went well and what to fix.'],
  ['The replay with ground truth', 'What was really there, stage by stage.'],
  [
    'Trends and the unit view',
    'Progress over sessions and the unit dashboard, on labelled demo data, read-only.',
  ],
  ['A scenario from text', 'Describe a threat in plain words and get a briefing.'],
];

export default function DemoPage() {
  if (!env.guestMode) notFound();
  return (
    <SheetFrame
      sheet={1}
      of={1}
      reference="Demo · no account needed"
      className="border-t-0 pt-0 pb-8"
    >
      <div className="grid gap-8 lg:grid-cols-[minmax(0,6fr)_minmax(0,6fr)]">
        <div className="space-y-5">
          <h1 className="text-display text-text-1 [text-wrap:balance]">Try the demo</h1>
          <p className="max-w-prose-ui text-body text-text-body">
            About five minutes. You play one scenario, see how it was scored and replay it, then
            look at a unit&apos;s progress on demo data. No account and no setup: a guest account is
            made for you and deleted automatically afterwards.
          </p>
          <StartDemo />
          <p className="max-w-prose-ui text-small text-text-2">
            The console needs a screen at least 1280 px wide (a laptop or desktop). On a phone you
            can read about VYUH, but not play.
          </p>
        </div>
        <ol
          className="border border-line-1"
          aria-label="What the demo shows"
          data-testid="demo-path"
        >
          {PATH.map(([head, body], i) => (
            <li
              key={head}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] gap-x-2 border-t border-line-1 px-4 py-3 first:border-t-0"
            >
              <span className="text-readout text-text-2">{String(i + 1).padStart(2, '0')}</span>
              <div className="space-y-0.5">
                <p className="text-body font-medium text-text-1">{head}</p>
                <p className="text-small text-text-body">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </SheetFrame>
  );
}
