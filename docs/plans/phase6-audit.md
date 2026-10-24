# Phase 6.0 — UX / UI audit and plan

> Part 6.0 of `docs/plans/phase6-requirements.md`. No product code changed. Date: 2026-10-24, branch `feat/phase6-audit` from `main` (Phase 5 merged).

## How this was measured

- **Build:** production `next build` of `main`, served with `next start` on :3100, pointed at a separate API on :8100 (`CORS_ORIGINS=http://localhost:3100`, `LLM_ENABLED=false`, local Postgres with the seeded demo data). The developer's own dev servers on :3000 / :8000 were left untouched.
- **Captures:** a temporary, untracked spec `apps/web/e2e/audit-6-0.spec.ts` (tag `@audit`), headless Chrome, ANGLE D3D11, AMD Radeon integrated. Output in `apps/web/e2e/checkpoint/6.0/` (git-ignored): every screen at 1366×768 and 1920×1080, public pages also at 390×844, the player at 1200×800, error states, console logs, horizontal-overflow measurements, journey logs.
- **Journeys:** scripted at 1366×768 in real time (production build, no test hook). Scripted time is the machine floor; "human estimate" adds reading and decision time and is an estimate, not a measurement.
- **Audit checklist:** `redesign-existing-projects`, used as a checklist only. Its advice that DESIGN.md bans or overrides (font swap, grain / noise, glass, tinted shadows, spring / parallax / staggered motion, stock imagery, replacing Lucide, dropping uppercase labels) was skipped.

**Clean results:** no horizontal overflow on any page at any size, including 390 px; production console clean except the known `THREE.Clock` deprecation warning (no drei `<Html>` unmount errors in production); global 2 px focus ring and `prefers-reduced-motion` handling exist; tokens are used everywhere; the training list, briefing, trends and unit dashboard already follow the panel system closely.

---

## 1. Journey timings

| Journey | Scripted (machine floor) | Clicks / keys | Human estimate | Blocking moments |
|---|---|---|---|---|
| **Judge** (landing → S15 → result → AAR → trends → unit → from text → sources) | First radar track **8.3 s** after opening the URL (5.6 s after the player appears); whole path 72 s plus 60 s of play | 18 clicks, 1 key | First track ~1.5–2 min; whole path **~7–9 min** | No "Try the demo" (landing's only entry is "Sign in to train"); login is a developer dropdown with "Offline development only … ENV=prod"; on the hosted Supabase build a judge **cannot sign in at all**; seeing the unit dashboard needs **Log out → choose instructor@demo → Sign in**; no tour; 3D view shows no tracks |
| **New trainee** (first login → S01 Assessment → debrief → replay) | First track 21 s after Begin; result at 2:48 (clock ran out); replay 1.5 s later | 8 clicks, 6 keys | ~5–6 min | Lands on the training list (no home, no welcome, no "start here"); nothing in the player says what to do first; result recommends **harder** difficulty after a leak; score 63 vs debrief "62" |
| **Instructor** (builder → save → unit → assign → trainee AAR) | 9 s | 7 clicks (assignment not submitted, to keep demo lists clean) | ~2–3 min | Lands on the training list, not the unit; zone drawing not explained on the map; saved scenario appears in the assign list without its `AUT-` code; "Open a row for its AAR" but the first link in a row (trainee name) opens trends |

Data created by the runs (local DB): non-demo sessions on trainee1, trainee3 and trainee6 (`pnpm seed:reset-demo --yes` removes them) and one authored scenario "Canal Bridge" (instructor@demo).

---

## 2. Findings

Ranked **P0** (blocks or embarrasses the demo), **P1** (noticeable), **P2** (polish). Evidence = capture name in `apps/web/e2e/checkpoint/6.0/` (suffix `-1366x768` / `-1920x1080` / `-390x844`).

### P0

| # | Screen | Finding | Evidence | Proposed fix | Part |
|---|---|---|---|---|---|
| P0-1 | Landing, login | **No guest entry.** The only path in is "Sign in to train"; the login dropdown is developer-facing; on the hosted Supabase build a judge has no credentials. | `pub-landing-fold`, `pub-login-fold`, `journey-judge.json` | Guest mode + "Try the demo" as the landing's primary action; login shows "Try the demo instead"; dev dropdown only in `local` mode and worded for offline units, not developers. | 6E (entry button wired in 6C) |
| P0-2 | Judge path | **Unit dashboard needs a role switch.** Step 6 of SPEC §20 requires signing out and in as instructor@demo. | `journey-judge.json` (clicks 11–15) | Guest gets a read-only instructor view of the demo units (requires restricting real instructors to their own unit first, decision 123). | 6E |
| P0-3 | Result | **Recommendation contradicts the run.** 0 / 100 in Practice shows "Recommended next difficulty 3, up from 2"; a leaked threat at D1 shows "3, up from 1" with rating −4. The bone primary is "Next · S04 Night Drop" either way. The value is rating-based (decision 129), but the screen does not say so. | `result-full`, `journey-trainee-result` | Label the basis ("From your rating 1137"); in Practice say the rating is unchanged and drop "up from"; after a leak or a score below a threshold the primary action becomes the suggested drill / Retry, Next becomes secondary. **Needs approval** (changes what the trainee sees). | 6B |
| P0-4 | Result + debrief | **Score mismatch.** Result shows 63 / 100, the debrief says "Score 62 / 100" for the same session (62.5: JS `toFixed` rounds half up, Python `:.0f` rounds half to even). | `journey-trainee-result` | One display-rounding rule (half up) in the debrief template and anywhere else a total is printed; display only, scoring unchanged. | 6B |
| P0-5 | Sim player | **First-time trainee has no next step.** Nothing tells them to select a track, cue the camera, classify; the tour does not exist yet. | `player-start`, `player-selected` | Practice-mode "next step" line in the action bar header driven by the selected track's kill-chain state (e.g. "Cue the camera · Space"), plus the guided tour. | 6B (hint), 6E (tour) |

### P1

| # | Screen | Finding | Evidence | Proposed fix | Part |
|---|---|---|---|---|---|
| P1-1 | Player | 3D tactical view (the largest panel) never shows the tracks: camera fixed north while S15 birds come from 273°; the selected track's 3D label is clipped at the bottom edge over the EO header. | `player-selected`, `player-eo-cued-1920x1080` | Camera eases to keep the selected track in frame (bounded, no motion when reduced motion); label clamped inside the view. | 6B |
| P1-2 | Player | Comms shows 4 lines at 768 px (long lines wrap to two). Known debt. | `player-selected-1366x768` | Single-line entries with ellipsis + full text on hover; tighter line height; ≥ 8 lines at 768. | 6B |
| P1-3 | Player, landing | EO day view is a blown-out flat sky (top half near-white) — reads as a broken render; same in the landing "Identify" crop. | `player-eo-cued`, `pub-landing-1920x1080` | Tone the day sky / exposure in the EO render target; re-record the crop. | 6B, 6C |
| P1-4 | Player | Disabled INTERCEPT is drawn in `--crit` red at all times — critical colour on an unavailable control. | `player-start` | Danger styling only when armed / confirming; disabled uses the normal disabled treatment with its reason. | 6A |
| P1-5 | Player | AI chip abbreviation "BRDL" / "QDS" is opaque; Comms says "LARGE BIRD". | `player-selected` | Chip shows the class short name ("Large bird · 79 %"). | 6B |
| P1-6 | Shell | No active-nav state, 11 px nav labels, user name as plain text, "Log out" ghost button; instructor bar has 6 flat links; no breadcrumbs beyond page eyebrows; no skip link. | all signed-in captures | UI-PREP §3 shell (6A §5). | 6A |
| P1-7 | Global | Next's **default white 404**; no `error.tsx`, `not-found.tsx` or `loading.tsx` anywhere. | `pub-404-fold` | System-styled 404 / error / route loading. | 6A |
| P1-8 | Errors | Raw API wording reaches users: "Request validation failed." (bad briefing id), "…: Session not found"; titles in `--crit` for a not-found; two different error layouts. | `err-briefing-missing`, `err-aar-missing` | One `ErrorState` primitive (cause + next step, neutral tone for not-found); API codes mapped to copy. | 6A, 6B |
| P1-9 | Instructor screens | Developer text in the UI: "SPEC §9.5", "Decisions 115, 116", "tMetric" (scoring), "LLM_ENABLED=false" (from text), "Offline development only … ENV=prod" (login). | `scoring`, `from-text`, `pub-login-fold` | Plain-language copy; env names only on the status page. | 6B, 6C |
| P1-10 | Global | Disabled bone buttons render as a muddy grey block (`opacity-40` over bone). | `scoring`, `from-text`, `unit-full` | Disabled primary = outline + `--text-2` label + reason. | 6A |
| P1-11 | Global | `--text-3` used for text in 96 places (examples, captions, hints, units) — fails 4.5:1 at small sizes. | `from-text` examples, landing captions | `--text-body` / `--text-2` for text; `--text-3` for non-text only (amendment 3). | 6A |
| P1-12 | Result | Template debrief repeats one missed track as five rows (one per stage, same time). | `result-full` | Group a track whose chain stopped at one stage into one line ("T006 never acted on — 00:18"). Template only; LLM prompt already groups. | 6B |
| P1-13 | Result | Components sum to 50 but the total is 63 (v1 scaled over 80) with no explanation; S01 — the tutorial — still scores on `default_v1` ("does not score report"). | `journey-trainee-result` | Show "scaled to 100" note. Moving S01 (and S02 / S03) to `default_v4` for new sessions is a **scoring change — your call** (old sessions keep v1). | 6B |
| P1-14 | AAR | Opens at 00:00 on an empty scene ("No radar tracks yet"); "GROUND TRUTH ON" reads as state or action; MISS cells in `--crit`; timeline marker shapes have no legend; side panel shows 4 rows at 768. | `aar-truth-1366x768` | Open at the first event; switch with a clear label ("Ground truth · G" + on / off state); MISS in `--warn`/text with symbol; marker legend. | 6B |
| P1-15 | Trends | "Detect 40 %" (kill-chain stage) next to "Detection 58 %" (score component) with no explanation; difficulty chart is a flat line with odd ticks (2, 5); score axis ticks 0 / 25 / 50 / 100. | `trends-full` | One-line definitions under both panels; replace the difficulty chart with a step readout; even ticks. | 6B |
| P1-16 | Unit dashboard | "Open a row for its AAR" but the first link opens trends; overdue assignment not flagged in "Are assignments being completed?". | `unit-full`, `journey-instructor.json` | Whole row opens the AAR, trainee name is a separate explicit link; overdue chip. | 6B |
| P1-17 | Builder | Place asset / Draw zone are small header buttons with no instructions on the map; no inline field errors. | `builder` | Map overlay hint for the active tool, Esc to cancel, inline errors next to fields (6B goal). | 6B |
| P1-18 | Landing | Crops are from 2026-10-18 (pre-4a/4b/5): result crop shows tree v1, no debrief, no rating; FPS claim "S14 99 fps" no longer matches the latest run (77–88); identify crop is the white EO sky. | `pub-landing-1920x1080`, `public/landing/` | Re-record after the UI is final (6C §9); facts from the latest measurements only. | 6C |
| P1-19 | Sources | Rendered markdown with repo paths (`packages/sim-core/src/terrain.ts`), phase names, code chips — written for developers. | `pub-sources-fold` | Restyled page: ruled table per topic (what · model / dataset · source · licence), repo detail in a collapsed "technical notes". | 6C |
| P1-20 | Login | No "Try the demo instead" (DESIGN §11.2); left-aligned form floats in a 1366 viewport with a long licence footer. | `pub-login-fold` | Same system as landing (6C §10). | 6C |

### P2

| # | Screen | Finding | Proposed fix | Part |
|---|---|---|---|---|
| P2-1 | Signed-in pages at 1920 | Content capped at `max-w-6xl` (~1150 px): ~400 px empty gutters; briefing map panel has dead space under the legend. | Page container 1280 (DESIGN §5) and briefing map fills its column. | 6A |
| P2-2 | Training list | S01–S03 thumbnails blank (procedural terrain); Generate panel's bone button competes with choosing a scenario. | Thumbnails for PROCEDURAL_HILLS; Generate as secondary. | 6B |
| P2-3 | Briefing | S06 "RELAY SITE" label overprints zone hatching (known S05 ring-label debt is the same class). | Label collision offset. | 6B |
| P2-4 | Result | Penalties panel takes half the width to say "No penalties or bonuses". | Collapse to a line when empty. | 6B |
| P2-5 | Player | `?` sheet open in Practice does not pause the clock. | Pause while any overlay is open in Practice. | 6B |
| P2-6 | Player < 1280 px | Notice is bare centred text with no wordmark or way back. | Styled notice with "Back to training". | 6A |
| P2-7 | Global | No `og:` / social meta (judges may paste the link in chat), no `text-wrap: balance` on headings, no pressed state on buttons. | Meta in root layout; balance on H1/H2; 1 px pressed offset. | 6A, 6C |
| P2-8 | Landing | Crop scales inconsistent (Detect huge, Track tiny); realism grid uneven heights; measurement image lazy-loads blank in full-page captures. | Fixed crop frames per sheet; eager-load above the fold; per §11.1 rework. | 6C |
| P2-9 | Builder | Saved authored scenario lists without its `AUT-` code. | Show code in lists and the assign form. | 6B |

---

## 3. Open tech debt (CLAUDE.md §14) → Part

| Item | Part | Note |
|---|---|---|
| Intel integrated-GPU FPS | 6F | Command for the teammate; pending if not returned |
| S06 replay at 1920 near 30 fps, follow-up not re-measured; per-frame DOM truth labels | 6F | `@fps-aar` on a production build |
| Per-tick allocations (URBAN scavenges) | 6F | Only if Intel shows overruns |
| Trends / unit dashboard recompute kill chains per request | 6F | Cache once units are large |
| 60-contact radar tick on PUNJAB ~0.9 ms; 60-bird stress dev-only; FPS case takes ~80 s; `next build` time | 6F | |
| `THREE.Clock` deprecation (R3F internals) | 6F | Upgrade only if R3F has a release; otherwise logged |
| Comms ~6 lines at 768 (now 4 measured) | 6B | P1-2 |
| drei `<Html>` unmount errors (dev) | 6B | Not seen in production; re-probe in dev |
| Template debrief near-identical ROE lines; re-scored feedback "/10" wording; builder note and zone names not on the briefing legend; S05 ring label touches Z2; no-kinetic violation feedback names the zone only with one zone | 6B | |
| Debrief cached for INVALID_OUTPUT kept | 6B | Staff-only "Regenerate" on the debrief panel |
| Unsent event batches memory-only; reloaded session cannot resume | 6G | `sessionStorage` queue — matters on hosted networks |
| Web auth guard client-side only (decision 9) | 6G | Security pass |
| Instructor scope is all units (decision 123) | 6E | Prerequisite for guest read-only instructor view |
| LLM / generate rate limits in-memory; OpenRouter credit low | 6G | Single instance documented; spend cap |
| Seed changes need `pnpm seed` outside `ENV=dev` | 6G | Production seed step |
| Old `sih-2026-postgres-1` container holds :5432 | 6G | Offline build README; stop / remove instructions |
| No 1920 captures / e2e for Phase 4b and 5 screens; CI does not run visual diffs; CI generator sweep not full size; S12 close-range IR not re-checked | 6H | |
| Demo logs must be re-recorded after any sim change | 6F / 6H | Gate in the 6H checklist |
| Small birds rarely reach the spectrogram floor | 6E | Tour and demo script use the large birds |
| LLM debrief run-to-run variation (omissions) | 6H | Demo-script talking point; template stays the floor |
| Assessment on v1–v3 trees allows ROE attempts without penalty; guard player engages non-threats; D4/D5 altitude notes; RF/EW not in the generator; RF-only unactionable; uvicorn reload on Windows | parked | Logged decisions; no Phase 6 change |

---

## 4. Proposed plan for 6A–6I

Order and scope as in the requirements, with these specifics from the audit:

- **6A — Design system and shell.** Amendments 1–5; `--text-3` sweep (P1-11); disabled / danger / pressed states (P1-4, P1-10, P2-7); container 1280 (P2-1); shell with active nav, role chip, notices, clock, user menu, breadcrumbs, skip link (P1-6); `not-found`, `error`, `loading` routes and an `ErrorState` primitive (P1-7, P1-8); styled larger-screen notice (P2-6); new primitives per 6A §4; `/dev/ui`.
- **6B — Core screens.** All P0-3 to P0-5 and P1-1 … P1-17 above, then `break-ui` and keyboard pass.
- **6C — New and public pages.** Landing / login / sources (P1-18 … P1-20, P2-8), operator home with first-run welcome, threat library, service record (SPEC §9.7 rules proposed in the 6C plan), notices, help, settings, status, readiness board; `mobile-native`; re-record landing media last.
- **6D — Motion.** As specified; includes the camera ease from P1-1 under the reduced-motion rule.
- **6E — Guest demo and tour.** P0-1, P0-2, tour (P0-5), instructor scope restriction first.
- **6F, 6G, 6H, 6I** — as specified, plus the tech-debt rows above.

### Proposed changes to `phase6-requirements.md` / UI-PREP (need your OK)

1. **Wire "Try the demo" in 6C, make it live in 6E.** 6C builds the landing with the button behind `NEXT_PUBLIC_GUEST_MODE`; 6E turns it on. Keeps the landing design final in one Part.
2. **Restrict instructors to their own unit in 6E** (moved from tech debt), so a guest's read-only instructor view sees only the demo units.
3. **UI-PREP vs requirements:** "printable PDF export" becomes the print stylesheet (browser Save as PDF, no dependency, as §6.3 says); UI-PREP's Settings "units km / NM" is dropped (SI everywhere, CLAUDE.md §6) unless you want it.
4. **UI-PREP's visual reference ("VYUH UI Shell" canvas)** is not in the repo. If you have it, share it before 6A; otherwise 6A works from UI-PREP's text.
5. **Two trainee-visible decisions for 6B** (listed so the 6B plan can assume them): P0-3 result recommendation wording and primary-action rule; P1-13 whether S01–S03 move to `default_v4` for new sessions (scoring change; old sessions keep `default_v1`).

**Stop.** Waiting for approval of this audit and the 6A–6I plan before Part 6A starts in a fresh session.
