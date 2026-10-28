import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { KillChainStage } from '@vyuh/shared';
import { describe, expect, it } from 'vitest';
import { STAGES } from '@/components/hud/primitives/stage-strip';
import MEDIA from '@/public/landing/manifest.json';
import { imageSrc, type ImageKey } from '@/lib/landing';

const ROOT = join(import.meta.dirname, '..');

describe('landing weight (Phase 6F)', () => {
  it('the stage strip lists the shared kill-chain stages in order', () => {
    expect(STAGES).toEqual(KillChainStage.options);
  });

  it('every landing image is served from a file that exists', () => {
    for (const k of Object.keys(MEDIA.images) as ImageKey[]) {
      expect(existsSync(join(ROOT, 'public', imageSrc(k)))).toBe(true);
    }
    expect(imageSrc('hero-poster')).toBe('/landing/hero-poster.webp');
  });

  // Every page loads these (root layout, top bar, public pages): a value import
  // of zod or @vyuh/shared here puts ~40 KB gzipped back on the landing page.
  it.each([
    'lib/env.ts',
    'lib/api-core.ts',
    'lib/auth.tsx',
    'lib/supabase.ts',
    'lib/notices.ts',
    'lib/nav.ts',
    'lib/landing.ts',
    'components/app-header.tsx',
    'components/hud/primitives/stage-strip.tsx',
    'components/landing/start-demo.tsx',
  ])('%s has no value import of zod, @vyuh/shared, supabase-js or lib/api', (file) => {
    const src = readFileSync(join(ROOT, file), 'utf8');
    const values = [...src.matchAll(/^import (?!type )[^;]*? from '([^']+)'/gms)].map((m) => m[1]);
    expect(values).not.toContain('zod');
    expect(values).not.toContain('@vyuh/shared');
    expect(values).not.toContain('@supabase/supabase-js');
    expect(values).not.toContain('@/lib/api');
    expect(values).not.toContain('./api');
  });
});
