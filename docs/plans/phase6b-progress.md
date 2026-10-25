# Phase 6B — progress and handoff

> Working notes for resuming Part 6B. Plan: `docs/plans/phase6b-plan.md` (approved 2026-10-25). Branch: **`feat/phase6-a`** (user: one branch for all of Phase 6, merged at the end — do not open `feat/phase6-b`). Last updated 2026-10-25, end of session.

## Done (committed)

| Commit | What |
|---|---|
| `973d82e` | Approved 6B plan; 6G security checklist line for the `X-Vyuh-Test-Debrief` header |
| `b67b9e1` | **P0-4 one rounding rule** (decision 149): `apps/api/app/services/display.py` (half up on the written decimal); `Score.display` + `Score.recommendationRating` on read; trend / unit / recent totals and component percentages sent as display integers; debrief summary and LLM payload use the same value; web uses `lib/score-display.ts`; SPEC note; `tests/test_display.py`; golden tests ignore the new derived fields |
| `502c009` | **P0-3 result screen**: "Recommended from your rating (n)", Practice "runs never move your rating", primary action by score (`lib/result-actions.ts`: < 50 Retry + pointer to the debrief drill, 80+ Next, else none) |
| `6b52d33` | **P0-5 Practice next step** in the action-bar header (`lib/hud/next-step.ts`, `lib/hud/use-next-step.ts`; never uses EO_IDENTIFIABLE, which names the contact) |

Checks at `6b52d33`: web vitest and typecheck / lint clean; full API pytest green after P0-4.

## P0-6 done

3D view frames the selected track; DOM track labels (decision 150). FPS regression fixed by caching label sizes (ResizeObserver): same-machine A/B S06 53 → 55, URBAN D5 46 → 46 fps.

Measure (production build; start the API and `next start` first, see below):
```
cd apps/web
FPS_SELECT=1 FPS_MODES=fixed E2E_BASE_URL=http://localhost:3000 E2E_SKIP_DEMO_RESET=1   npx playwright test e2e/fps.spec.ts --grep "(S06|URBAN D5 seed 2).*1920×1080 ×1 fixed"
```
Production stack: `cd apps/web && pnpm build`, then `npx next start --port 3000`; API `cd apps/api && uv run uvicorn app.main:create_app --factory --port 8000` (no `--reload`). Stop by port: `netstat -ano | grep ":3000 "` → `taskkill //PID <pid> //F //T`.

## Player P1s (2026-10-25, second session)

- **P1-5** AI chip: action-bar chip "AI · LARGE BIRD · 79%" (truncates; "SUGGESTS" stays in the 3D label and tooltip), decided state "AI LARGE BIRD · ACCEPTED"; `CLASS_CODE` no longer used by the chip.
- **P1-2** Comms: one line per entry (ellipsis, full text in `title`), 18 px rhythm; PPI `calc(100vh-536px)` → 8 lines at 768 (captured), 1080 unchanged (PPI capped at 318 px).
- **P1-3** EO day sky: drei `<Sky>` removed — the EO view's sky is the haze / fog colour (grey-blue), which a 17° vertical camera at the horizon really sees; EO render target is half float (the 8-bit target clipped HDR before the filmic curve). `showSky` / `turbidity` dropped from `environmentLook`; test asserts a grey-blue, non-white day sky. Rayleigh 3 was tried first and made it whiter. The landing "Identify" crop is re-recorded in 6C.
- **P2-5** `?` sheet holds the Practice clock (`SimRuntime.setOverlayHold`, separate from the trainee's pause; never in Assessment; test in `runtime.test.ts`); the sheet says "Practice clock held while this list is open."
- Captures reviewed: `player-eo-cued`, `player-later`, `player-shortcuts` at 1366 and 1920 (S15 practice, `capture-all.spec.ts`, scratchpad output).

Committed as `30272fa` (typecheck, lint, 24 files / 200 web tests green).

## Result screen (2026-10-25, decision 151)

- Story order: header (Back · Replay · Retry · Next, primary by score) → Score full width (total, recommendation, rating | component bars) → debrief → penalties (only when there are any) → per contact.
- `scaleNote()` in `lib/result-actions.ts` (tests in `test/phase6b.test.ts`): "Components 50.0 of 80 points, scaled to 100, then −15 penalties and bonuses." under the bars, with the "tree does not score …" line.
- No penalties → one line "No penalties or bonuses." in the score panel (P2-4).
- Template debrief (`app/services/ai/debrief.py`): stages missed at one moment for one contact → one "T006 STOPPED AT DETECT: …" line; one penalty code repeated → one line at the first time, "… Also T002, T003." (P1-12). Test `test_template_groups_a_stopped_chain_and_repeated_penalties`.
- Staff-only `POST /aar/sessions/{id}/debrief/regenerate` (SPEC §11 row) + "Regenerate debrief" button beside the TEMPLATE chip when the fallback reason is INVALID_OUTPUT. RBAC + behaviour in `test_llm_debrief_validated_and_cached`.
- Captured `result` / `result-full` at 1366 and 1920 (S15 practice, `capture-all.spec.ts`) and reviewed.
- Checks: web 24 files / 203 tests, `pnpm lint` clean, `test_debrief.py` / `test_ai_trust.py` / `test_aar.py` green, ruff clean. Full API pytest not run for this step.

## Still to do in 6B (from the plan, in order)

2. Player: aids labelling (AI chip and spectrogram say they are aids); disabled reasons and title hovers checked in the break-ui pass.
4. AAR (P1-14), trends (P1-15), unit dashboard + assignments (P1-16, P2-9), builder (P1-17 + legend), briefing labels (P2-3) + S01–S03 thumbnails + Generate secondary (P2-2), weight editor / From text copy (P1-9) and "/10" wording.
5. Apply 6A primitives everywhere (Tabs, SegmentedControl, Table, PageHeader, ErrorState); one primary action per screen; keyboard focus order.
6. Load `emil-design-eng` before the polish, `break-ui` before stress-testing; write the break-ui report.
7. Checkpoint B: `checkpoint-6b.spec.ts` captures of every 6B screen at 1366×768 and 1920×1080 + break-ui report + FPS before / after → **stop for the user's OK**.
8. After OK: regenerate + review + commit visual baselines; full `pnpm e2e`; lint, `pnpm test`, pytest, `gen:schemas` no diff; CLAUDE.md §14; decisions.

## Notes

- Decisions so far in 6B: 149 (rounding), 150 (framing + DOM labels), 151 (result screen + template grouping + regenerate). Next free number: 152.
- `pnpm e2e` now resets the @demo accounts and forces the template debrief (decision 148).
- The auto-mode classifier blocked running `pnpm seed:reset-demo --yes` directly once; the e2e global setup runs it fine.
- Player screenshots / probes need the e2e step hook, which exists only on the dev server; production probes run in real time.
