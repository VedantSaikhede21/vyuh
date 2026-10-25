# Phase 6D plan — motion and interaction pass

> Approved by the user 2026-10-26 ("start"). Requirements: `docs/plans/phase6-requirements.md` §7. Rules: DESIGN §7 — 120–180 ms, `cubic-bezier(0.2, 0, 0, 1)` (`ease-ui`), transform/opacity only in the HUD, reduced motion (system or `<html data-motion="reduce">`) honoured everywhere. No new dependency.

## Survey (find-animation-opportunities)

Already right: colour transitions (150 ms `ease-ui`) on buttons, tabs, segmented controls, tables, menus; kill-chain chevron rotation; Recharts animation off; 3D camera ease (300 ms, jumps under reduced motion); global reduced-motion override.

Gaps: value flash animates `background-color`; Comms lines, tooltips, menus, dialogs, tab panels and the result screen appear with no bridge; the progress bar jumps; the radar sweep trail still draws under reduced motion (DESIGN §7 breach).

## Items

| # | Where | Change |
|---|---|---|
| D1 | `components/hud/primitives/readout.tsx` | Value flash as an `::after` overlay fading opacity 1→0, 300 ms (same look, compositor only) |
| D2 | `components/hud/primitives/comms-log.tsx` | New line enters 150 ms from opacity 0.3, `translateY(3px)` (readable on frame 1, 100 ms ack rule); lines present at first render do not animate |
| D3 | `components/ui/menu.tsx` | Open 150 ms opacity + scale 0.97→1, origin at the button corner; close instant |
| D4 | `components/ui/tooltip.tsx` | 120 ms opacity fade only after the hover delay; instant when warm |
| D5 | `components/ui/dialog.tsx` | Open 180 ms opacity + scale 0.97 (centred), backdrop fade, `@starting-style`; close instant |
| D6 | `components/ui/tabs.tsx` `TabPanel` | Panel fades in 120 ms on tab change (opacity only, HUD sensor tabs included); not on first mount |
| D7 | `components/aar/kill-chain.tsx` | Opened stage content fades in 150 ms; no height animation |
| D8 | `components/hud/radar-scope.tsx` | Reduced motion: trail → 1 px sweep line (sweep keeps turning — it is functional); setting read via hook, not per frame |
| D9 | `components/hud/primitives/state-chip.tsx` | ACQ pulse as an own opacity keyframe, off under the system setting and the Settings toggle |
| D10 | `components/hud/primitives/skeleton.tsx` | Determinate bar fills via `scaleX`, 150 ms |
| D11 | `components/sim/result-screen.tsx` | Result fades in once as one block, 180 ms; no stagger, no count-up |
| D12 | `lib/sim/framing.ts` | Review only: keep the 300 ms camera ease (a camera move, not a UI state change); decision 159 |

Rejected (stay instant): track-row selection (keyboard, high frequency); classify menu, report form, `?` overlay (keyboard-opened HUD); AAR scrub smoothing (data being read); panel height animation (layout cost).

## Steps

1. Build D1–D11 in small commits (`animate`).
2. `review-animations` → fix.
3. `animation-performance` on the HUD; before/after FPS on a production build: S06 and URBAN D5 seed 2, 1920×1080 and 1366×768.
4. `improve-animations` final audit → fix or log.
5. Unit tests: reduced-motion sweep choice; existing Comms lines do not animate.
6. Checkpoint D: `checkpoint-6d.spec.ts` Playwright videos — track selection, response with Comms entry, tab switch, AAR scrub, result reveal — plus the FPS table. Stop for OK.

## Risks

Smart App Control may block Next's SWC again (Docker API / `next dev --webpack` workaround, `docs/plans/phase6c-progress.md`). Baselines should not move: Playwright screenshots use `animations: 'disabled'` — confirm.
