# Part 6R, 6F close, 6G, 6I: progress and how to resume

Session of 2026-10-29 to 31. User decisions: do 6R before 6G; drafts treated as approved; proposals Q1–Q14 accepted; checkpoints self-reviewed against DESIGN §13 and **batched for the user at the end** (not yet shown to them); subset fonts; hosted accounts wait for the user (`docs/DEPLOY.md` is the click-list).

## State

| Part | State |
|---|---|
| 6F fonts | Done. Plex Mono subset, Archivo 75 KB, fonts 91 KB total. Landing on Slow 4G + 4× CPU: **LCP 2.26 s, JS 191 KB** (budgets 2.5 s, 200 KB), production build, `e2e/landing-perf.spec.ts` 2 / 2 |
| R1 tokens, Archivo, primitives, S6 cache, S8 | Done |
| T1–T6 terrain | Done: Sentinel-2 albedo and cover, AO, normals, detail, sky, height haze, baked shadows, conifers (JK), gable roofs, IR by cover, quality tiers. All sim-core tests unchanged (display only) |
| R2 render kit, R3 public pages, R4 shell + Home, R5 gallery + 3D briefing + flight | Done |
| R6 player | Done: main view, PIP, wide radar, track card, More, threat sort, time to asset |
| R7 result hero | Done. AAR picks up the player layout |
| R8 other screens | Carried by the token and primitive restyle; reviewed at 1366 only (Unit, Trends, Library, Record, Help, Settings, Notices), no horizontal scroll |
| S1, S2, S4, S5, S6, S8, S9, S10 | Done |
| 6G offline | API image built and run; **web image from source not proven** (see below) |
| 6I user study | Built: `pnpm study:enrol N`, `/instructor/study`, CSV. API tests pass; **page never opened in a browser** |
| 6H final verification | Not started |

## Evidence so far

- Offline run, production build, API + Postgres in Docker, web on the host, every non-localhost request blocked: guard redirect, 3D briefing, session, reload and resume, server score, template debrief; **0 external requests, 0 console errors with the CSP on**. Fresh DB: all 10 migrations and the seed ran.
- `e2e/resume.spec.ts` passes (dev server). Unit test: rebuilt run continues into a byte-identical log.
- `a11y`, `smoke`, `keyboard-6b`, `replay` specs: 14 / 15 on the player rebuild; the failure (Map toggle in the keyboard spec) was fixed but **not re-run**.

## Closed: ending a session early scored 100

**Closed 2026-10-31, decision 173 (user chose split by mode).** Assessment ended early: `ABANDONED`, no score, no rating, not on the record. Practice ended early: feedback as a partial run with no total, template debrief. SPEC §4.5 updated; migration 0011; `tests/test_early_end.py`, `e2e/early-end.spec.ts`. Evidence: shared 48, sim-core 345, web 288, full API pytest; `pnpm e2e` 26 / 27 on the final code, the failure a 5 s screenshot timeout on the 1920 landing during a slow run (7.9 min), which then passed 2 / 2 alone. `a11y` keyboard test now waits through `awaitSession` (it had a 5 s limit on a cold API).

## Not verified: do not assume these work

1. ~~`apps/web/Dockerfile` has never completed.~~ **Closed 2026-10-31**: needs `memory=3GB` in `%USERPROFILE%\.wslconfig` (Docker runs on WSL2, the Resources slider does nothing; `wsl --shutdown` is required, Docker's restart alone keeps the old VM). `POSTGRES_PORT=5433 docker compose -p vyuh-proof up --build -d`: web image built, empty database migrated to 0010 and seeded, all up in ~50 s. Full S06 session in the containers (guard, 3D briefing, reload and resume, server score, template debrief, six other pages) with every non-localhost request blocked: **0 external requests, 0 console errors**. Proof stack and its volume removed.
2. ~~FPS on the new terrain is unmeasured.~~ **Closed 2026-10-31**: production build, AMD integrated, HIGH tier, fixed pixel ratio, `e2e/fps.spec.ts` with `FPS_SHOT_DIR` frames reviewed. 1920×1080 / 1366×768 fps: map main S06 57 / 100, S05 69 / 119, S15 78 / 118; camera main 120 / 120 for all three (the picture is a fixed 640×360); S05 briefing 92 / 120. All above the 30 fps budget, no tuning needed. Not re-run: 150 % scaling, the generated and 60-entity cases (6H full set); Intel stays waived (decision 162).
3. ~~Full `pnpm e2e` not run since the redesign.~~ **Closed 2026-10-31**: `pnpm e2e` 25 / 25 (3.5 min, dev server), web vitest 288, lint clean. All 24 visual baselines regenerated; the 1366 screens with real changes reviewed, the 1920 set not looked at one by one. Still open: `break-ui`, checkpoint and capture specs are outside `pnpm e2e` and likely reference removed things (action bar, operator panel, `generate-panel` now in a dialog, table rows on Training). `--update-snapshots` keeps a baseline that differs by under 1 %: delete the file to force a small change through.
4. Landing media (`pnpm --filter @vyuh/web record:landing`) still shows the old UI: kill-chain crops, measure crop. The `/landing` hero video is no longer used on the page.
5. **Landing `TelemetryStrip` and the `DEPLOY` facts** quote earlier FPS numbers: re-check them against the new measurements.
6. S01–S03 (`PROCEDURAL_HILLS`) stills are a plain green blob and are the first cards in the gallery.
7. Full API pytest passes (2026-10-31). `next.config.ts` CSP tested on production only.
8. CI status unknown (`gh` not installed). Pushes since 5c517dc should be checked. Root `pnpm test` was failing from 3f65453 (`resumeCount` missing from a shared fixture) until 2026-10-31, so runs in that range are expected red.
10. Comms ack on the dev server is noisy: usually 4–40 ms, spikes of 60–101 ms on any key when the machine is busy (seen 2026-10-31). Measure on a production build in 6H; the 100 ms limit stays.
9. `/status` admin list of client errors from the plan is not built (the API route exists).

## Deferred from the plans (decision 168)

Shared-element tile → briefing, LOS coverage on the 3D briefing, compass tape, Comms filters, PPI leader lines, F3 cell at 1920, auto-swap on cue, landing classify-the-clip and pinned scroll, library turntable, S3 kill-chain projection, Elo-free study rounds with different seeds (the kit counts repeat runs of the fixed scenarios).

## Next, in order

1. Start the dev stack: `pnpm dev` (old Postgres on 5432). The API needs a restart by hand after schema changes; the local DB is at migration 0010.
2. Done 2026-10-31: FPS (item 2), `pnpm e2e` and baselines (item 3). Bugs those runs found, fixed: camera PIP black in the default layout (panel background above the canvas), night thermal terrain black (visible-light levels), landing FPS claim out of date, briefing caption under the controls.
3. Fix the `break-ui`, checkpoint and capture specs. Known small issues: `/sources` has two `h1`s; thermal trees render pure black; the map PIP covers the left of the camera readout in camera main; on the briefing map the title card overlaps the map corner at 1366.
4. Re-record landing media; fix the PROCEDURAL_HILLS stills; check claims on the landing.
5. Show the user the batched captures (1366 and 1920) and take their feedback.
6. Raise Docker memory, prove `docker compose up --build`.
7. Hosted: the user follows `docs/DEPLOY.md`, sends the two URLs.
8. 6H: full verification, `docs/RELEASE-CHECKLIST.md`, `docs/DEMO-SCRIPT.md`, final CLAUDE.md §14.

## Machine notes

- Git Bash: `MSYS_NO_PATHCONV=1` for URL paths given as arguments; long heredocs fail, use the Write tool.
- Stop servers **by port** only; other projects run on this machine.
- Editing `next.config.ts` restarts Next. uvicorn doesn't reload on Windows.
- PyPI file host is slow here (~14 KB/s): set `UV_HTTP_TIMEOUT=900` for new packages.
- A pipe to `tail` hides exit codes: check `${PIPESTATUS[0]}`.
- `docker-compose.yml` now starts everything; for development use `docker compose up -d postgres`.
- `docs/plans/redesign-*.md` stay untracked: the user has not asked for them to be committed.
