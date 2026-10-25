import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import Link from 'next/link';
import { SheetFrame } from '@/components/hud/primitives';
import { Markdown } from '@/lib/markdown';
import { SOURCE_TOPICS } from '@/lib/sources';

// Realism sources (SPEC §20 step 8, audit P1-19): every model and dataset as a
// ruled table per topic; the full docs/realism-sources.md (copied into the app by
// scripts/copy-sources.ts) under "Technical notes" for engineers.

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Realism sources — VYUH' };

const REF = 'Realism sources · representative values';

export default function SourcesPage() {
  const notes = readFileSync(join(process.cwd(), '.generated/realism-sources.md'), 'utf8');
  return (
    <div className="space-y-12 pb-8">
      <header className="space-y-3 border-b border-line-1 pb-6">
        <p className="text-meta">{REF}</p>
        <h1 className="text-h1 text-text-1">Where every model and number comes from</h1>
        <p className="max-w-prose-ui text-body text-text-body">
          VYUH is a decision trainer, not a weapons simulator. Its drone figures are representative,
          taken from public commercial specifications and textbook physics, and no real or
          classified system data is used. Each model below names its source and licence.
        </p>
      </header>
      {SOURCE_TOPICS.map((t, i) => (
        <SheetFrame
          key={t.topic}
          sheet={i + 1}
          of={SOURCE_TOPICS.length}
          reference={REF}
          title={t.topic}
          aria-label={t.topic}
        >
          {/* Rows become ruled blocks on phones; a table from 768 px. */}
          <div className="border border-line-1" data-testid="sources-topic">
            <div className="hidden grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,4fr)_minmax(0,2fr)] gap-x-4 bg-bg-2 px-3 py-1.5 text-label md:grid">
              <span>What</span>
              <span>Model or dataset</span>
              <span>Source</span>
              <span>Licence</span>
            </div>
            <ul>
              {t.rows.map((r) => (
                <li
                  key={r.what}
                  className="grid gap-x-4 gap-y-1 border-t border-line-1 px-3 py-2.5 first:border-t-0 md:grid-cols-[minmax(0,3fr)_minmax(0,4fr)_minmax(0,4fr)_minmax(0,2fr)] md:first:border-t"
                >
                  <span className="text-body font-medium text-text-1">{r.what}</span>
                  <span className="text-small text-text-body">{r.model}</span>
                  <span className="text-small text-text-body">{r.source}</span>
                  <span className="text-small text-text-2">
                    <span className="md:hidden">Licence: </span>
                    {r.licence}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </SheetFrame>
      ))}
      <details className="group border border-line-1" data-testid="technical-notes">
        <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 bg-bg-2 px-3 text-panel-title text-text-1 marker:content-none">
          Technical notes: the full source register
          <span className="text-label text-text-2 group-open:hidden">Show</span>
          <span className="hidden text-label text-text-2 group-open:inline">Hide</span>
        </summary>
        <article className="max-w-3xl px-3 py-4 [overflow-wrap:anywhere]">
          <Markdown source={notes} />
        </article>
      </details>
      <p className="text-small text-text-2">
        See also the{' '}
        <Link href="/status" className="text-text-1 underline underline-offset-2">
          system status
        </Link>{' '}
        for the versions running now.
      </p>
    </div>
  );
}
