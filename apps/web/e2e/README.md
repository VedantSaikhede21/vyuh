# E2E tests (Playwright)

Runs against the local dev stack: `pnpm dev` from the repo root (web on :3000,
API on :8000, seeded demo users). Playwright reuses a running server or starts
one. Tests use the installed Chrome (`channel: 'chrome'`), so there is no
browser download.

| Spec | What it checks |
|---|---|
| `visual.spec.ts` | Screenshot baselines at 1366×768 and 1920×1080: landing, login, training list, briefing, result; console with a selected track, EO CUE / ACQ / TRK, RF tab, leak banner |
| `a11y.spec.ts` | No horizontal scroll at 1366×768; core actions by keyboard alone; every order echoed in Comms within 100 ms; deuteranopia / protanopia captures (attached to the report, for the DESIGN §13 review) |
| `fps.spec.ts` | Frame rate in S13, S14 and a 60-bird stress case (tag `@fps`, not part of `pnpm e2e`) |
| `smoke.spec.ts` | The landing page renders |

```
pnpm e2e                               # from the repo root: everything except @fps
pnpm --filter @vyuh/web e2e:fps        # FPS on this machine's GPU
pnpm --filter @vyuh/web e2e:update     # regenerate the visual baselines
```

## Visual baselines are Windows-rendered and local-only

The baselines in `__screenshots__/` were rendered on Windows 11 (Chrome, ANGLE
D3D11, AMD Radeon integrated). Font rasterisation differs on Linux, so **CI does
not run the visual diffs** (tracked as tech debt in CLAUDE.md §14). Run them
locally before merging UI work. After an intended UI change, regenerate with
`pnpm --filter @vyuh/web e2e:update`, then look at every changed PNG in the diff
before committing it.

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

## FPS

`e2e:fps` prints mean FPS and the 95th-percentile frame time per case, and
fails below 30 fps (SPEC §16). S13 and S14 are real training sessions, so the
spec also measures a production build: `next build && next start`, then run it
with `E2E_BASE_URL=http://localhost:3000`. The stress case uses the dev hero
route (`/dev/hero?s=S14&birds=60`), so it is skipped on production builds;
under the dev server it is the worst case.
