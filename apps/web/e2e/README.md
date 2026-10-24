# E2E tests (Playwright)

Runs against the local dev stack: `pnpm dev` from the repo root (web on :3000,
API on :8000, seeded demo users). Playwright reuses a running server or starts
one. Tests use the installed Chrome (`channel: 'chrome'`), so there is no
browser download.

| Spec                    | What it checks                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `visual.spec.ts`        | Screenshot baselines at 1366×768 and 1920×1080: landing, login, training list, briefing, result; console with a selected track, EO CUE / ACQ / TRK, RF tab, leak banner                                                                                                                                                                                                                                                                            |
| `a11y.spec.ts`          | No horizontal scroll at 1366×768; all effectors visible in the action bar without scrolling (1366×768, 1920×1080); core actions by keyboard alone; the briefing's mode toggle and Begin stay in view while the mission card scrolls; every order echoed in Comms within 100 ms; deuteranopia / protanopia captures (attached to the report, for the DESIGN §13 review)                                                                             |
| `fps.spec.ts`           | Frame rate in S13, S14, generated JK / PUNJAB D4–D5 cases and a 60-bird stress case, at 100 % (`@fps`) and 150 % (`@fps150`) display scaling, with the pixel ratio fixed and adaptive (not part of `pnpm e2e`)                                                                                                                                                                                                                                     |
| `checkpoint-3a.spec.ts` | Phase 3a review captures written to `e2e/checkpoint/` (git-ignored): a generated D3 scenario with no-kinetic zones, the zone-naming intercept tooltip, a practice HINT line, the result screen with payload drops (tag `@checkpoint`, run with `pnpm --filter @vyuh/web e2e:checkpoint`)                                                                                                                                                           |
| `checkpoint-3b.spec.ts` | Phase 3b Checkpoint B captures to `e2e/checkpoint/`: training list (plain and filtered), Generate panel (loading, error, rate-limited, idle), briefing pages for S06 and S04, S05 with coverage at 15 m, and the S06 player with grouped zone labels (no selection, a track near a zone, the town label hovered), at 1366×768 and 1920×1080 (tag `@checkpoint`); the S06 PPI before / after the label-priority change at 1366×768 (`PPI_TAG=before | after`) |
| `replay.spec.ts`        | AAR replay: a Node-recorded S04 log (`apps/api/tests/fixtures/s04_reports.json`) replays exactly in Chrome and scrubs by keyboard; a kill-chain stage jumps the replay; ground truth only on G; a session marked as SIM_VERSION 4 falls back to the event timeline                                                                                                                                                                                 |
| `checkpoint-4a.spec.ts` | Phase 4a captures to `e2e/checkpoint/` at 1366×768 and 1920×1080 (tag `@checkpoint`): S01 played and replayed (scrubber, markers, kill chain), S06 from a recorded log (ground truth on / off, a kill-chain stage, non-threats unfolded, help), the fallback, the contact report form and its Comms line, result-screen penalty links and Replay unavailable; prints Chrome memory for the S06 replay and the live S06 player (Windows)                                                                                                                |
| `aar-perf.spec.ts` | S06 replay FPS, and peak JS heap (CDP) vs peak Chrome process memory for the S06 replay and the live S06 player, on a production build (tag `@fps-aar`, not part of `pnpm e2e`; set `E2E_BASE_URL`) |
| `smoke.spec.ts`         | The landing page renders                                                                                                                                                                                                                                                                                                                                                                                                                           |

```
pnpm e2e                               # from the repo root: everything except @fps and @checkpoint
pnpm --filter @vyuh/web e2e:fps        # FPS on this machine's GPU, 100 % scaling
pnpm --filter @vyuh/web e2e:fps:150    # the same at 150 % (Windows display scaling)
pnpm --filter @vyuh/web e2e:update     # regenerate the visual baselines
```

## Visual baselines are Windows-rendered and local-only

The baselines in `__screenshots__/` were rendered on Windows 11 (Chrome, ANGLE
D3D11, AMD Radeon integrated). Font rasterisation differs on Linux, so **CI does
not run the visual diffs** (tracked as tech debt in CLAUDE.md §14). Run them
locally before merging UI work. After an intended UI change, regenerate with
`pnpm --filter @vyuh/web e2e:update`, then look at every changed PNG in the diff
before committing it.

## Test data and the LLM (decision 148)

- `e2e/global-setup.ts` runs before every Playwright run against a local API: `pnpm seed` (rebuilds `e2e@demo` from its fixtures) and `pnpm seed:reset-demo --yes` (deletes non-demo sessions on the other @demo accounts and re-derives ratings). Anything played by hand on a @demo account is removed. Set `E2E_SKIP_DEMO_RESET=1` to skip it. It also requests the main routes once so a freshly started dev server has compiled them.
- Every request carries `X-Vyuh-Test-Debrief: template`, so result screens and AARs get the template debrief whatever `LLM_ENABLED` says; the API honours it only where dev login is enabled (local auth, not prod). `checkpoint-5.spec.ts` clears it to capture a real LLM debrief.

## Determinism

- The console specs control sim time through `window.__vyuhE2E`
  (`lib/e2e/hook.ts`). The hook exists only in non-production builds: the
  session page imports it behind a `NODE_ENV` check, so production bundles
  never contain it. It holds a session at t = 0 and steps it to exact sim
  times. Everything else (clicks, shortcuts) goes through the normal UI.
- The WebGL canvas (terrain, models, EO video) is hidden in screenshots,
  because its pixels vary between runs. DOM overlays (3D track labels, EO gate,
  chips) and the 2D radar PPI stay in the picture.
- Sessions created by the tests are real rows for the demo users in the
  local database.
- The training-list baseline logs in as `e2e@demo`, whose completed sessions are
  fixed sim logs (`apps/api/app/seed/e2e/`) scored by the real server when
  `uv run python -m app.seed.demo` runs. Re-run the seed after
  `node packages/sim-core/scripts/export-api-fixtures.ts` rewrites them.

## FPS

`e2e:fps` prints mean FPS, the 95th-percentile frame time, draw calls per
frame, entity count and the 3D canvas pixel ratio per case, and fails below
30 fps (SPEC §16). Method (Phase 3b): 30 s idle on a blank page before each case
(`FPS_COOLDOWN_MS`), a discarded 5 s warm-up, then three 10 s windows; the
median window is reported with all three listed. Each case runs with the pixel
ratio fixed (as in every other e2e run, so screenshots stay deterministic) and
adaptive (as for users); `FPS_MODES=fixed` or `adaptive` runs one. 150 % is
emulated as `deviceScaleFactor` 1.5. Background load on the machine moves
results by 15–20 % between runs, so compare cases measured in the same run. S13 and S14 are real training sessions, so the
spec also measures a production build: `next build && next start`, then run it
with `E2E_BASE_URL=http://localhost:3000`. The stress case uses the dev hero
route (`/dev/hero?s=S14&birds=60`), so it is skipped on production builds;
under the dev server it is the worst case.
