# Phase 3 · Part 3.0 — Design foundation and UX pass (approved plan)

Approved 2026-10-15. Scope: apply `docs/DESIGN.md` to existing screens. No sim behaviour change; `SIM_VERSION` stays 2. Lint + tests for touched packages after every commit.

Inputs: playtest notes = the Step 1 S14 audit (user notes follow after 3.0). Intel FPS not yet measured — must be measured before 3a starts.

## Decisions (logged in docs/decisions.md)

1. **Fonts via `next/font/local`** with committed IBM Plex woff2 files (OFL) in `apps/web/app/fonts/` — `next/font/google` downloads at build time and would break the offline Docker build. Licence/source recorded in `docs/realism-sources.md`.
2. **Tooltip is an in-house primitive** (hover + focus, `aria-describedby`, disabled buttons wrapped in a focusable span) — avoids adding `@radix-ui/react-tooltip`.
3. **No-raw-hex lint:** ESLint `no-restricted-syntax` rejects hex literals in `app/` and `components/`; exceptions are `globals.css` and `lib/theme/scene-colours.ts` (single source for 3D/canvas colours).
4. **Dev-only routes** (`/dev/ui`, `/dev/hero`) are `page.dev.tsx`; `next.config.ts` adds `dev.tsx` to `pageExtensions` only outside production.
5. **`trueClass`, `recommendedDifficulty`, `recommendationBasis`** are filled in the sessions service *after* the scoring engine, so engine output (and the v1/v2 golden re-score tests) stays byte-identical. All optional and additive; old scores lack them.
6. **Feedback humanised on the client** (`humaniseFeedback()`: `BIRD_LARGE` → "large bird") because feedback strings live in immutable tree JSON.
7. **Disabled reasons use operator-known facts only:** selection, session ended, effector missing, cooldown, ammo, ROE vs the trainee's own affiliation call, *estimated* track range vs effector range. Scoring ignores `BLOCKED_BY_ROE` / `OUT_OF_RANGE`, so pre-disabling changes no score.
8. **No truth leaks in the HUD:** Comms log, banners and the ACQ reason use track/strobe data and trainee calls only — never `contactId` or collateral lists. "Friendly in jam sector" = a trainee-marked FRIENDLY track or a strobe with a friendly ID within ±10° of the jam bearing and inside jammer range.
9. **Deterministic visual baselines, local-only:** a test hook `window.__vyuhE2E` (only when `NEXT_PUBLIC_E2E=true`) pauses the practice runtime and steps it to an exact `tMs`; WebGL regions are masked. Baselines are Windows-rendered, so CI does not run visual diffs yet (tech debt).
10. **Ground-truth defender** promoted to `packages/sim-core/src/defender.ts` (pure, no RNG); used by the landing hero now and the 3a validator later. The test helper `playScripted` is untouched.

## Steps

1. **`docs: resolve DESIGN/SPEC conflicts`** — CLAUDE.md §3 "Tactical console look per docs/DESIGN.md" (D1); SPEC §15.2 type sizes defer to DESIGN §4 (D2), sound parked (D3); decisions D1–D4 + decisions 1–10 above; CLAUDE.md §14 Open idea: "ROE interlocks — decide in Phase 4 whether Assessment mode allows attempting ROE-violating responses (and scores them) instead of pre-disabling, so ROE judgement is actually tested."
2. **`chore(web): playwright, lucide, dev routes`** — `@playwright/test` (approved), `lucide-react` (pre-approved); `apps/web/playwright.config.ts` with system Chrome (`channel: 'chrome'`, ANGLE D3D11 flags, decision 45); root `pnpm e2e` → `pnpm --filter @vyuh/web e2e`; `devIndicators: false`; `pageExtensions` switch.
3. **`feat(web): design tokens and IBM Plex`** — all DESIGN §3 tokens, spacing (4–48), radius 2/4, type-scale utilities (`text-display`, `text-h1`, `text-h2`, `text-panel-title`, `text-label`, `text-body`, `text-small`, `text-readout`, `text-readout-lg`), `tnum`, motion token with `prefers-reduced-motion`; Tailwind mapping (`bg-bg-1`, `text-text-2`, `border-line-1`, `text-aff-hostile`, `text-cue`…); old tokens removed and usages migrated; `lib/theme/scene-colours.ts`; ESLint no-hex rule. Token renames only — no layout changes in this commit.
4. **`feat(web): restyle ui components`** — button (primary bone / secondary / ghost / danger; 28/32/36), badge, input, label, select; Tooltip; `card` removed in favour of `Panel`; 2 px `--select` focus ring.
5. **`feat(web): HUD primitives and /dev/ui gallery`** — `components/hud/primitives/`: Panel, PanelHeader, Readout (value + muted unit + label, 300 ms `--bg-3` change flash), StateChip, Kbd, AffiliationSymbol (moved, same APP-6 shapes), CooldownRing, CommsLog, Pips, Banner, Skeleton (label + progress), Tooltip. `/dev/ui` shows each in default / hover / focus / disabled / loading / error (forced states for screenshots).
6. **`feat(api): trueClass, recommended difficulty, hide test scenarios`** — zod: `PerContactMetrics.trueClass?`, `Score.recommendedDifficulty?` (1–5), `Score.recommendationBasis?` (`RULE_V1`); `pnpm gen:schemas`. Rule: total ≥ 80 → +1, < 50 → −1, else same, clamp 1–5 (Phase 5 Elo replaces it in the same place). `GET /scenarios` hides `test`-tagged scenarios from TRAINEE. pytest: boundaries 49.9/50/79.9/80, clamps, `trueClass` after completion, role filter, goldens unchanged.
7. **Sim player** (commits: layout + top bar; track list; action bar; EO; PPI; Comms log + banners; 3D look)
   - Full viewport, no app header on `/train/session/*`; fixed grid per SPEC §15; "use a larger screen" notice below 1280 px.
   - Top bar: large `mm:ss` clock + remaining; neutral ROE StateChip; mode chip; affiliation counts (trainee calls); connection/queue indicator at all widths ("SYNCED 21" / "Connection lost — events queued (14)"); single-line Banner (`--crit` leak imminent, `--warn` friendly in jam sector); Pause (practice only), `?`, End session with inline confirm.
   - Track list: symbol, id, class or `—`, range km, bearing `045°`, altitude band LOW/MED/HIGH, RF badge, state; keyboard focus follows selection; `--select` edge; LOST muted.
   - Action bar: *Identify* (Mark detected, Classify, affiliation as symbol + letter on neutral chrome) · *Respond* (Monitor, Jam, Spoof, Intercept); Kbd, disabled-reason tooltip, CooldownRing, ammo on buttons; labelled effector lines; *Report* omitted until the form exists; fits 1366×768 without scroll.
   - EO: StateChip MAN / CUE / ACQ / TRK — ACQ is UI-only (CUE > 1.5 s on a track without TRK) with reason "No video lock — target below detection threshold at this zoom/range" (never class or true range); cue box in `--cue` at the projected track estimate; off-screen edge arrow; opaque readout strips; EO day-sky luminance clamp in `environment-look.ts`.
   - PPI: scene-colour tokens; greedy label decluttering (selected track always labelled); RF strobes as dashed `--text-2` lines with an "RF" tag.
   - Comms log: last ~8 lines, timestamped, newest at bottom; immediate echo on dispatch (marked queued while paused), confirmed by sim events; colour only for outcome status.
   - 3D: asset rings / site markers in neutral chrome; terrain edge blended into fog/sky; legend moved into the `?` sheet.
   - **CHECKPOINT — STOP:** show described screenshots of the player at 1366×768 and 1920×1080 with a track selected, EO in CUE, ACQ and TRK, the RF tab, a banner showing and the Comms log populated. Wait for approval before Steps 8–10.
8. **`feat(web): result screen`** — large total + early-end line ("Ended by operator at 01:12"); bars for scored components, unscored ones named in one plain line; timestamped penalties; per-contact table (true class symbol + label, tracks, detected at, latency, your class, your affiliation, responses, outcome label, points); server-recommended next difficulty with basis; *Retry same seed* (new session, same scenario + mode) and *Next scenario* (next non-test by difficulty, then id); *Replay* omitted until Phase 4.
9. **`feat(web): training list and login restyle`** — training: table (code, name, difficulty Pips, day/night, ROE, duration), row select → existing briefing, one primary per screen, worded loading/empty/error; briefing restyled only (redesign in 3b). Login: left-aligned form on a darkened static hillshade from `scripts/hillshade/gen-hillshade.ts` (Node, stdlib `zlib` PNG encoder; reused by 3b thumbnails); "Try the demo instead" hidden until Phase 6.
10. **`feat(web): landing page`** — hero `hero.webm` (muted, looped, `poster.png`) + left-aligned statement + PS 26247 / MoD line, primary "Sign in to train", secondary "How scoring works"; kill-chain strip with real crops; realism (terrain, night/IR, silent links, false contacts, ROE) as annotated screenshots with cited sources; measurement = result screen labelled "Demo data" + scoring tree in 3 lines; deployability facts; footer "Team Synac Syndicate · Smart India Hackathon 2026 · PS 26247 (Ministry of Defence)" + Sources link (no members line for now).
    - Repeatable media script `pnpm --filter @vyuh/web record:landing`: Playwright `recordVideo` of `/dev/hero` (S14, 1280×720, fast-forward to ~60 s, then ~25 s real time with the truth defender) + screenshot crops into `public/landing/`; webm target ≤ 4 MB.
    - `/sources` page renders `docs/realism-sources.md` with a minimal in-house renderer (headings, lists, links, tables). **Must build on Vercel with `apps/web` as the project root:** if reading `../../docs` is not reliable there, a `prebuild` script copies `realism-sources.md` into the web app (git-ignored copy) at build time. Verify with a build run from `apps/web` alone.
11. **`test(web): playwright visual baselines`** — `e2e/visual.spec.ts` (landing, login, training, briefing, player: selected track, EO CUE/ACQ/TRK, RF tab, banner; result) at 1366×768 and 1920×1080 into `apps/web/e2e/__screenshots__/`; `e2e/a11y.spec.ts` (no horizontal scroll, keyboard core actions, Comms ack ≤ 100 ms, deuteranopia/protanopia captures via CDP vision-deficiency emulation); `e2e/fps.spec.ts` (decision 45 method) for the Intel laptop. `apps/web/e2e/README.md` documents that baselines are Windows-rendered and local-only, and gives the exact regenerate command. CI visual-diff gap logged as tech debt in CLAUDE.md §14.
12. **Close-out** — described before/after per screen; DESIGN §13 checklist per screen; FPS re-check (AMD, S13/S14/60-bird stress); `pnpm lint`, `pnpm test`, `uv run pytest`, `gen:schemas` no diff, `next build` (confirm `/dev/*` absent); update CLAUDE.md §14; STOP.

## Tests

- vitest (web): altitude-band boundaries (50/150 m), friendly-in-jam-sector incl. 0° wrap, leak-imminent rule, ACQ derivation, Comms line builder (never emits a `contactId`), PPI declutter, `humaniseFeedback`, disabled-reason resolver.
- sim-core: defender never engages a non-threat in S01, S02, S03, S14; determinism unchanged.
- pytest: as in Step 6.

## Risks

- Step 3 is a large mechanical diff — token renames only, for reviewability.
- Playwright `recordVideo` bitrate is modest; fallback is CDP screencast frames encoded with Playwright's bundled ffmpeg (no repo dependency).
- Headless hero capture on the integrated GPU may not hold 60 fps; acceptable for a short clip.
- Per-frame cue-box projection and PPI declutter cost FPS — both O(tracks), checked in close-out.

## User actions

- Run `pnpm --filter @vyuh/web e2e:fps` on the Intel laptop after 3.0, before 3a.
