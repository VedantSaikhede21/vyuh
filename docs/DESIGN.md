# VYUH — UX & Visual Design Guide

> Place at `docs/DESIGN.md`. Read this before **any** UI work. It is as binding as the SPEC: if a screen breaks a rule here, it is not done.
> Goal: a trainer that an Army officer instantly reads as a **serious mission system**, and that a first-time user can operate without help. Not a sci-fi game, not a SaaS dashboard, not a template.

---

## 1. Design intent

**One sentence:** *A calm, dense, precise tactical console where colour means something, every number has a unit, and every action gets an immediate answer.*

**Character words:** operational · precise · calm under load · credible · legible · fast.
**Not:** futuristic · glowing · playful · marketing · decorative.

**Reference mood (in spirit, never copied):** real air-defence / C2 operator displays, avionics multifunction displays, maritime radar consoles, NATO APP-6 symbology, printed military maps and briefing sheets. Study how they use monochrome chrome, a few signal colours, hairline borders, uppercase labels and dense tabular data.

**Who we design for:**
1. **Trainee** under time pressure — needs instant recognition of what changed, what's dangerous, what to do next.
2. **Instructor** — needs clear comparison, trends and the "why" behind scores.
3. **Judge with only a URL** — must understand the product in under 2 minutes and feel it is real, not a mock-up.

---

## 2. "AI slop" — banned patterns

If any of these appear, remove them.

| Banned | Do instead |
|---|---|
| Purple/blue/pink gradients, gradient text, "aurora" blobs | Flat surfaces; colour only for information |
| Glassmorphism, frosted blur panels, heavy backdrop-filter | Opaque panels with 1 px hairline borders |
| Neon glow / box-shadow glow on everything | No glow. The only allowed "glow" is the radar sweep trail |
| `rounded-2xl` cards with soft drop shadows everywhere | Radius 2 px (max 4 px), no shadows except floating overlays |
| Generic hero: big centred headline + subtitle + two buttons + gradient | A real live/replayed sim view as the hero, with a plain statement |
| 3-column "feature cards" with an icon each | Show the real product: annotated screenshots, the kill chain strip |
| Marketing copy ("Revolutionize", "Seamless", "Unlock", "AI-powered" in every line) | Plain, specific, military-brevity copy |
| Emoji as icons | Lucide icons (16 px, stroke 1.5) and our APP-6 symbols |
| Fake stats, fake testimonials, fake logos | Only real numbers (labelled demo data where applicable) |
| Everything centred | Left-aligned, grid-based, scannable |
| Pure `#000` background with pure `#FFF` text | Tinted near-black layers and off-white text (tokens below) |
| Random accent colours per section | One accent system, defined below |
| Decorative charts with no insight | Every chart answers one stated question |
| Spinners with no context | Labelled progress ("LOADING TERRAIN · 42%") |
| Default shadcn look left unstyled | shadcn components restyled to our tokens |
| Bouncy / springy / parallax animations | 120–180 ms ease-out state transitions only |
| Lorem ipsum, "Coming soon" placeholders left in | Real copy or the screen is hidden |

---

## 3. Colour system

**Principle: colour is information.** The interface chrome is monochrome. Colour is reserved for affiliation, status and the one interaction accent. If removing a colour doesn't remove information, the colour shouldn't be there.

### 3.1 Surfaces & text (dark default)
| Token | Hex | Use |
|---|---|---|
| `--bg-0` | `#0A0D0C` | App background, 3D clear colour edges |
| `--bg-1` | `#101513` | Panels |
| `--bg-2` | `#161D1A` | Raised: panel headers, table header, hovered rows |
| `--bg-3` | `#1E2723` | Inputs, pressed, selected rows |
| `--line-1` | `#26312C` | Hairline borders, dividers |
| `--line-2` | `#34423B` | Strong borders, focus-adjacent |
| `--text-1` | `#DCE4DF` | Primary text, readouts |
| `--text-2` | `#9AA9A1` | Secondary text, labels |
| `--text-3` | `#627069` | Muted: units, hints, disabled |

### 3.2 Interaction
| Token | Hex | Use |
|---|---|---|
| `--select` | `#F2F5F3` | Selected track brackets, selected row edge, focus ring (2 px) |
| `--cue` | `#D46BC8` | **Avionics magenta**: active cue/route only — EO cue box, lock line, active waypoint. Never for decoration or buttons. |
| `--primary-bg` / `--primary-fg` | `#E7E2D3` / `#0A0D0C` | Primary button (bone on near-black) |

### 3.3 Affiliation (APP-6 inspired; always paired with shape + letter)
| Token | Hex | Meaning |
|---|---|---|
| `--aff-hostile` | `#FF6B6B` | Hostile (diamond, "H") |
| `--aff-friendly` | `#5CC8FF` | Friendly (circle, "F") |
| `--aff-neutral` | `#6FD08C` | Neutral (square, "N") |
| `--aff-unknown` | `#F2D45C` | Unknown (quatrefoil, "U") |

### 3.4 Status
| Token | Hex | Use |
|---|---|---|
| `--ok` | `#6FD08C` | Success outcomes (reuse neutral green deliberately sparse) |
| `--warn` | `#F0A94B` | Cooldown, degraded sensor, approaching limit |
| `--crit` | `#FF5A5F` | Leak imminent, fratricide, errors |
| `--info` | `#9AA9A1` | Neutral system messages |

Rules:
- No hex values in components — only tokens (CSS variables mapped into Tailwind).
- Affiliation colours are never used for UI chrome, buttons or headings.
- `--crit` appears only when something genuinely critical happens, so it keeps its meaning.
- Test every screen in a colour-blind simulator (deuteranopia, protanopia): affiliation must still be readable via shape + letter.
- A light theme is out of scope; the print/briefing PDF export (later) uses a separate light print stylesheet.

---

## 4. Typography

**One family, three cuts — IBM Plex** (Google Fonts via `next/font`, self-hosted so the offline build works):
- **IBM Plex Sans Condensed** — HUD labels, panel titles, table headers, buttons. Uppercase, letter-spacing 0.06em.
- **IBM Plex Sans** — body text, briefings, debriefs, descriptions.
- **IBM Plex Mono** — every number, time, bearing, range, id, coordinate. Always tabular figures.

### Scale (px / line-height)
| Role | Size | Font | Notes |
|---|---|---|---|
| Display (landing only) | 40 / 44 | Plex Sans Condensed 600 | Max once per page |
| H1 | 24 / 30 | Plex Sans Condensed 600 | Page title |
| H2 | 18 / 24 | Plex Sans Condensed 600 | Section |
| Panel title | 12 / 16 | Plex Sans Condensed 600, UPPER | Panel header strip |
| Label | 11 / 14 | Plex Sans Condensed 500, UPPER, `--text-2` | Field / readout labels |
| Body | 14 / 21 | Plex Sans 400 | Default |
| Small | 12 / 17 | Plex Sans 400 | Hints, captions |
| Readout | 14 / 18 | Plex Mono 500 | HUD values |
| Readout large | 20 / 24 | Plex Mono 500 | Clock, score total |

Rules: maximum two weights per screen besides labels; no font sizes outside the scale; minimum 11 px for labels and 12 px for anything else in the HUD.

---

## 5. Layout, spacing, shape

- **4 px base grid.** Spacing tokens: 4, 8, 12, 16, 24, 32, 48.
- **Radius:** 2 px default, 4 px for overlays. Never pill-shaped except state chips (fully rounded allowed only for chips ≤ 20 px tall).
- **Borders:** 1 px `--line-1`; panels separated by borders, not gaps-with-shadows.
- **Shadows:** none, except floating overlays (menus, modals): `0 8px 24px rgba(0,0,0,0.5)`.
- **Density:** compact by default. Table rows 32 px; HUD controls 28–32 px tall; primary actions ≥ 36 px.
- **Grid:** 12 columns on marketing/admin pages (max width 1280 px, left-aligned content); the sim player is a fixed full-viewport grid (SPEC §15).
- **Minimum viewport:** 1366×768 with no horizontal scroll and no hidden critical controls. Below 1280 px width show a polite "use a larger screen" notice on the sim player (this is a desktop trainer).

### Panel anatomy (the core building block)
```
┌─ PANEL TITLE ──────────────── status chip · actions ┐   ← 28 px header, --bg-2, Condensed UPPER 12 px
│ content                                              │   ← --bg-1, 12 px padding
└──────────────────────────────────────────────────────┘   ← 1 px --line-1
```

---

## 6. Iconography & symbology

- **Lucide** icons only, 16 px, stroke 1.5, `currentColor`. Max one icon per control; text label wins over icon-only unless it's a universal symbol (close, play, pause) and has a tooltip.
- **APP-6-style symbols** are our own SVG components (`<AffiliationSymbol affiliation="HOSTILE" size={16} />`): frame shape by affiliation, letter inside, colour token. Same component in track list, PPI, 3D markers, AAR and briefing map.
- Track markers in 3D/PPI: symbol + track id (`T004`); selected track gets `--select` corner brackets.

---

## 7. Motion

- Durations 120–180 ms, `cubic-bezier(0.2, 0, 0, 1)` (ease-out). Only for: state change, panel open/close, value change highlight.
- **Value-change flash:** a readout that changes meaningfully flashes `--bg-3` for 300 ms (no colour change).
- **Continuous animation allowed only for:** radar sweep, acquisition indicator, the live clock.
- `prefers-reduced-motion`: disable flashes and sweep trails; keep functionality.
- No page-transition animations, no parallax, no animated backgrounds, no typing effects.

---

## 8. Copy & voice

- **Military brevity:** short, imperative, specific. "Mark detected", "Jam T004", "Out of range — 1.8 km > 1.5 km".
- **Correct terms, consistently:** *contact* (truth, never shown to trainee), *track* (what sensors report), *bearing*, *range*, *ROE*, *asset*, *effector*, *kill chain*. Never mix "target/enemy/object".
- **HUD labels UPPERCASE; body text sentence case.** No Title Case For Everything.
- **Numbers always with units**, units in `--text-3`: `1.82 km`, `045°`, `12 m/s`, `00:48`. Bearings 3-digit with degree sign. Time `mm:ss` in sessions, ISO date + local time elsewhere.
- **No exclamation marks**, no "Oops!", no emoji, no jokes in the trainee flow.
- Errors explain cause and next step: "Cannot intercept — ROE: no kinetic response over the village (zone Z2)."
- Landing page copy states the problem and what the product does, plainly. Every claim is something the demo actually shows.

---

## 9. Feedback & states (every screen, every component)

- **Every trainee action gets visible acknowledgement within 100 ms:** control state changes + a line in the **Comms log** panel (`00:48  JAM ORDERED  T004  sector 312°±10°`). Outcomes follow as their own lines (`00:49  T004 LINK LOST — RTH`).
- **Disabled controls explain why** in a tooltip (cooldown remaining, out of range, ROE, no ammo).
- **Loading:** skeleton panels with labelled progress ("LOADING TERRAIN · JK_MOUNTAIN · 42%"). Never a bare spinner.
- **Empty states:** say what will appear and how to get there ("No sessions yet — run a scenario from Training").
- **Errors:** plain reason + retry; never raw stack traces. Network loss during a session: non-blocking banner "Connection lost — events queued (14)". 
- **Confirmation** only for irreversible/high-cost actions (intercept, abandon session, delete). Use an inline confirm (button → "Confirm intercept · Enter") rather than a modal in the HUD.
- **Toasts** are not used in the sim player (the Comms log replaces them). Elsewhere: max one at a time, bottom-left, auto-dismiss 4 s.

---

## 10. Accessibility

- Text contrast ≥ 4.5:1, UI component contrast ≥ 3:1 against its surface.
- Affiliation always shape + letter + colour.
- Full keyboard operation of every core action (SPEC §15.1); visible 2 px `--select` focus ring; `?` opens the shortcut sheet.
- Tooltips show the shortcut (`Jam · J`).
- Hit targets ≥ 28 px in the dense HUD, ≥ 36 px elsewhere.
- Sounds (if added) are optional, mutable, and always paired with a visual cue.
- All strings in one i18n-ready file per app area (Hindi later).

---

## 11. Screen-by-screen guidance

### 11.1 Landing (public)
1. **Hero:** a real sim view (live canvas in demo mode or a short looped capture of a replay) on real terrain with tracks, PPI and EO inset visible. Left-aligned statement: what it is in one line ("Counter-drone decision training on real terrain, in a browser."), one sub-line naming PS 26247 / MoD, primary button "Try the demo", secondary "How scoring works".
2. **The kill chain strip:** DETECT → TRACK → IDENTIFY → DECIDE → RESPOND → ASSESS, each with one real screenshot crop and one line.
3. **Realism:** terrain, night/IR, silent links, false contacts, ROE — each as an annotated screenshot with the source cited.
4. **Measurement:** a real AAR screenshot (demo data labelled) and the scoring tree explained in 3 lines.
5. **Deployability:** browser, integrated graphics, offline build, cost — as plain facts.
6. **Footer:** team, PS reference, sources link. No newsletter, no fake logos.

### 11.2 Login
Minimal, left-aligned form on a muted terrain hillshade background (static image, darkened). Product name, one line, form, "Try the demo instead".

### 11.3 Scenario select / Training
- Table-first, not a card wall: rows with terrain thumbnail (hillshade 64×40), name, difficulty (5 pips), time of day (computed day/dusk/night icon), conditions, tags, duration, your best score, assigned badge.
- Filters: difficulty, terrain, day/night, tags, assigned. Sort by difficulty/name/best.
- Selecting a row opens the **briefing** (not a modal — a page).
- "Generate scenario" panel: terrain, time, weather, difficulty, seed (with "random" button) → preview briefing.

### 11.4 Briefing (pre-mission)
Two-column: left = 2D map (hillshade from heightmap, zones, assets, sensor sites with LOS coverage shading, expected threat axis only if the briefing intel says so, north arrow, scale bar); right = mission card (situation, mission, ROE in a bordered callout, assets, sensors & effectors with ranges/ammo, environment: time, sun elevation, visibility, wind), mode toggle (Practice / Assessment), "Controls" quick reference, primary button "Begin" (Enter). Must fit 1366×768 without scrolling the map.

### 11.5 Sim player
Follow SPEC §15 layout. Specific rules:
- Top bar: clock (mm:ss, large readout), ROE state chip, mode chip, threat-count summary by affiliation symbol, connection/queue indicator, pause (practice only).
- The 3D tactical view is the canvas; HUD panels sit on a grid around it, never floating randomly.
- Track list is the primary control surface: symbol, id, class (or `—`), range, bearing, altitude band, RF badge, state; keyboard focus follows selection.
- EO/IR view: state chip MAN / CUE / ACQ / TRK, zoom readout, mode DAY/IR, reticle; cue box in `--cue`; off-screen arrow.
- Action bar: grouped as *Identify* (mark, classify, affiliation) · *Respond* (monitor, jam, spoof, intercept) · *Report*. Each button shows shortcut, cooldown ring, ammo count; disabled reason on hover.
- Comms log: last ~8 lines, timestamped, newest at bottom, colour only for outcome status.
- Alerts: leak imminent / friendly in jam sector → a single banner line in the top bar with `--crit`/`--warn`, never a modal.

### 11.6 Result screen
Score total (large readout) and the five components as horizontal bars with numbers; penalties as a timestamped list; per-contact kill-chain row (what you did vs what was there); recommended next difficulty; buttons: "Replay (AAR)", "Retry same seed", "Next scenario".

### 11.7 AAR, trends, instructor (Phase 4)
Same panel system. Every chart has a title phrased as a question ("Is detection getting faster?") and a one-line answer under it.

---

## 12. Implementation rules

- Tokens live in `apps/web/app/globals.css` as CSS variables and are mapped in the Tailwind theme (`bg-bg-1`, `text-text-2`, `border-line-1`, `text-aff-hostile`…). No raw hex or arbitrary Tailwind colour values in components.
- shadcn/ui components are restyled once in `components/ui/` (radius, colours, sizes, focus ring). Feature code uses those, never raw Radix with ad-hoc styles.
- Shared HUD primitives in `components/hud/primitives/`: `Panel`, `PanelHeader`, `Readout` (value + unit + label), `StateChip`, `Kbd`, `AffiliationSymbol`, `CooldownRing`, `CommsLog`, `Pips`, `Banner`.
- A dev-only **design gallery** route `/dev/ui` renders every primitive and state (default, hover, focus, disabled, loading, error). It is excluded from production builds.
- Fonts via `next/font` (self-hosted). Icons via `lucide-react` only.
- Visual changes are verified with Playwright screenshots at **1366×768** and **1920×1080** for each changed screen, saved under `apps/web/e2e/__screenshots__/` and attached (described) in the task summary.

---

## 13. UI review checklist (run before any UI task is "done")

- [ ] No banned pattern from §2.
- [ ] Only tokens; no raw hex; colour carries information.
- [ ] Type sizes from the scale; numbers in Plex Mono with units.
- [ ] Every action acknowledged within 100 ms; disabled controls explain why.
- [ ] Loading, empty and error states exist and are worded per §8–§9.
- [ ] Keyboard-operable, visible focus, tooltips show shortcuts.
- [ ] Affiliation readable in a colour-blind simulator.
- [ ] Fits 1366×768 without horizontal scroll or hidden critical controls.
- [ ] Copy uses the vocabulary in §8; no marketing language.
- [ ] Screenshots at 1366×768 and 1920×1080 reviewed and described.
- [ ] FPS budget still met if the sim player was touched (SPEC §16).
