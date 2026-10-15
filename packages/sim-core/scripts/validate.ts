// Playability validator CLI (Phase 3a, decision 75).
//   pnpm --filter @vyuh/sim-core validate <file|dir> [--max-fail-pct 2] [--json]
// Validates every scenario JSON (a directory is read non-recursively), with
// presets loaded from apps/web/public/terrain. Exits 1 when the share of
// failing scenarios is above --max-fail-pct (default 0).

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { validateScenario, type ValidationResult } from '../src/index.ts';
import { presetWorld } from '../test/fixtures.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const pctAt = args.indexOf('--max-fail-pct');
const maxFailPct = pctAt >= 0 ? Number(args[pctAt + 1]) : 0;
const target = args.find((a, i) => !a.startsWith('--') && (pctAt < 0 || i !== pctAt + 1));
if (target === undefined || Number.isNaN(maxFailPct)) {
  console.error('usage: validate <file|dir> [--max-fail-pct N] [--json]');
  process.exit(2);
}
// pnpm runs scripts in the package dir; resolve paths from where the user ran it.
const root = resolve(process.env.INIT_CWD ?? process.cwd(), target);
const files = statSync(root).isDirectory()
  ? readdirSync(root)
      .filter((f) => f.endsWith('.json'))
      .sort()
      .map((f) => join(root, f))
  : [root];

const results: { file: string; difficulty: number; result: ValidationResult }[] = [];
for (const file of files) {
  const raw: unknown = JSON.parse(readFileSync(file, 'utf8'));
  const preset = (raw as { terrain?: { preset?: string } }).terrain?.preset ?? '';
  const result = validateScenario(raw, presetWorld(preset));
  const difficulty = (raw as { difficulty?: number }).difficulty ?? 0;
  results.push({ file: basename(file), difficulty, result });
  if (!json) {
    const failed = result.checks.filter((c) => !c.ok);
    const line = failed.length
      ? `FAIL ${basename(file)}  ${failed.map((c) => `${c.name}: ${c.detail ?? ''}`).join(' | ')}`
      : `PASS ${basename(file)}`;
    console.log(line);
  }
}

const failures = results.filter((r) => !r.result.ok).length;
// Pop-down metric (decision 83): share of D4/D5 threats that fly into radar clutter
// on their final approach. Reported only.
const clutter = [4, 5].map((d) => {
  const w = results.filter((r) => r.difficulty === d).flatMap((r) => r.result.warnings);
  const n = w.filter((x) => x.enteredClutter).length;
  return {
    difficulty: d,
    threats: w.length,
    enteredClutter: n,
    pct: w.length ? (100 * n) / w.length : 0,
  };
});
const pct = files.length ? (100 * failures) / files.length : 0;
if (json) {
  console.log(
    JSON.stringify({ total: files.length, failures, failPct: pct, clutter, results }, null, 1),
  );
} else {
  for (const c of clutter.filter((x) => x.threats > 0)) {
    console.log(
      `D${c.difficulty} threats entering clutter on final approach: ${c.enteredClutter}/${c.threats} (${c.pct.toFixed(1)} %)`,
    );
  }
  console.log(`${failures}/${files.length} failed (${pct.toFixed(1)} %, limit ${maxFailPct} %)`);
}
process.exit(pct > maxFailPct ? 1 : 0);
