# Phase 6 requirements — UX & UI upgrade, demo, deploy, final verification

> Place at `docs/plans/phase6-requirements.md`. Every Phase 6 session reads §0–§2 plus its own Part.
> Priority order for every decision in this phase: **user experience → visual quality → features → speed.** Time is not the constraint; quality is.

---

## §0. How this phase runs

- **Parts, in order:** 6.0 Audit → 6A Design system & shell → 6B Core screens UX → 6C New & public pages → 6D Motion & interaction → 6E Guest demo & guided tour → 6F Performance → 6G Deploy & offline → 6H Final verification → 6I User study & extras.
- **One fresh Claude Code session per Part, one branch per Part** (`feat/phase6-<part>` from `main`). Rebase-merge after each Part's close-out (never squash — CLAUDE.md §12).
- **Each Part:** read → plan → wait for approval → save the approved plan to `docs/plans/phase6<part>-plan.md` and commit → build in small commits → checkpoint (screenshots) → close-out → STOP.
- **Testing during UI Parts (6A–6E):** lint, unit tests, pytest, plus the Part's checkpoint captures. **The full suite runs in 6H** (and 6F/6G run their own measurements).
- **Binding documents, in priority order:** `CLAUDE.md` → `docs/DESIGN.md` (with §2 amendments below) → `docs/SPEC.md` → `docs/UI-PREP.md`. If a skill's advice conflicts with any of these, the document wins.
- **Decide routine choices yourself** and log them in `docs/decisions.md`. Stop and ask only for: anything that changes scoring, safety rules, what the trainee sees beyond the approved plan, the SPEC, a new dependency, or a checkpoint.

---

## §1. Skills — which, when, and the rules

Load a skill with the Skill tool **right before the step that uses it**, not at the start of a session.

**Rule:** a skill is a tool, not an authority. If it recommends anything DESIGN.md bans — gradients, glow, glassmorphism, scanlines, phosphor or CRT effects, low bit-depth effects, bouncy/spring/parallax motion, scroll-jacking, heavy shadows, bento card walls, emoji, marketing copy, or a new library — skip that part and note it in the plan.

| Skill | Use it for | Part | Limits |
|---|---|---|---|
| `redesign-existing-projects` | Audit every existing screen for generic / templated patterns | 6.0 | Audit only; no code in 6.0 |
| `industrial-brutalist-ui` | **Swiss Industrial Print principles only**, adapted to our dark tokens: grid discipline, macro typography, dense mono metadata, technical framing | 6A, 6C | Never the "tactical telemetry" CRT mode: no scanlines, phosphor glow or bit-depth effects |
| `high-end-visual-design` | Typographic rhythm, spacing scale, alignment, optical balance | 6A | Ignore its shadow, card and colour advice |
| `emil-design-eng` | Interaction detail: hover/pressed/focus/disabled/loading states, inputs, tables, menus, tooltips, small transitions | 6A, 6B | Durations and easing per DESIGN §7 |
| `break-ui` | Worst-case data on every data-bearing component (long names, 0 items, 500 items, huge numbers, missing fields, slow API) | 6B, 6C, re-run 6H | Fix every break or log it with a reason |
| `design-taste-frontend` | Art-direction review of landing, login, sources, guest entry | 6C | Keep our palette, fonts and copy rules |
| `mobile-native` | Public pages on phones — judges may open the link on a phone | 6C | Public pages only; the sim player shows the "use a larger screen" notice |
| `find-animation-opportunities` | Read-only list of places that should animate | 6D | Only the motion classes listed in Part 6D |
| `animate` | Build each approved animation | 6D | CSS transitions / Web Animations API only; no new library |
| `review-animations` | Critique each animation after building | 6D | — |
| `animation-performance` | Check every animation stays in the frame budget and never lowers sim FPS | 6D, 6F | transform/opacity only in the HUD |
| `improve-animations` | Final read-only motion audit | end of 6D | — |
| `full-output-enforcement` | When writing long files (complete, no placeholders) | any | — |
| `brandkit` | Optional: identity board for the pitch deck | 6I only | Never changes the product UI |

**Not used** (they conflict with DESIGN.md or the platform): `apple-design`, `gpt-taste`, `minimalist-ui`, `image-to-code`, `imagegen-frontend-web`, `imagegen-frontend-mobile`, `animate-expo`, `ask-sonner`, `pick-ui-library`, `stitch-design-taste`, `design-taste-frontend-v1`, `design-taste-frontend-v2-experimental`, `animation-vocabulary`, `prototype`.

---

## §2. Approved amendments to DESIGN.md (apply in 6A)

1. **Landing display size:** one headline per public page may use 72–96 px Plex Sans Condensed 600, uppercase, line-height 0.92, using `clamp()` so it scales down on phones. All other text stays on the §4 scale.
2. **Layout devices** added to §5: *sheet framing* (`SHEET 02 / 06`, a mono reference line, hairline rules between sections) and *telemetry strips* (thin mono metadata rows above or below key visuals).
3. **New token `--text-body` `#C3CEC8`** for long descriptions. `--text-3` (`#627069`) fails 4.5:1 for small text, so it is restricted to non-text uses (empty checkbox borders, disabled outlines, dividers).
4. **Qualification state chips:** QUALIFIED (`--ok`), IN PROGRESS (`--warn`), LOCKED (`--text-2`).
5. **Public pages are responsive down to 360 px** with no horizontal scroll. Signed-in pages keep the 1366×768 minimum; the sim player, AAR replay and builder show the polite larger-screen notice below 1280 px.

---

## §3. Part 6.0 — Audit and plan (no code)

1. Read CLAUDE.md (§14 especially: all open tech debt), DESIGN.md, UI-PREP.md, SPEC §12 Phase 6, §15–§17, §20, §22, and the latest decisions.
2. Run the app on a production build. Capture **every** screen and key state at 1366×768 and 1920×1080, and public pages at 390×844.
3. Load `redesign-existing-projects` and audit every screen: generic patterns, inconsistencies between screens, DESIGN §13 failures.
4. **Walk three journeys end to end** and time them, counting clicks and noting every hesitation or confusing moment:
   - **Judge** (SPEC §20, from the landing page with only a URL);
   - **New trainee** (first login → first completed assessment → reading the debrief → replay);
   - **Instructor** (build a scenario → assign it → read the unit dashboard → open a trainee's AAR).
5. Inventory open tech debt from CLAUDE.md §14 and assign each item to a Part.
6. Write `docs/plans/phase6-audit.md`: findings ranked **P0** (blocks or embarrasses the demo), **P1** (noticeable), **P2** (polish), each with screen, evidence and proposed fix. Include the three journey timings.
7. Propose the plan for 6A–6I with any changes to this document. **Wait.**

---

## §4. Part 6A — Design system and shared shell

1. Apply the §2 amendments to DESIGN.md, the tokens and the Tailwind theme.
2. Load `high-end-visual-design` and `industrial-brutalist-ui` (Swiss Print mode only): tighten type rhythm, spacing and grid discipline across the system. Record each change as a DESIGN.md rule, not a one-off.
3. Load `emil-design-eng` and polish every primitive in `components/ui/` and `components/hud/primitives/`:
   - all states: default, hover, pressed, focus-visible, disabled (with reason), loading, error;
   - inputs, selects, segmented controls, tabs, tables (row hover, selected, sortable headers), tooltips, menus, dialogs, empty states, labelled skeletons, `Kbd`.
4. **New primitives:** `PageHeader` (reference line, H1, context line, fact strip), `FactStrip`, `SheetFrame`, `TelemetryStrip`, `StageStrip` (01–06 kill chain, reusable in landing, home, AAR, trends), `QualificationChip`, `DemoBadge`, `ClassSilhouette` (quad, fixed-wing, loitering, bird, helicopter as inline SVG).
5. **Shared shell for every signed-in page** (UI-PREP §3):
   - top bar: wordmark → role-aware nav (Home · Training · Threat library · After-action · Service record; instructors add Unit · Builder) with a 2 px `--select` underline on the active item;
   - right side: role chip, notices count, local time, user menu (Settings, Help & controls, Sign out);
   - breadcrumbs on deep pages (AAR, builder, a trainee's trends);
   - skip-to-content link; route-level loading states; system-styled 404 and error pages that never leak stack traces.
6. Update `/dev/ui` to show every primitive and state.
7. **Checkpoint A:** `/dev/ui` plus the shell on three pages, at both sizes. Wait for OK.

---

## §5. Part 6B — Core training screens UX pass

For each screen: training list, briefing, sim player, result, AAR replay, trends, unit dashboard, assignments, scenario builder (including text-to-scenario), weight editor.

1. Start from the 6.0 audit findings for that screen; fix every P0 and P1.
2. Apply the 6A primitives and shell consistently. One primary action per screen.
3. **Screen goals:**
   - **Sim player:** a first-time trainee knows what to do next without reading the manual. Comms shows at least 8 lines at 768 px height; no truncated titles anywhere; every disabled control explains why; the AI chip and spectrogram read as aids, not answers; fix the drei `<Html>` unmount error. No FPS regression.
   - **Result:** reads as a story — score → what went well → what to fix (debrief) → suggested drill → replay links → next scenario.
   - **AAR:** the ground-truth toggle is discoverable; the timeline legend is readable; kill-chain stages, penalties and debrief mistakes all jump to the right moment.
   - **Trends and unit dashboard:** every chart has a question title and a one-line answer; Recharts fully themed to tokens; empty states; demo badges.
   - **Builder:** drawing zones and moving the asset is obvious; validation errors appear inline next to the field; the preview updates without janking.
4. Load `break-ui` and stress every table, list, chart and panel on these screens; fix each break.
5. Full keyboard flow on every screen; focus order checked.
6. **Checkpoint B:** captures of every screen at both sizes plus the `break-ui` report. Wait for OK.

---

## §6. Part 6C — New pages and public pages

### New signed-in pages (UI-PREP §2)
1. **Operator home** (post-login landing): assigned scenario with due date and one primary action; "Where am I losing points?" kill-chain bars from real data; notices; recent sessions with Replay; next training-level criteria.
2. **Threat recognition library:** one entry per class from `CLASS_PROFILES` (silhouette, size, RCS, speed, RF behaviour, ID cues, "often confused with"); filter by threat / non-threat / friendly. An info link from the track list's class and from AAR rows opens the matching entry. Values labelled representative.
3. **Service record:**
   - training levels (Basic operator → Sensor operator → Engagement controller → Instructor), each with criteria computed server-side from Assessment sessions and an instructor sign-off;
   - endorsements earned only from Assessment sessions;
   - printable record via a light print stylesheet (no new dependency).
   - Define the levels, criteria and endorsements as data in a new SPEC §9.7, labelled "representative training levels", not official qualifications. Propose the exact rules in the plan for approval.
4. **Notices:** assignments, instructor remarks (an instructor can add a remark to a session from its AAR), library updates; unread count in the top bar.
5. **Help & controls:** full shortcut reference, glossary (SPEC §21), "How scoring works" explaining the decision tree in plain words with the current weights.
6. **Settings:** reduced motion, sound on/off (if sound exists), shortcut cheat-sheet toggle.
7. **Status page:** API, database, build version, SIM_VERSION, GENERATOR_VERSION, terrain revisions, LLM enabled or not.
8. **Instructor extras:** unit readiness board (one row per trainee: level, last assessment, weakest stage, overdue assignments). A live session monitor only if it is cheap (read-only polling of ACTIVE sessions).

### Public pages
9. Load `industrial-brutalist-ui` (Swiss Print) and `design-taste-frontend`, then rework the **landing page** per UI-PREP §1 and DESIGN §11.1:
   - macro-type hero ("DETECT. IDENTIFY. DECIDE." or better) next to the real replay loop, with a telemetry strip;
   - sheet framing across sections;
   - kill-chain StageStrip with real crops;
   - realism as a ruled table with a sources column;
   - measurement with a real result/AAR capture and a DEMO DATA badge;
   - deployability facts; factual footer.
   - Re-record the hero video and crops with `record:landing` after the UI is final.
10. **Login** and **guest entry** in the same system; **Sources** page restyled.
11. Load `mobile-native`: public pages work from 360 px to 1920 px with no horizontal scroll, readable type and ≥ 44 px touch targets.
12. Run `break-ui` on the new pages.
13. **Checkpoint C:** captures of every new page at both sizes, public pages also at 390×844. Wait for OK.

---

## §7. Part 6D — Motion and interaction pass

**Allowed motion classes only:** state changes, panel and drawer open/close, tab switch, tooltip and menu appear, Comms line entry, value-change flash, radar sweep, acquisition indicator, live clock, progress. Durations 120–180 ms, ease-out per DESIGN §7. No page transitions, parallax, springs, scroll effects or animated backgrounds.

1. `find-animation-opportunities` → list candidates; drop anything outside the allowed classes.
2. `animate` → build each approved animation (CSS transitions or Web Animations API).
3. `review-animations` → critique and fix.
4. `animation-performance` → transform/opacity only in the HUD; prove sim FPS is unchanged on S06 and the worst D5 scenario.
5. Every animation respects `prefers-reduced-motion` and the Settings toggle.
6. `improve-animations` → final audit; fix or log each item.
7. **Checkpoint D:** Playwright videos of five key interactions (track selection, response order with Comms entry, tab switch, AAR scrub, result reveal) plus before/after FPS. Wait for OK.

---

## §8. Part 6E — Guest demo, guided tour, onboarding

1. **Guest mode:** `POST /auth/guest`, a guest role, scenarios tagged `demo` only, per-guest rate limits, cleanup after `GUEST_TTL_HOURS`. Guests cannot generate freely, edit trees or see real trainees' data.
2. **Judge path** from "Try the demo" on the landing page, following SPEC §20:
   - guided tour of the player → S15 in Practice → result with debrief → AAR with ground truth → trends and unit dashboard on DEMO DATA (read-only instructor view for guests) → text-to-scenario demo (one preset prompt through the real LLM path, rate-limited, with a template fallback) → Sources.
   - Measure it: first radar track within 2 minutes of opening the URL; whole path within about 5 minutes.
3. **Guided tour:** in-house, no dependency. Spotlight plus a step card, 6–8 steps per screen, keyboard-operable, skippable, resumable, reduced-motion aware, never covering the element it explains, and it pauses the sim while open.
4. **First run for real trainees:** a short welcome on operator home and a suggested S01 tutorial.
5. **Checkpoint E:** a recorded run of the full judge path with timings. Wait for OK.

---

## §9. Part 6F — Performance pass

1. Measure on a production build with the repeatable method: the full FPS set at 100 % and 150 % scaling, replay FPS (S06, S10), S06 urban, the worst generated D5.
2. **Intel run:** give me the PowerShell command; record the results when my teammate sends them. If they are not available, mark them pending in §14 and continue.
3. Fix the biggest costs without changing sim results. Include per-tick allocation reduction if Intel shows tick overruns.
4. **Web performance:** route-level code splitting (three.js only on player, AAR and briefing routes); landing JS budget ≤ 200 KB gzipped excluding video; fonts preloaded; images sized; long-cache headers on terrain presets.
5. **Budgets:** ≥ 30 fps on Intel UHD 620 class at 1080p, ≥ 60 on a mid GPU, sim tick ≤ 2 ms, landing LCP < 2.5 s on a "Slow 4G" profile.
6. Before/after table for everything.

---

## §10. Part 6G — Deployment and offline build

1. **Supabase:** tell me exactly what to create and click, and which env values to send back. Switch to `AUTH_MODE=supabase` for the hosted build; keep `local` for offline.
2. **Vercel** (project root `apps/web`) and **Render** (API Dockerfile): env checklist, migrations, `pnpm seed` in production, demo data, guest mode on, LLM on with rate limits and a spend cap.
3. **Cold starts:** document the options (paid always-on during judging vs a scheduled warm-up ping) and recommend one.
4. **Security pass:**
   - RBAC tests across every route, including guest isolation;
   - no secrets in the client bundle (search the build output);
   - CORS locked to the web origin; request size limits; rate limits on generate, from-text and debrief;
   - security headers (CSP, frame-ancestors, HSTS) on Vercel;
   - text-to-scenario output clamped and validated (prompt-injection safe);
   - error responses leak no internals.
5. **Offline build:** `docker compose up` brings up Postgres + API + web with `AUTH_MODE=local`, `LLM_ENABLED=false` and all presets bundled; one command; README section. Prove it on a machine with the network disabled.
6. **Checkpoint G:** the hosted URL working end to end, plus offline-run evidence. Wait for OK.

---

## §11. Part 6H — Final verification (everything)

Run all of it on the final code and record evidence:

1. `pnpm lint`, all unit tests, pytest (API + terrain), `pnpm gen:schemas` no diff, production build.
2. Full `pnpm e2e`: visual baselines (regenerate deliberately where the UI changed and review every diff), a11y spec, colour-blind captures, keyboard-only run.
3. Generator sweeps (CI size and local, 0 failures), library drift check, replay equivalence on all library scenarios plus a generated D5, determinism tests.
4. Full FPS set at 100 % and 150 %, replay FPS, Intel numbers (or marked pending).
5. `break-ui` re-run on every data component.
6. **Against the deployed URL:**
   - the SPEC §20 judge path as an automated e2e test with timings;
   - the guest flow;
   - instructor assigns a scenario → 3 trainees play it → the unit dashboard shows comparison and weakest stage (SPEC §12 Phase 4 criterion);
   - real-LLM debrief and text-to-scenario, and the LLM-off fallback.
7. Offline build smoke test.
8. Cross-browser: Chrome, Edge, Firefox (WebGL); note Safari status.
9. Public pages at 360, 390, 768, 1024, 1366 and 1920 px.
10. The §10 security checks re-run.
11. DESIGN §13 checklist for every screen, with captures at both sizes.
12. SPEC §12 Phase 6 done-criteria with evidence, plus a quick re-confirmation of Phases 0–5.
13. Write `docs/RELEASE-CHECKLIST.md` (what was verified, how, results) and `docs/DEMO-SCRIPT.md` (the judge path step by step, talking points per screen, and a fallback plan: the offline build on a laptop plus a recorded video if the network fails).
14. Update CLAUDE.md §14 to its final state.

---

## §12. Part 6I — User study kit and optional extras

1. **User study (real data, never demo):**
   - a "study mode" that assigns a fixed sequence (e.g. S01 → S15 → S04 in Assessment, three rounds with different seeds);
   - participant codes only, no names or PII;
   - a CSV export of anonymised scores and kill-chain stage results;
   - a results chart page clearly labelled "User study — real participants (n = …)", separate from demo data.
2. **Optional, only if everything above is done:** WebXR view of the tactical scene with a simplified HUD.
3. **Optional:** `brandkit` identity board for the pitch deck (never changes the product UI).

---

## §13. Done-criteria for Phase 6

- A judge with only the URL understands the product and reaches a first radar track in under 2 minutes, and completes the SPEC §20 path in about 5 minutes.
- Every screen passes DESIGN §13 at both sizes; public pages work on phones.
- The hosted build and the offline build both work end to end.
- All tests pass; performance budgets met (Intel numbers recorded or explicitly pending).
- `RELEASE-CHECKLIST.md` and `DEMO-SCRIPT.md` exist and are accurate.
