# Phase 6D progress — motion and interaction pass

Plan: `docs/plans/phase6d-plan.md` (approved 2026-10-26). Decision 159.

| Step | Status |
|---|---|
| 1 Survey (`find-animation-opportunities`) | Done — in the plan |
| 2 Build D1–D11 (`animate`) | `8441254` — Comms entry, menu, tooltip (after the hover delay only), dialog, tab panel (WAAPI, `lib/motion.ts`), kill-chain unfold, result reveal; value flash on an `::after` opacity layer; ACQ pulse keyframe; progress via `scaleX`; radar trail dropped under reduced motion (`useReducedMotion`, `sweepTrailRad`) |
| 3 Review | `review-animations` cannot be invoked by the model (user-only skill); its checks were applied by hand with `improve-animations`. Finding fixed in `3e72710`: Comms entry off in the AAR replay (a seek brought in up to 30 lines at once) |
| 4 Performance (`animation-performance`) | From code: every 6D animation is transform / opacity (CSS keyframes or WAAPI); no `transition: all`, no layout property; the radar draws less under reduced motion. **FPS before / after on a production build: pending** — the user's `pnpm dev` holds `.next` and :3000 / :8000 |
| 5 Reduced motion | Global CSS override (system + `data-motion`), WAAPI checks `prefersReducedMotion()`, radar via hook. Proven in the browser by `checkpoint-6d.spec.ts` 06 (both modes) |
| 6 Final audit (`improve-animations`) | Done inline; logged in decision 159 (camera 300 ms kept; HUD hover colour transitions kept). Cohesion note: `components/landing/hero-video.tsx` keeps its own media-query listener (could use `useReducedMotion`) — left as is |
| 7 Checkpoint D | Videos at 1366×768 in `apps/web/e2e/checkpoint/6d/` (dev server, `npx playwright test e2e/checkpoint-6d.spec.ts`): 01 track selection, 02 response + Comms, 03 tabs + user menu, 04 AAR scrub + unfold, 05 result reveal; 06 motion probe. FPS table pending |

Unit tests: `apps/web/test/phase6d.test.ts` (sweep trail, first-render Comms lines, 120–180 ms tokens on `--ease-ui`, reduced-motion selectors). Web vitest 230.

## FPS (production build, FPS_SELECT=1, fixed DPR, AMD Radeon integrated)

| Case | Before (`0bb5880`) | After (HEAD) |
|---|---|---|
| S06 1920×1080 | 59 fps, p95 25.0 ms | 25, p95 58.5 — **invalid** |
| URBAN D5 seed 2 1920×1080 | 36, p95 41.7 | 18 (windows 18 / 18 / 44) — **invalid** |
| S06 1366×768 | 84, p95 16.8 | 43 — **invalid** |
| URBAN D5 seed 2 1366×768 | 48, p95 49.5 | 65 — **invalid** |

The after run (2026-10-26 ~20:10–20:30) overlapped another workload on this machine — a Vite dev server for `D:\Portfolio` (20:13) and a `scripts/shots.mjs` headless-Chrome screenshot job (20:33) — so it is not comparable; re-run both builds back to back on a quiet machine. The before run had the same API and no other load seen.

## Part boundary (2026-10-26)

User: "start with next part" — taken as Checkpoint D approved, FPS after-run moved to 6F. Visual baselines: no regeneration needed (screenshots run with `animations: 'disabled'`; every 1366×768 visual test passed unchanged). `pnpm e2e` **not green yet, environmental**: run 1 23 failed (log lost), run 2 16 / 23 — the 4 × 1920×1080 visual tests got `ERR_CONNECTION_REFUSED` (the Next dev server died) and 3 a11y tests timed out, with 658 MB of 6 GB free and two `D:\Portfolio` Vite servers running. Re-run `pnpm e2e` on a quiet machine before closing 6D in CLAUDE.md §14.

## FPS method (to run)

Production stack with the dev servers stopped: `cd apps/web && pnpm build && npx next start --port 3000`; API `cd apps/api && uv run uvicorn app.main:create_app --factory --port 8000`. Then
```
cd apps/web
FPS_SELECT=1 FPS_MODES=fixed E2E_BASE_URL=http://localhost:3000 E2E_SKIP_DEMO_RESET=1 npx playwright test e2e/fps.spec.ts --grep "(S06|URBAN D5 seed 2).*(1920×1080|1366×768) ×1 fixed"
```
Before = `0bb5880` (`git stash` not needed: `git worktree` or checkout the web files of `0bb5880`, build, measure, restore), after = HEAD.
