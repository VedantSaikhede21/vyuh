import { expect, test } from '@playwright/test';

// Phase 6F: landing page load on a production build (tag @fps-lcp, skipped by
// `pnpm e2e`). Lighthouse's "Slow 4G" profile through CDP — 150 ms RTT applied
// as DevTools' 562.5 ms request latency, 1.6 Mbps down / 750 kbps up (× 0.9),
// CPU slowed 4× — on a cold cache, three runs, median reported. Also reports the
// gzipped JavaScript the page's HTML loads (budget ≤ 200 KB, requirements §9),
// the JavaScript Next prefetches for linked routes once the page is idle (not
// part of the budget), and the bytes of everything else (images, fonts).
//   cd apps/web; pnpm build; pnpm start
//   $env:E2E_BASE_URL = "http://localhost:3000"; npx playwright test e2e/landing-perf.spec.ts

const RUNS = 3;
const SLOW_4G = {
  offline: false,
  latency: 562.5,
  downloadThroughput: ((1.6 * 1024 * 1024) / 8) * 0.9,
  uploadThroughput: ((750 * 1024) / 8) * 0.9,
};

interface Run {
  lcpMs: number;
  lcpElement: string;
  jsKb: number;
  prefetchJsKb: number;
  otherKb: number;
}

for (const vp of [
  { width: 1366, height: 768 },
  { width: 390, height: 844 },
]) {
  test(`landing LCP on Slow 4G at ${vp.width}×${vp.height} @fps-lcp`, async ({ browser }) => {
    test.setTimeout(300_000);
    const runs: Run[] = [];
    for (let i = 0; i < RUNS; i++) {
      const context = await browser.newContext({ viewport: vp });
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
      await cdp.send('Network.emulateNetworkConditions', SLOW_4G);
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const seen = new Map<string, { type: string; url: string }>();
      const done: { id: string; bytes: number }[] = [];
      cdp.on(
        'Network.responseReceived',
        (e: { requestId: string; type: string; response: { url: string } }) => {
          seen.set(e.requestId, { type: e.type, url: e.response.url });
        },
      );
      cdp.on('Network.loadingFinished', (e: { requestId: string; encodedDataLength: number }) => {
        done.push({ id: e.requestId, bytes: e.encodedDataLength });
      });
      await page.addInitScript(() => {
        const w = window as unknown as { __lcp: { t: number; el: string } };
        w.__lcp = { t: 0, el: '' };
        new PerformanceObserver((list) => {
          for (const e of list.getEntries() as (PerformanceEntry & { element?: Element })[]) {
            const el = e.element;
            w.__lcp = {
              t: e.startTime,
              el: el
                ? `${el.tagName.toLowerCase()}${el.getAttribute('src') ? ` ${el.getAttribute('src')}` : ''}`
                : '',
            };
          }
        }).observe({ type: 'largest-contentful-paint', buffered: true });
      });
      await page.goto('/', { waitUntil: 'load', timeout: 240_000 });
      await page.waitForTimeout(3000);
      // The page's own scripts are the ones its HTML names; the rest are prefetches.
      const docId = [...seen.entries()].find(([, r]) => r.type === 'Document')![0];
      const { body: html } = (await cdp.send('Network.getResponseBody', {
        requestId: docId,
      })) as { body: string };
      let js = 0;
      let prefetchJs = 0;
      let other = 0;
      for (const d of done) {
        const r = seen.get(d.id);
        if (!r || r.type === 'Media') continue; // the clip starts after load by design
        if (r.type !== 'Script') other += d.bytes;
        else if (html.includes(new URL(r.url).pathname)) js += d.bytes;
        else prefetchJs += d.bytes;
      }
      // LCP is final once the user interacts; read it without interacting.
      const lcp = await page.evaluate(
        () => (window as unknown as { __lcp: { t: number; el: string } }).__lcp,
      );
      runs.push({
        lcpMs: Math.round(lcp.t),
        lcpElement: lcp.el,
        jsKb: Math.round(js / 1024),
        prefetchJsKb: Math.round(prefetchJs / 1024),
        otherKb: Math.round(other / 1024),
      });
      await context.close();
    }
    const median = [...runs].sort((a, b) => a.lcpMs - b.lcpMs)[1]!;
    const result = { ...median, runs: runs.map((r) => `${r.lcpMs} ms`) };
    console.log(`landing ${vp.width}×${vp.height}: ${JSON.stringify(result)}`);
    test.info().annotations.push({ type: 'lcp', description: JSON.stringify(result) });
    console.log(`${vp.width}: LCP ${median.lcpMs} ms, JS ${median.jsKb} KB`);
    expect(median.lcpMs).toBeLessThan(2500);
    expect(median.jsKb).toBeLessThanOrEqual(200);
  });
}
