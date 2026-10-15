// Generator seed sweep (Phase 3a, decision 76): generate N scenarios per
// difficulty with the API generator, then validate them with sim-core.
//   pnpm sweep:generator                          # 50 per difficulty, local
//   node scripts/generator/sweep.ts --per-difficulty 20   # CI
// Fails (exit 1) when more than --max-fail-pct (default 2) of them fail.

import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const arg = (name: string, fallback: string): string => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? fallback) : fallback;
};
const perDifficulty = arg('--per-difficulty', '50');
const maxFailPct = arg('--max-fail-pct', '2');
const out = mkdtempSync(join(tmpdir(), 'vyuh-sweep-'));

function run(cmd: string, args: string[], cwd: string): number {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit' });
  return r.status ?? 1;
}

try {
  const gen = run(
    'uv',
    ['run', 'python', 'scripts/gen_sweep.py', '--per-difficulty', perDifficulty, '--out', out],
    join(root, 'apps/api'),
  );
  if (gen !== 0) process.exit(gen);
  process.exitCode = run(
    process.execPath,
    ['packages/sim-core/scripts/validate.ts', out, '--max-fail-pct', maxFailPct],
    root,
  );
} finally {
  rmSync(out, { recursive: true, force: true });
}
