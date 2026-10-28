# Phase 6F progress — performance pass

> Plan: `docs/plans/phase6f-plan.md` (approved 2026-10-28, "go"). Decisions 162–163.
> Machine: AMD Radeon integrated (Ryzen 7 5800H), 6 GB free-memory-starved laptop; production build (`next build` + `next start`), API `uvicorn` on :8000, no dev servers.

## Status

| # | Item | State |
|---|---|---|
| F1 | Baseline on HEAD (`274e3c8`) | Done — table below |
| F2 | Frame costs | No live case below 52 fps at 1080p; replay probed (below), not changed |
| F3 | Web delivery | Done — landing JS, images, video, cache headers |
| F4 | After-run | Done — table below |
| F5 | Tech-debt rows | `THREE.Clock` and trends recompute left as logged (see below) |
| F6 | Close-out | Lint, web vitest, `pnpm e2e`; LCP residual — **user decision on font subsetting** |

## Method

- FPS: `e2e/fps.spec.ts`, `FPS_SELECT=1 FPS_MODES=fixed FPS_COOLDOWN_MS=15000`, three 10 s windows after a 5 s warm-up, median window. A reduced set (S14, S06, URBAN D5 seed 2, PUNJAB D5 at the 60-entity cap at 100 %; S06 and URBAN D5 at 1920 × 150 %) instead of the full 36 cases — the user asked for haste. Intel run skipped by the user (decision 162).
- Replay: `e2e/aar-perf.spec.ts` (`@fps-aar`). Its memory sampler spawns PowerShell during the windows, so it reads a few fps low against the live spec.
- Landing: new `e2e/landing-perf.spec.ts` (`@fps-lcp`): Lighthouse "Slow 4G" through CDP (562.5 ms latency, 1.6 Mbps × 0.9 down), CPU 4×, cold cache, three runs, median LCP; page JS = scripts the HTML names, prefetch JS = scripts Next fetches for linked routes after render.
- Noise: the first baseline pass overlapped a `tsc` run (S06 1920 read 31 fps, below its own 150 % case); those cases were re-run quiet and the quiet numbers are used.

## Before / after

| Case | Before (`274e3c8`) | After |
|---|---|---|
| S06 live 1920×1080 ×1 | 61 fps, p95 25.0 ms | 71, p95 16.8 |
| S06 live 1366×768 ×1 | 117, p95 8.5 | — (3D untouched) |
| S06 live 1920×1080 ×1.5 | 48, p95 25.1 | — |
| URBAN D5 seed 2 1920×1080 ×1 | 52, p95 25.3 | 64, p95 24.9 |
| URBAN D5 seed 2 1366×768 ×1 | 108, p95 16.6 | — |
| URBAN D5 seed 2 1920×1080 ×1.5 | 41, p95 33.4 | — |
| S14 1920×1080 / 1366×768 | 77 / 119 | — |
| PUNJAB D5 60-entity cap 1920 / 1366 | 70 / 116 | — |
| S06 replay 1920×1080 | 42, p95 33.5 | — (replay untouched) |
| S06 replay 1366×768 | 55, p95 33.3 | — |
| Sim tick, 60 contacts, max (best of 3) | — | JK 0.25 ms, URBAN 0.31, PUNJAB 0.32 (single-run max ≤ 0.78; budget 2 ms) |
| **Landing LCP, Slow 4G, 1366×768** | **13.7 s** (poster PNG 479 KB, clip downloading) | **3.5 s** |
| Landing LCP, Slow 4G, 390×844 | 13.8 s | 3.5 s |
| Landing page JS (gzip) | 304 KB | **178 KB** (budget 200) |
| Landing other bytes before idle | 3,852 KB | 618 KB (fonts ~360) |
| Terrain / signatures / landing cache | `max-age=0` | `max-age=86400, stale-while-revalidate=604800` |

"After" 3D numbers are higher than "before" on code that did not change: run-to-run noise on this machine, not an improvement. They show no regression.

## What changed (F3)

- **Hero video:** poster preloaded with `fetchPriority: high`; the clip has `preload="none"` and starts with `play()` after the window `load` event (reduced motion unchanged: poster + controls).
- **Images:** `scripts/landing-webp.ts` encodes each landing PNG as WebP in the installed Chrome and keeps it only below 80 % of the PNG (3D scenes: terrain 861 → 30 KB, night IR 361 → 68, poster 478 → 44 at 960 px wide, login hillshade 360 → 27; flat UI crops stay PNG). `manifest.json` records `webp` per image; `imageSrc()` picks the file. `record-landing.ts` runs it after writing the manifest.
- **JS:** supabase-js loads on first use and only when a session is stored (`hasStoredSupabaseSession`); `ApiError` and the token getter moved to `lib/api-core.ts`; `lib/auth.tsx` and `lib/notices.ts` import `lib/api` (zod + schemas) lazily; `lib/env.ts` checks by hand; the stage strip uses a typed stage list. Guard: `test/phase6f.test.ts`.
- **Cache headers:** `next.config.ts` `headers()` for `/terrain`, `/signatures`, `/landing`, `/models` (not `immutable`: paths are not content-hashed).

## F2 — replay probe (not changed)

S06 replay at 1920: paused 66–68 fps, playing 49–51, ground truth costs ~2 fps. Playback adds ~4 ms / frame spread across React updates at 20 Hz (timeline, HUD snapshot); main thread ~65 % busy, no forced layouts, GC negligible. Above the 30 fps budget on this machine, so left as tech debt.

## LCP residual — needs a decision

Fonts block ~1.3 s: with fonts blocked the page reaches 2.8 s; with them 3.5 s. The six IBM Plex woff2 files are 48–66 KB each (the full glyph sets IBM ships). Subsetting to Latin + the symbols we use (°, ×, –, —, ·, →, µ) should cut most of that (estimate, not measured) — it needs `fonttools` (`pyftsubset`) as an offline dev tool in a `scripts/` uv project, output committed. Without it LCP stays ~3.5 s on Slow 4G (well under 1 s on broadband).

## F5

- `THREE.Clock` deprecation: from R3F internals; no R3F release fixes it yet — logged, not changed.
- Trends / unit kill-chain recompute: fine at demo size (~50 sessions); unchanged.
