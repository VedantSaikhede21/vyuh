// Copies docs/realism-sources.md into the web app before dev/build, so the
// /sources page reads a file inside apps/web (a Vercel project rooted at
// apps/web need not rely on reading ../../docs at build time). The copy is
// git-ignored; docs/realism-sources.md stays the single source.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const from = resolve(import.meta.dirname, '../../../docs/realism-sources.md');
const to = resolve(import.meta.dirname, '../.generated/realism-sources.md');
mkdirSync(resolve(to, '..'), { recursive: true });
if (existsSync(from)) {
  copyFileSync(from, to);
  console.log('copied docs/realism-sources.md for /sources');
} else if (!existsSync(to)) {
  throw new Error(`Missing ${from}: the /sources page cannot be built.`);
}
