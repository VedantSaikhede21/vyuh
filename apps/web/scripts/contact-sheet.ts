// Tiles stills into one image (2 per row) for reviewing reference shots side by side,
// e.g. before | after (realism plan §4). Uses headless Chrome, so no image library.
//
//   node apps/web/scripts/contact-sheet.ts <out.jpg> <width> <img1> [img2 …] [--labels a,b,…]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { chromium } from '@playwright/test';

const args = process.argv.slice(2);
const li = args.indexOf('--labels');
const labels = li >= 0 ? (args.splice(li, 2)[1] ?? '').split(',') : [];
const [out, widthArg, ...files] = args;
const width = Number(widthArg);
if (!out || !width || files.length === 0) {
  console.error('usage: contact-sheet.ts <out.jpg> <width> <img…> [--labels a,b]');
  process.exit(2);
}
const tiles = files
  .map((f, i) => {
    const src = `data:image/jpeg;base64,${readFileSync(resolve(f)).toString('base64')}`;
    const label = labels[i] ?? f.split(/[\\/]/).pop();
    return `<figure><img src="${src}"><figcaption>${label}</figcaption></figure>`;
  })
  .join('');
const html = `<style>body{margin:0;background:#111;display:grid;grid-template-columns:1fr 1fr;gap:4px;width:${width}px}
figure{margin:0;position:relative}img{width:100%;display:block}
figcaption{position:absolute;left:6px;top:4px;font:14px monospace;color:#fff;background:#000a;padding:1px 4px}</style>${tiles}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width, height: 200 } });
await page.setContent(html);
await page.waitForFunction(() => [...document.images].every((i) => i.complete));
await page.screenshot({ path: resolve(out), type: 'jpeg', quality: 85, fullPage: true });
await browser.close();
console.log(out);
