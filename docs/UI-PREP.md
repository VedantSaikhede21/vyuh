# VYUH — UI clean-up & shell brief (prep for Phase 6)

> Place at `docs/UI-PREP.md`. Input for a later Claude Code session, not approved scope. DESIGN.md stays binding; section 4 lists the changes to it this brief proposes.
> Visual reference: the "VYUH UI Shell" canvas (landing, operator home, service record, threat library).

---

## 1. Design direction: "operational editorial"

Keep everything in DESIGN.md (monochrome chrome, tokens, IBM Plex, 2 px radius, no glow, no gradients). Add a small set of editorial moves borrowed from award-level industrial and defence sites, which read as engineered rather than decorative:

| Move | What it means here | Where |
|---|---|---|
| Macro typography | One very large condensed uppercase headline per public page; everything else stays on the type scale | Landing hero, section heads |
| Sheet framing | Pages behave like a printed briefing pack: `SHEET 02 / 06`, a reference line (`PS 26247 · MoD · DSSC`), hairline rules between sections | Landing, briefing, record |
| Telemetry strips | Thin mono metadata rows (coordinates, time, ROE, preset) above or below key visuals | Hero figure, briefing map, AAR |
| Data as imagery | The hero visual is the product (PPI, replay loop), never stock art or 3D renders of drones | Landing |
| Ruled tables over cards | Realism, sessions, library facts as ruled tables or ruled grids, not floating cards | Everywhere |
| Numbered stages | The kill chain as a 01–06 ruled strip, reused in AAR and trends | Landing, home, AAR |

Still banned: gradients, glow, glass, emoji, icon-per-feature card grids, fake stats, marketing verbs.

**References (study the structure, never copy):**
- Anduril Industries site — near-monochrome palette, sharp corners, colour only from the product.
- Hanwha Aerospace site (Awwwards inspiration listing) — defence product showroom, technical framing.
- Awwwards "Film, TV and Game Interfaces" collection — only for HUD density and labelling ideas, never the sci-fi glow.
- Real C2 / air-defence operator displays and printed military map sheets (DESIGN.md §1).

---

## 2. Pages and components a military training site should have

### Already planned (check they get this treatment)
Landing · login · training list · briefing · sim player · result · AAR replay · trends · unit dashboard · scenario builder · weight editor · realism sources.

### New — high value, low cost (recommend for Phase 6)
1. **Operator home** (post-login landing): assigned scenario with due date and one primary action, "Where am I losing points?" kill-chain bars, notices from the instructor, recent sessions with Replay, next qualification criteria.
2. **Threat recognition library**: one entry per contact class — silhouette, size, RCS, speed, RF behaviour, ID cues, "often confused with". Filter by threat / non-threat / friendly. Linked from track list and AAR ("what was this?"). Data comes from `CLASS_PROFILES`, so it stays in sync.
3. **Service record**: qualification ladder (Basic operator → Sensor operator → Engagement controller → Instructor), each level with criteria and instructor sign-off; endorsements earned only from Assessment sessions; printable PDF export for the unit training file.
4. **Notices / inbox**: assignments, instructor remarks, library updates. Unread count in the top bar.
5. **Help & controls**: keyboard reference, glossary (SPEC §21), "how scoring works" with the decision tree explained in plain words.

### New — nice to have (only if time remains)
6. **Instructor: live session monitor** — which trainees are in a session right now, their clock and current score component (read-only).
7. **Unit readiness board** — one row per trainee, qualification level, last assessment, weakest stage, overdue assignments.
8. **Printable briefing sheet** — the briefing page as a light print stylesheet (DESIGN.md §3 already allows this).
9. **Settings** — reduced motion, sound on/off, units (km / NM), shortcut cheat-sheet toggle.
10. **System status page** — API, database, build version, sim version, terrain revisions; useful for the offline build and for judges.

### Do NOT add
Leaderboards across units, streaks, XP or confetti (gamification undermines a serious trainer); chat; social sharing; avatars or photos.

---

## 3. Shared shell rules

- **Top bar on every signed-in page:** wordmark → Home · Training · Threat library · After-action · Service record (instructor adds Unit · Builder). Active item gets a 2 px `--select` underline. Right side: role chip, notices count, local time.
- **Page header pattern:** mono reference line, H1 condensed uppercase, one line of context; key facts as a ruled fact strip on the right.
- **Panels:** DESIGN.md panel anatomy everywhere; header titles phrased as questions on analytic panels.
- **Demo data badge:** amber outline chip `DEMO DATA` on any panel fed by `is_demo` rows.
- **One primary action per screen** (bone button); everything else secondary outline or text link.

---

## 4. Proposed amendments to DESIGN.md (need approval)

1. Allow a **landing-only display size** of 72–96 px (condensed, uppercase, line-height 0.92) for the hero headline. Current scale caps Display at 40 px.
2. Add the **sheet framing** and **telemetry strip** patterns to §5 as approved layout devices.
3. Add a **muted body** text shade between `--text-1` and `--text-2` (`#C3CEC8`) for long descriptions; `--text-3` (`#627069`) fails 4.5:1 for small text, so restrict it to non-text uses (borders of empty checkboxes, disabled outlines).
4. Add **qualification state chips**: QUALIFIED (`--ok`), IN PROGRESS (`--warn`), LOCKED (`--text-2`).

---

## 5. Suggested build order (Phase 6 UI pass)

1. Shared shell (top bar, page header, demo badge) across all signed-in pages.
2. Landing rework with sheet framing and the real replay loop.
3. Operator home.
4. Threat recognition library (data from `CLASS_PROFILES`; silhouettes as inline SVG components).
5. Service record + PDF export.
6. Help & controls, settings, status page.
7. Instructor extras if time remains.

Each page: DESIGN.md §13 checklist, screenshots at 1366×768 and 1920×1080.
