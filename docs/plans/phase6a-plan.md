# Phase 6A — Design system and shared shell (approved plan)

> Part 6A of `docs/plans/phase6-requirements.md` §4. Approved by the user 2026-10-24, with one change: visual baselines are regenerated at the end of each Part (see "Baselines"). Branch `feat/phase6-a` from `main`.

## Starting point

The root layout caps signed-in pages at `max-w-6xl`; the header is flat (11 px links, the user's name as text, a ghost "Log out"). Primitives have no pressed state and use `opacity-40` for disabled; `--text-3` carries text in ~96 places; there are no `not-found` / `error` / `loading` routes; tabs and segmented controls are hand-built in five places; only the player has the larger-screen notice. The only Radix package is `react-slot`, so menus and dialogs are in-house.

## 1. DESIGN.md amendments, tokens, theme

- Amendments 1–5 (requirements §2): `text-display-xl` (`clamp(44px, 9vw, 96px)`, line-height 0.92, landing only); sheet framing and telemetry strips in §5; `--text-body` `#C3CEC8` and `--text-3` restricted to non-text; qualification chips; public pages responsive to 360 px, larger-screen notice on the player, AAR replay and builder below 1280 px.
- Rhythm and grid rules from `high-end-visual-design` / `industrial-brutalist-ui` (Swiss Print only), written as DESIGN rules: page sections 24 px apart, panels 16 px, panel body 12 px; `text-wrap: balance` on headings; body measure ≤ 72 ch; page container 1280 px, left-aligned 12-column grid (P2-1); units next to values in `--text-2` (DESIGN §8 updated).
- `--text-3` sweep (P1-11): text uses move to `--text-2` (or `--text-body` for long descriptions); placeholders `--text-2`; canvas colours in `scene-colours.ts` checked.

## 2. Primitive states (DESIGN §7 timings)

- **Button:** disabled without opacity (P1-10) — `--bg-1` surface, `--line-1` border, `--text-2` label; danger disabled looks like any disabled control (P1-4); 1 px pressed offset (P2-7); `loading` prop (`aria-busy`, caller's label, no spinner).
- **Fields:** same disabled treatment; inline `FieldError` linked by `aria-describedby`.
- **New in-house primitives:** `Tabs` (ARIA tablist, arrow keys), `SegmentedControl` (radiogroup), `Table` with row hover, selected-row `--select` edge and `SortHeader` (`aria-sort`), `Menu` (button + list, arrows, Esc, outside click, focus return), `Dialog` (native `<dialog>`), `EmptyState` / `ErrorState` (not-found neutral, not `--crit`), labelled skeleton rows; `Kbd` on a size token.
- **API error copy (P1-8):** one code → plain-copy map in `lib/strings`, used by `ErrorState`; per-screen use in 6B.

## 3. New primitives (requirements §4.4)

`PageHeader` (reference line, H1, context line, optional fact strip), `FactStrip`, `SheetFrame` (`SHEET 02 / 06`), `TelemetryStrip`, `StageStrip` (kill chain 01–06, optional value / state per stage), `QualificationChip`, `DemoBadge` (moved into primitives), `ClassSilhouette` (inline SVG, all 10 classes in 5 families: quad, fixed-wing, loitering, bird, helicopter; `currentColor`), `Breadcrumbs`, shared `LargerScreenNotice` with wordmark and "Back to training" (P2-6).

## 4. Shared shell (signed-in pages)

- Top bar: wordmark → role-aware nav, 2 px `--select` underline on the active item (pure `navFor(role)` / `isActive(path)`, unit-tested); right side: role chip, local time (Plex Mono, 30 s tick), user menu.
- Home, Threat library, Service record, Notices, Settings and Help pages arrive in 6C: the nav config carries them hidden until their routes exist (no placeholders, DESIGN §2). Until 6C: Training · After-action (trends); instructors add Unit · Builder. User menu: Help & controls (shortcut reference), Scoring weights (staff), Sign out.
- From text sits under Builder as a `Tabs` strip ("Form · From text"); Builder stays active on both. Scoring weights linked from the Unit page header and the staff user menu.
- Breadcrumbs on the AAR session, builder pages and a trainee's trends opened from Unit.
- Skip-to-content link; `app/not-found.tsx`, `app/error.tsx`, `app/global-error.tsx` (system-styled, no stack traces, P1-7); route `loading.tsx` for signed-in groups; `og:` / Twitter meta in the root layout (P2-7).
- The player keeps its fixed full-viewport grid. Public pages keep their header until 6C.

## 5. `/dev/ui` and Checkpoint A

- Gallery regrouped by section: every primitive and new primitive in default, hover, pressed, focus, disabled-with-reason, loading and error; the shell in each role state.
- `checkpoint-6a.spec.ts` (`@checkpoint`): `/dev/ui`, the shell on `/train`, `/aar/trends`, `/instructor`, and the 404, at 1366×768 and 1920×1080.

## Tests

vitest: `navFor` / `isActive` per role (Builder active on `/instructor/text`), API error map, `Tabs` / `SegmentedControl` / `Menu` keyboard behaviour. `capture-all` spec signs out through the user menu. `pnpm lint`, `pnpm test`, pytest before each commit (no API change).

## Baselines (user change, 2026-10-24)

After the user approves Checkpoint A, regenerate the visual baselines for the screens 6A changed, review the diffs, and commit them, so `pnpm e2e` passes at the Part boundary. Rule added to requirements §0 for every Part; 6H still does the final full regeneration.

## Risks

The `--text-3` sweep touches ~50 files (one class each). The larger-screen notice on AAR replay and builder below 1280 px changes what users see there (approved by amendment 5).

**New dependencies:** none. **Skill advice skipped:** shadows, cards and colour from `high-end-visual-design`; any CRT / telemetry glow mode from `industrial-brutalist-ui`.
