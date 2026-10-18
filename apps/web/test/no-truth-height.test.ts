import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Decision 108: the HUD shows estimated track height, never the truth. Every
// HUD-facing module reads tracks only — never a contact's `agl`, `pos` or the
// sim's `contacts` list (those are ground truth, for the renderer's drone
// models and for the AAR ground-truth overlay).

const ROOT = join(__dirname, '..');
const HUD_FACING = [
  'components/hud',
  'lib/hud',
  'lib/sim/store.ts',
  'components/sim/track-markers.tsx',
  'components/sim/zone-labels.tsx',
];
const TRUTH = [/\.agl\b/, /\.contacts\b/, /\bcontactPosition\(/, /\bcontactId\b/];

function files(path: string): string[] {
  const full = join(ROOT, path);
  if (!statSync(full).isDirectory()) return [path];
  return readdirSync(full).flatMap((f) => files(join(path, f)));
}

describe('HUD-facing code never reads ground truth', () => {
  const sources = HUD_FACING.flatMap(files).filter((f) => /\.tsx?$/.test(f));

  it('covers the HUD files', () => {
    expect(sources.length).toBeGreaterThan(15);
  });

  it.each(sources)('%s', (file) => {
    const text = readFileSync(join(ROOT, file), 'utf8')
      // Comments may mention truth to explain why it is not used.
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    for (const re of TRUTH) expect(text, `${file} matches ${re}`).not.toMatch(re);
  });
});
