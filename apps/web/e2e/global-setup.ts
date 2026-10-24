import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Runs once before every Playwright run (decision 148). Puts the @demo accounts
// back to their seeded state, so baselines and assertions never depend on what
// earlier runs or manual play left behind:
//  - `pnpm seed` rebuilds e2e@demo from its fixture sessions when anything else
//    was added to it (apps/api/app/seed/e2e.py);
//  - `pnpm seed:reset-demo --yes` deletes non-demo sessions on the other @demo
//    accounts and re-derives their ratings.
// Both write to the database in apps/api/.env, so the reset runs only against a
// local API. E2E_SKIP_DEMO_RESET=1 skips it (e.g. a run with no database access).
// It then requests the main routes once: on a dev server that Playwright just
// started they compile on first visit, which made the first test time out.

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));

function isLocal(url: string): boolean {
  const host = new URL(url).hostname;
  return host === 'localhost' || host === '127.0.0.1' || host === '::1';
}

const WARM = ['/', '/sources', '/login', '/train', '/aar/trends', '/instructor'];

async function warmRoutes(): Promise<void> {
  const base = process.env.E2E_BASE_URL ?? 'http://localhost:3000';
  for (const path of WARM) {
    await fetch(new URL(path, base), { signal: AbortSignal.timeout(180_000) }).catch(
      (err: unknown) => console.log(`[e2e] warm-up ${path} failed: ${String(err)}`),
    );
  }
}

export default async function globalSetup(): Promise<void> {
  await warmRoutes();
  const api = process.env.E2E_API_URL ?? 'http://localhost:8000/api/v1';
  if (process.env.E2E_SKIP_DEMO_RESET === '1') {
    console.log('[e2e] demo reset skipped (E2E_SKIP_DEMO_RESET=1)');
    return;
  }
  if (!isLocal(api)) {
    console.log(`[e2e] demo reset skipped: API ${api} is not local`);
    return;
  }
  for (const cmd of ['pnpm seed', 'pnpm seed:reset-demo --yes']) {
    console.log(`[e2e] ${cmd}`);
    execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
  }
}
