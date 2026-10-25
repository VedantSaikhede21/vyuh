'use client';

import type { ScoringSummaryResponse } from '@vyuh/shared';
import Link from 'next/link';
import {
  ErrorState,
  Kbd,
  PageHeader,
  Panel,
  PanelBody,
  PanelHeader,
  SkeletonRows,
} from '@/components/hud/primitives';
import { RequireAuth } from '@/components/require-auth';
import { Table, Td, Th, Tr } from '@/components/ui/table';
import { api } from '@/lib/api';
import { COMPONENT_LABEL, GLOSSARY, scoringRows } from '@/lib/help';
import { SHORTCUTS } from '@/lib/strings';
import { useApiData } from '@/lib/use-api-data';

// Help & controls (Phase 6C): shortcut reference, how scoring works, glossary.

function Scoring({ s }: { s: ScoringSummaryResponse }) {
  const { components, adjustments } = scoringRows(s);
  const keys = (Object.keys(COMPONENT_LABEL) as (keyof typeof COMPONENT_LABEL)[]).filter(
    (k) => s.componentMax[k] > 0,
  );
  const max = keys.reduce((a, k) => a + s.componentMax[k], 0);
  return (
    <div className="space-y-4">
      <div className="max-w-prose-ui space-y-2 text-body text-text-body">
        <p>
          When a session ends, the server scores your event log with a decision tree. Every threat
          earns points in each component below; each component is averaged over the threats, the
          components are added and the sum is scaled to 100. Penalties and bonuses are then added
          with the time they happened, so the replay can show them.
        </p>
        <p>
          A threat that was never detectable is not scored, and a threat you could not have stopped
          (it reached the asset faster than any effector could act) does not count against your
          decision. The client never scores: it only sends what you did.
        </p>
      </div>
      <dl className="grid auto-cols-fr grid-flow-col gap-px border border-line-1 bg-line-1">
        {keys.map((k) => (
          <div key={k} className="bg-bg-1 px-3 py-2">
            <dt className="text-label">{COMPONENT_LABEL[k]}</dt>
            <dd className="text-readout text-text-1">
              {s.componentMax[k]}
              <span className="ml-1 text-text-2">pts</span>
            </dd>
          </div>
        ))}
        <div className="bg-bg-1 px-3 py-2">
          <dt className="text-label">Scaled</dt>
          <dd className="text-readout text-text-1">{max} → 100</dd>
        </div>
      </dl>
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Table aria-label="Points per threat" data-testid="help-components">
          <thead>
            <tr>
              <Th className="w-full">Per threat</Th>
              <Th align="right">Points</Th>
            </tr>
          </thead>
          <tbody>
            {components.map((r) => (
              <Tr key={r.code}>
                <Td className="whitespace-normal py-1.5 text-body text-text-body">{r.text}</Td>
                <Td align="right" className="text-readout">
                  {r.points}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <Table aria-label="Penalties and bonuses" data-testid="help-adjustments">
          <thead>
            <tr>
              <Th className="w-full">Penalties and bonuses</Th>
              <Th align="right">Points</Th>
            </tr>
          </thead>
          <tbody>
            {adjustments.map((r) => (
              <Tr key={r.code}>
                <Td className="whitespace-normal py-1.5 text-body text-text-body">{r.text}</Td>
                <Td align="right" className="text-readout">
                  {r.points}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </div>
      <p className="text-small text-text-2">
        Current tree <span className="font-mono">{s.current}</span>, used by new and generated
        scenarios. The tutorial scenarios (S01–S03) and S11–S14 use earlier trees without contact
        reports; the result screen always names the tree a score used.
      </p>
    </div>
  );
}

function Help() {
  const summary = useApiData('scoring-summary', (signal) => api.scoringSummary(signal));
  return (
    <div className="space-y-6">
      <PageHeader
        reference="Help & controls"
        title="Help & controls"
        context="Keyboard shortcuts for the sim player, how a session is scored, and the terms used across VYUH."
      />
      <nav aria-label="On this page" className="flex flex-wrap gap-4 text-label">
        <a href="#shortcuts" className="hover:text-text-1">
          Shortcuts
        </a>
        <a href="#scoring" className="hover:text-text-1">
          How scoring works
        </a>
        <a href="#glossary" className="hover:text-text-1">
          Glossary
        </a>
        <Link href="/library" className="hover:text-text-1">
          Threat library
        </Link>
        <Link href="/status" className="hover:text-text-1">
          System status
        </Link>
      </nav>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Panel id="shortcuts" className="scroll-mt-16 self-start">
          <PanelHeader title="Shortcuts · sim player" />
          <Table aria-label="Keyboard shortcuts" data-testid="help-shortcuts">
            <tbody>
              {SHORTCUTS.map((s) => (
                <Tr key={s.keys}>
                  <Td className="w-0 py-1.5 align-top">
                    <Kbd>{s.keys}</Kbd>
                  </Td>
                  <Td className="whitespace-normal py-1.5 text-body text-text-body">{s.action}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <PanelBody className="border-t border-line-1">
            <p className="text-small text-text-2">
              Press <Kbd>?</Kbd> in the player for the same list. Shortcuts are ignored while you
              type in a field.
            </p>
          </PanelBody>
        </Panel>
        <Panel id="scoring" className="scroll-mt-16 self-start">
          <PanelHeader title="How scoring works" />
          <PanelBody>
            {summary.error !== null ? (
              <ErrorState
                error={summary.error}
                subject="scoring summary"
                onRetry={summary.reload}
              />
            ) : !summary.data ? (
              <SkeletonRows rows={6} label="Loading the scoring tree" />
            ) : (
              <Scoring s={summary.data} />
            )}
          </PanelBody>
        </Panel>
      </div>
      <Panel id="glossary" className="scroll-mt-16">
        <PanelHeader title="Glossary" />
        {/* Rules between rows only: an uneven last row leaves no filled gaps. */}
        <dl className="grid gap-x-6 px-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="help-glossary">
          {GLOSSARY.map((g) => (
            <div
              key={g.term}
              className="space-y-1 border-t border-line-1 py-2 first:border-t-0 sm:[&:nth-child(2)]:border-t-0 xl:[&:nth-child(3)]:border-t-0"
            >
              <dt className="text-panel-title text-text-1">{g.term}</dt>
              <dd className="text-small text-text-body">{g.meaning}</dd>
            </div>
          ))}
        </dl>
      </Panel>
    </div>
  );
}

export default function HelpPage() {
  return (
    <RequireAuth>
      <Help />
    </RequireAuth>
  );
}
