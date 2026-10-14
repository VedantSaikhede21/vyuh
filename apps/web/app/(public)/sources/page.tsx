import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Metadata } from 'next';
import { Markdown } from '@/lib/markdown';

// Realism sources (SPEC §20 step 8): docs/realism-sources.md, copied into the
// app by scripts/copy-sources.ts before dev/build and rendered at build time.

export const dynamic = 'force-static';
export const metadata: Metadata = { title: 'Realism sources — VYUH' };

export default function SourcesPage() {
  const source = readFileSync(join(process.cwd(), '.generated/realism-sources.md'), 'utf8');
  return (
    <article className="max-w-3xl pb-8">
      <Markdown source={source} />
    </article>
  );
}
