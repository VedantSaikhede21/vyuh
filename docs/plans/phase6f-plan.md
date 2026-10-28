# Phase 6F plan — performance pass

> Requirements: `docs/plans/phase6-requirements.md` §9; audit tech-debt rows for 6F; 6D FPS after-run (`phase6d-progress.md`).
> **User 2026-10-28: Intel integrated-GPU run skipped** ("it will perform well on them") — logged as a decision, §14 no longer lists it as pending.

## Starting point

three.js / R3F already load only on the player and AAR routes (`dynamic()` in `train/session/[id]` and `aar/session/[id]`); fonts come from `next/font/local` (preloaded). Terrain presets are 0.15–4.2 MB, landing media 3.5 MB, served with Next's default static headers. Last valid FPS (6D "before", `0bb5880`): S06 59 / 84 fps, URBAN D5 seed 2 36 / 48 fps (1920×1080 / 1366×768). The 6D "after" was invalid (machine under other load). S06 replay at 1920 was 29–55 fps in 4a and has not been re-measured since the re-render fixes.

## Items, in order

| # | What |
|---|---|
| F1 | **Baseline on HEAD** (production build, dev servers and other projects stopped, one heavy job at a time): `e2e:fps` fixed-DPR set at 100 % and `e2e:fps:150`; replay `@fps-aar` S06 and S10; URBAN D5 seed 2; sim tick bench (60 contacts, URBAN / PUNJAB / JK). Route first-load JS from the `next build` output. Landing LCP on a "Slow 4G" + 4× CPU profile via Playwright CDP throttling (no new dependency). |
| F2 | **Fix the biggest frame costs** found in F1, sim results unchanged (determinism + demo-log tests stay green). Known suspects: per-frame DOM truth labels in AAR replay, URBAN draw calls / building mesh, track-label DOM updates. Per-tick allocation reduction only if the tick bench shows peaks near 2 ms. |
| F3 | **Web delivery:** `headers()` in `next.config.ts` — long cache (`max-age=31536000, immutable` not safe for unversioned paths, so `max-age=86400, stale-while-revalidate=604800`) on `/terrain/*`, `/signatures/*`, `/landing/*`, `/models/*`; landing ≤ 200 KB gzipped JS excluding video (split anything heavy off the landing, e.g. the kill-chain demo, if over); images given width / height; poster + `preload="none"`/`metadata` on landing videos if they hurt LCP. |
| F4 | **After-run** of the F1 set; before / after table in `docs/plans/phase6f-progress.md`. Budgets: ≥ 60 fps mid GPU (our AMD integrated stands in), ≥ 30 fps at 1080p everywhere, tick ≤ 2 ms, landing LCP < 2.5 s Slow 4G. |
| F5 | Tech-debt rows: `THREE.Clock` warning — upgrade only if an R3F patch fixes it, else log; trends / unit kill-chain recompute — measure at demo size, leave uncached unless > 300 ms. |
| F6 | Close-out: lint, web vitest, sim-core tests, a production build, `pnpm e2e` (visual baselines only if F3 changes pixels); decision(s); CLAUDE.md §14; memory. Checkpoint F = the before / after table — stop for OK. |

## Decisions to log

Intel run skipped by the user; cache policy for public assets (not `immutable`, paths are unversioned).

## Risks

FPS on this 6 GB machine is noisy when anything else runs (6D after-run was void) — each case runs three windows and the user's `pnpm dev` / `D:\Portfolio` servers must be stopped for F1 / F4. A production build plus FPS set takes ~30–40 min per pass.
