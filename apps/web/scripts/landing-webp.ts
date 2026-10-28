// Encodes every PNG in public/landing as a WebP beside it (Phase 6F) and keeps
// it only when it is clearly smaller: the 3D scenes shrink 5–30×, flat UI crops
// often grow. manifest.json records the choice per image (`webp`), and the page
// serves that file. Encoded by the installed Chrome (canvas.toBlob), so no image
// tool is needed. record-landing.ts runs it after writing the manifest; run it
// by hand after re-generating the login hillshade:
//
//   node scripts/landing-webp.ts

import { readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { chromium } from '@playwright/test';

const DIR = resolve(import.meta.dirname, '../public/landing');
/** Lossy quality: text in the UI crops stays sharp at 0.9; the bigger scenes take 0.8. */
const QUALITY: Record<string, number> = {
  'hero-poster': 0.8,
  'login-hillshade': 0.8,
  'realism-terrain': 0.8,
  'realism-night-ir': 0.8,
};

/**
 * Served width cap: the hero poster is the landing page's largest paint and is
 * shown at most ~640 CSS px wide, so 960 px covers 1.5× screens at a third of
 * the bytes (Phase 6F). Other crops keep their recorded size.
 */
const MAX_WIDTH: Record<string, number> = { 'hero-poster': 960 };
/** A WebP is kept only below this share of the PNG's size. */
const KEEP_BELOW = 0.8;
const MANIFEST = join(DIR, 'manifest.json');
const manifest = JSON.parse(readFileSync(MANIFEST, 'utf8')) as {
  images: Record<string, { w: number; h: number; webp?: boolean }>;
};

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
for (const f of readdirSync(DIR)
  .filter((x) => x.endsWith('.png'))
  .sort()) {
  const name = f.replace(/\.png$/, '');
  const png = readFileSync(join(DIR, f)).toString('base64');
  const q = QUALITY[name] ?? 0.9;
  const maxW = MAX_WIDTH[name] ?? Infinity;
  const webp = await page.evaluate(
    async ({ png, q, maxW }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${png}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxW / img.naturalWidth);
      canvas.width = Math.round(img.naturalWidth * scale);
      canvas.height = Math.round(img.naturalHeight * scale);
      const ctx = canvas.getContext('2d')!;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((ok) => canvas.toBlob((b) => ok(b!), 'image/webp', q));
      const bytes = new Uint8Array(await blob.arrayBuffer());
      let s = '';
      for (let i = 0; i < bytes.length; i += 0x8000)
        s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { png, q, maxW },
  );
  const out = join(DIR, `${name}.webp`);
  writeFileSync(out, Buffer.from(webp, 'base64'));
  const kb = (p: string) => Math.round(statSync(p).size / 1024);
  const keep = statSync(out).size < statSync(join(DIR, f)).size * KEEP_BELOW;
  console.log(
    `${name}: ${kb(join(DIR, f))} KB png, ${kb(out)} KB webp (q ${q}) → ${keep ? 'webp' : 'png'}`,
  );
  if (!keep) rmSync(out);
  const entry = manifest.images[name];
  if (entry) entry.webp = keep;
}
await browser.close();
writeFileSync(
  MANIFEST,
  `${JSON.stringify(manifest, null, 2)}
`,
);
