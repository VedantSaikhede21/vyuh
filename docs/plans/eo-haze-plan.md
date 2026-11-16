# EO haze plan: atmospheric contrast in the camera sensor model

Written 2026-11-16. Status: **approved 2026-11-16 with five changes, marked [C1]–[C5] where they land.** This is open decision B from `docs/plans/atmosphere-step2-direction.md` §5, with decision A (realistic Punjab visibility) folded in.

## Changes at approval (2026-11-16)
- **[C1] Cue rule in this build, not after measuring.** `apps/web/lib/hud/cue-zoom.ts` picks the cue's field of view from a sim-core worst-case DETECT range (ground-backed, 0.35 m). The user chose **detection first**: the widest zoom step whose worst-case DETECT range reaches the track's radar range, even when it is narrower than the p95 pointing floor; if no step does, today's pick. (The literal "never narrower than the pointing floor" changes nothing in the 550 m–2 km gap, because every step that detects there is narrower than the floor.) The sim's 85 % acquisition window (decision 176) is unchanged. Lock times on S15, S06 and S05 are reported before and after (§5.1).
- **[C2] The DAY hard cap at `visibilityM` stays in v1.** Without it DAY could see past V on J&K ridges, and further than IR (old risk 7), which breaks "nothing gets easier". A test checks every "after" range in the golden table is ≤ its "before".
- **[C3] Distant backgrounds.** The skyline profile also stores the distance D to the terrain or building it hits. A ground-backed contact at range R sees its background through the gap: Tg = exp(−β·m·(D − R)), S_eff = S / (Tg + S·(1 − Tg)), and C₀ blends from the ground value towards the sky value by (1 − Tg). Checks in the golden table (§2.5).
- **[C4] Deploy guard.** The API rejects a session whose `sim_version` is newer than its own, with a clear error, so the web cannot go live before the API and lock S15 at 20 km. One pytest.
- **[C5] Drone C₀ = 0.5 against the sky is stated plainly as above the only measured range** (Volpe: a white sUAS against a bright sky, 0.03–0.33), chosen for dark, backlit airframes and to match decision 177's render tone. In the docs and the code comments.
- Rules carried over: leave the atmosphere session's uncommitted files alone; its step 3 uses decisions 183–184, so this work takes the next free numbers; stop after any build step whose tests fail. Commits by path, one per step, pushed at the end once green.

## 0. Where things stand

### 0.1 The problem
`eoLevel()` in `packages/sim-core/src/sensors/eoir.ts` returns nothing past `visibilityM` (×1–1.5 in IR, decision 94). Inside that range it grades a contact by size and zoom only (Johnson cycles: DETECT ≥ 1, RECOGNISE ≥ 4, IDENTIFY ≥ 6.4). Haze plays no part, so at 0.8 × visibility the sim can say IDENTIFY while physical fog leaves about 4 % contrast. The render works around this with a contact floor: EO contact materials never fade below 0.5 transmittance up to 0.9 V (decision 181; the direction proposed 0.2, and the user raised it to 0.5 after S08 measurements).

### 0.2 Code read for this plan
- `eoLevel()` has two callers in `packages/sim-core/src/sim.ts`: `eoLevelNow()` (the EO tracker: CUE → TRACK acquisition, TRACK hold and drop, `camera.targetLevel`) and `scanEo()` (`EO_IDENTIFIABLE` events with hysteresis). Both build the target from `CLASS_PROFILES[class]` plus slant range, and the conditions from `isNight` and `visibilityM`.
- **Scoring reads only logged events; it never re-runs the sim.** `services/scoring/metrics.py` uses `EO_IDENTIFIABLE` for `firstDetectableTMs` (any level) and for `identifiableWhenClassified` (IDENTIFY only); `services/analytics/kill_chain.py` uses the first IDENTIFY for the IDENTIFY stage. A sim change alters what gets logged, not how it is scored. No API scoring code changes.
- **Sim-core validator** (`validate.ts`, used by the generator sweep) does not use EO, so the sweep is unaffected.
- **AI assist:** suggestions are baked into the scenario by the generator (`cs.ai_accuracy`); the sim only logs `AI_SUGGESTION_SHOWN` and accept / reject. Unaffected.
- **Cue framing** (`apps/web/lib/hud/cue-zoom.ts`, decision 176) picks fields of view from radar range only. The tracker acquires once the cued contact has been at ≥ DETECT inside 85 % of the frame for 0.5 s, so acquisition depends on `eoLevel()`.
- **Replay gate** (SPEC §3.4): a session replays only if its stored `sim_version` equals `SIM_VERSION`; otherwise the AAR shows the event timeline with "This session used an older simulator version — showing the event timeline only, not a replay."
- **Demo history:** 42 logs in `apps/api/app/seed/demo_sessions/`, recorded by `packages/sim-core/scripts/export-demo-sessions.ts`, checked by `test/demo-sessions.test.ts` (`simVersion` must equal `SIM_VERSION`). The API seeder fingerprints the logs and replaces all demo sessions when they change (`seed/demo_history.py`).
- **Other recorded logs:** API fixtures (`apps/api/tests/fixtures/*.json`) and e2e seed sessions (`apps/api/app/seed/e2e/`), from `scripts/export-api-fixtures.ts`; the e2e replay spec loads `s04_reports` and `s06_roe_attempts` stamped with the current `SIM_VERSION`.
- **Scenario seeder** (`apps/api/app/seed/scenarios.py`): a scenario with started sessions keeps its gameplay content. Precedent: AI suggestions could change while no session had run on v6+ (decision 132), and the camera resolution while none had run on v7+ (decision 176). A weather change on S15 needs the same kind of rule.
- **Camera heights above each map's lowest ground** (measured with the sim's own world): Punjab and URBAN 13–20 m, so the camera sits inside the haze layer. **J&K: S11 and S13 365 m, S05 926 m**, where the render's haze layer has thinned to 30 % and 19 % of its ground density.
- `dmath.ts` has `dexp`, `dlog` and `datan2`, so everything below can be engine-independent (SPEC §3.4).

### 0.3 Uncommitted work in the repo (left alone)
`git status`, re-checked just before writing this file:

| Files | Session |
|---|---|
| `apps/web/components/hud/eo-view.tsx`, `components/scene/mission-scene.tsx`, `components/sim/{environment,sim-canvas,site-markers,sky-dome,track-markers,zone-markers}.tsx`, `lib/sim/{atmosphere-fog,atmosphere-look,atmosphere-switch,environment-look}.ts`, `test/atmosphere-look.test.ts`, new `lib/sim/tone-mapping.ts` | **Atmosphere session**, step 3 (sky, light, tone mapping; its code cites decisions 183–184, not yet in `docs/decisions.md`) |
| `docs/plans/frontend-rebuild-brief.md` (modified); untracked `docs/mockups/`, `docs/plans/frontend-rebuild-{functions,plan,research,status}.md`, `docs/plans/redesign-*.md` | Probably the front-end rebuild planning (brief of 2026-11-13); not touched by either sim session |
| **Drone models** | At the start of this session `contact-model-mesh.tsx`, `drones.tsx` and `lib/sim/contact-models.ts` were uncommitted. They are now in commit `ca19077` (atmosphere step 2). No drone-model files are uncommitted now. |

This plan adds only `docs/plans/eo-haze-plan.md` (untracked, not staged).

## 1. Research findings

Status: **read** = I read the source text; **listing** = only the abstract, listing or search excerpt was reachable; **unverified** = from the secondary literature, not checked in this session (not used in the model).

### 1.1 Contrast against the horizon sky (Koschmieder, Duntley)
- Apparent contrast of an object against the horizon sky falls exponentially: C_R = C_0 · e^(−βR). Visibility is defined for a **black** object against the horizon sky, whose inherent contrast is about −1; the threshold depends on |C|, not its sign (Gordon 1980, Eq. 2–3, **read**).
- β = 3.912 / V from the 2 % threshold is kept (decision 178), so the sim and the fog agree. With the threshold also at 2 %, a black object vanishes at exactly V, and any object with |C_0| < 1 vanishes **before** V. **The visibility cap is then a result of the formula, not a separate rule.**

### 1.2 Contrast against terrain: the sky-to-ground ratio
- When the background is terrain, Duntley's contrast transmittance is C_R / C_0 = 1 / (1 + S·(1/T − 1)), where T is the path transmittance and S is the **sky-to-ground ratio**: horizon-sky luminance over the background's inherent luminance. In reflectance form, S = R_sky / R_background. It is a luminance ratio, not an albedo (Gordon 1980, Eq. 29–30, after Duntley 1946 Eq. 36 and Duntley 1948 Eq. 21, **read**).
- At S = 1 this reduces to the sky case. Range-test guidance says visual range is **longer** than Koschmieder's when S < 1 (snow under overcast) and **shorter** when S > 1, and that S is rarely 1 and depends on the look direction relative to the sun (RCC 356-22, **listing**).
- Background reflectances from Gordon (1980, **read**): black or forest 0.04, growing crops 0.10, sand 0.20, white or snow 0.80. Gordon's figures run horizon-sky equivalent reflectance from below 0.1 to above 1.
- The commonly quoted Middleton table (clear sky: fresh snow 0.2, desert 1.4, forest 5; overcast: 1, 7, 25) is **unverified**: the scans of Middleton (1952) and the ARL "Sky-to-Ground Ratio for Wargamers" report (Brien and Shirkey 2004) were not reachable. **Not used**; cloud cover stays out of v1 (open question Q2).
- Middleton's rule of thumb: a background counts as "behind" the target once it is at least 1.5 times as far away (Gordon 1980, **read**). The sim approximates this with a skyline test (§2.3).

### 1.3 Resolution and contrast together: the TTP metric
- The Targeting Task Performance (TTP) metric replaced Johnson cycles in the US Army's NVESD models (Vollmerhausen and Jacobs, AMSEL-NV-TR-230, 2004; Vollmerhausen, Jacobs and Driggers, Opt. Eng. 43(11), 2004; **listing**). TTP = ∫ √(C_tgt / CTF_sys(ξ)) dξ over the spatial frequencies where the target's contrast exceeds the system's contrast threshold function (CTF). Cycles on target are V = TTP × target size / range, and the probability is (V/V50)^E / (1 + (V/V50)^E). The 2003 conference version notes that it handles sampled imagers, which the Johnson criteria cannot (**listing**).
- NV-IPM, the current Army model, is built on TTP and needs atmospheric transmission and sky path radiance as inputs: a small drone's contrast against the sky depends on the atmosphere (Sensors 21:7067, 2021; Applied Optics 62(31), 2023; **listing**).
- **The simplest version for a real-time sim** (derived here, §2.4): keep Johnson's thresholds and the sensor's pixel maths, and scale the cycles by a TTP ratio that depends only on apparent contrast. With a CTF that rises exponentially from the threshold ε at coarse detail to G·ε at the pixel limit, the integral has a closed form: one square root and one branch per contact. Constant factors cancel in the ratio.
- Why not a flat CTF (the plainer form, k = √(C / C_ref))? It is too generous near threshold. On S08 (800 m fog), the heavy quad T013 at 642 m (0.8 V) would still read **IDENTIFY** at 4 % apparent contrast, which is the exact case decision 181 measured. With the rising CTF it gets no level at all.

### 1.4 Inherent contrast of small drones and birds
- In Volpe's tower-controller study, a **white** small UAS seen against a mostly bright sky had Weber contrast **0.03 to 0.33**, "not a very high contrast situation". The study also says that at a fixed visual angle, detection is proportional to contrast (Volpe 2019, Appendix C, **read**). This is the low end for drones.
- A dark outline stands out against a lighter sky even at long range (FM 21-75, 1962, **listing**). A black object is about −1 (Gordon 1980). This is the high end.
- Small drones read as dark shapes against a day sky because they are mostly backlit (the reasoning in decision 177; the render draws models at 0.55 tone).
- Representative choices (§2.2): drones 0.5 against the sky and 0.3 against terrain; birds 0.8 against the sky (dark raptors and corvids against a bright sky) and 0.2 against terrain (plumage blends with earth tones); manned aircraft 0.8 and 0.3. **All labelled representative.** No measured table for these classes was found.

### 1.5 Observer threshold spread (Middleton)
- From Gordon's re-analysis of Middleton (1952): 1,000 observations at Ottawa give a mean threshold |C| = **0.042** (σ 0.031); 285 on Mount Washington give **0.034** (σ 0.022). Douglas and Young (1945) give 0.055. Duntley (1948) found that reported visibility averaged **0.75** of the meteorological range, an effective threshold of about 0.055 (Gordon 1980, **read**).
- **So the sim's 2 % is the generous bound:** a fully alert operator looking at a stabilised, zoomed picture. Real observers vary by a factor of 2–3. The sim is deterministic and does not model a per-trainee threshold (open question Q6 for using this as a difficulty setting).

### 1.6 Does haze change the thermal (IR) view?
- In MODTRAN results (DLR, published by FLIR): in light fog (ICAO Cat I) both thermal bands see much farther than the eye; in moderate fog (Cat II) only LWIR (8–12 µm) clearly beats the visible band; in dense fog (Cat III, under 300 m) there is no substantial difference (FLIR 2020, **read**). Haze aerosols scatter less at thermal wavelengths than fog droplets do.
- This matches the existing IR ramp (×1 in fog, rising to ×1.5 by 3 km, decision 94). **Recommendation: IR keeps its current cap and thermal-contrast scaling in this task.** A proper IR model uses a target-to-background temperature difference, not luminance contrast, and needs its own sources. Open question Q4.

### 1.7 Punjab visibility (decision A)
- Surface visibility over India fell from 1961 to 2008, most over the Indo-Gangetic Plain (IGP). **Post-monsoon afternoon good-visibility days fell 9.2 % per decade** (Jaswal et al., Natural Hazards 2013, **listing**). S15 is a post-monsoon afternoon (7 October, 14:30).
- Punjab's stubble-burning count starts on 15 September and peaks in late October and November (Deccan Herald, Business Standard, **listing**). S15 sits at the start of the smoke season.
- IGP aerosol optical depth of 0.5–1 (atmosphere plan §3.3) in a 1.3 km layer gives a Koschmieder ground visibility of about 10 km (direction change 2, decision 179). No station-level visibility climatology in km was found for Ludhiana or Amritsar (open question Q5 records what would settle it).

### 1.8 Niche details an Army officer will recognise
1. **"Do not silhouette yourself against the skyline"** (FM 3-21.8, 2007, **listing**). The same physics now applies to drones. On the Punjab plains, with the camera 13–20 m up, every drone is above the horizon, so it is skylined and stands out. In J&K, low drones seen from a ridge sit against the slope behind them and fade much sooner. **Siting trade-off:** high ground gives radar line of sight but puts low drones against the ground.
2. **Visibility on a weather report is not the sim's visibility.** METAR visibility is the meteorological optical range (5 %); the scenario's figure is the 2 % meteorological range (decision 178), 3.912 / 2.996 = **1.31 ×** longer. S15 at 10 km is a reported visibility of about 7.7 km.
3. **Observers report about 0.75 of the meteorological range** (Duntley 1948): real eyes need about 5 % contrast, not 2 %.
4. **White drones are low-contrast targets against a bright, hazy sky** (Volpe: 0.03–0.33), which is one reason controllers missed them.
5. **Thermal versus visible in fog by ICAO category** (§1.6) is why the IR view keeps seeing through haze but not through dense fog.

## 2. The model

### 2.1 In plain words
The camera sees a contact if enough of the contact's contrast survives the haze between them, and it resolves detail in proportion to the square root of that surviving contrast (the TTP idea). The contrast that survives depends on how far away the contact is, how hazy the air is along that line, and whether the contact is seen against the sky or against the ground. Against the ground, the haze in front of the contact also brightens the dark background, so contrast drops faster. Below 2 % contrast nothing is seen. Johnson's 1 / 4 / 6.4 cycles still decide DETECT / RECOGNISE / IDENTIFY.

### 2.2 Inputs
| Input | From | Notes |
|---|---|---|
| Visibility V | `environment.weather.visibilityM` | The visibility at the bottom of the haze layer, as the render already treats it |
| Range R | slant range camera → contact | as today |
| Path haze m | mean haze density along the line of sight (0–1) | the **same layer** as the render: even up to `base` above the map's lowest ground, then thinning with e-folding height `falloff`, by region, weather preset and month (decision 180) |
| Background | sky or ground (§2.3) | skyline test per camera |
| Sky-to-ground ratio S | per terrain preset | S = R_sky / R_ground with R_sky = 0.25 (clear horizon sky, representative). PUNJAB_PLAINS and PROCEDURAL_HILLS: crops 0.10 → **2.5**. JK_MOUNTAIN: forest and rock about 0.06 → **4**. URBAN_GENERIC: mixed roofs and roads about 0.15 → **1.7**. All representative. |
| Inherent contrast C₀ | by class category (`DRONE`, `BIRD`, `MANNED_AIRCRAFT`), sky / ground | 0.5 / 0.3, 0.8 / 0.2, 0.8 / 0.3 (§1.4), representative; a sim-core table, so `packages/shared` does not change. **[C5] The drone sky value of 0.5 is above the only measured range** (Volpe 2019: a white sUAS against a bright sky, 0.03–0.33). It is chosen for dark, backlit airframes, which read as silhouettes (FM 21-75; Gordon: a black object ≈ −1), and to match the render's dark day tone (decision 177). A white drone against a bright sky would be harder than the sim makes it. |
| Zoom, resolution | camera | Johnson cycles as today |
| Threshold ε | 0.02 | decision 178 |
| CTF rise G | 10 | the contrast the pixel limit needs, relative to coarse detail; representative (open question Q1) |
| Reference contrast C_ref | 0.5 | a drone against the sky: today's Johnson ranges stay exact for that case at short range |

### 2.3 Sky or ground behind the contact
When the sim is created, it builds a **skyline profile** for the EO camera: for each 0.5° of bearing, the highest elevation angle of the terrain (ray-marched to the map edge) and of building tops, and **[C3] the distance D to the point that sets it**. It is pure, built once, never snapshotted, and uses `datan2`. Each tick a visible contact is **sky-backed** if its elevation angle from the camera is above the skyline at its bearing, and **ground-backed** otherwise. LOS is still checked separately, so a skyline taller than the contact can only be terrain behind it. Trees are display-only (decision 170) and are not in the profile.

### 2.4 Formula (DAY mode only; IR and night unchanged)
```
β   = 3.912 / max(V, 1)
T   = exp(−β · m · R)                     // dexp; m = mean haze density along the path
τ   = T                                   // sky-backed
Tg  = exp(−β · m · max(D − R, 0))         // [C3] haze between the contact and its background
S'  = S / (Tg + S · (1 − Tg))             // [C3] the background seen through that gap
C₀' = C₀,ground + (C₀,sky − C₀,ground)·(1 − Tg)   // [C3] a far, hazed background is nearly sky
τ   = 1 / (1 + S' · (1/T − 1))            // ground-backed (Duntley)
C   = C₀' · τ                             // apparent contrast (C₀' = C₀,sky when sky-backed)
q   = sqrt(C / ε)
TTP(C) = q · (1 − 1/sqrt(G))   if C ≥ G·ε // the contrast reaches the pixel limit
       = max(q − 1, 0)         otherwise  // cut-off below the pixel limit; 0 below ε
k   = min(1, TTP(C) / TTP(C_ref))
cycles = Johnson cycles × k   →  DETECT ≥ 1, RECOGNISE ≥ 4, IDENTIFY ≥ 6.4; none if k = 0
none if R > V                             // [C2] the hard cap stays in v1
```
Derivation: with CTF(ξ) = ε·G^(ξ/ξ_N) up to the pixel limit ξ_N, TTP = ∫₀^ξc √(C/CTF) dξ, where ξc is the frequency at which CTF = C, capped at ξ_N. That gives (2ξ_N / ln G)·(√(C/ε) − 1) below the cap and (2ξ_N / ln G)·√(C/ε)·(1 − G^(−1/2)) at it. The two forms meet at C = G·ε. The factor 2ξ_N / ln G cancels in k, and the sensor's resolution is already in the Johnson cycles.

Consequences:
- **[C2] DAY keeps the `rangeM > visibilityM` cap in v1.** Inside the layer the formula already fades every contact before V (C₀ ≤ 1, ε = 2 %). Above the layer (J&K ridges), the haze term would allow more than V, but the cap holds it at V, so DAY never sees farther than today or farther than IR's cap. The layer still makes ridge paths clearer than the valley value inside V, which is what the picture shows.
- k never exceeds 1 and the cap stays, so **nothing gets easier than today**: a test checks every "after" range is ≤ its "before". Scenarios tuned under the old model can only get harder.
- Cost: one `dexp`, one square root and one table lookup per in-frustum contact per tick. The skyline profile costs about 720 × 470 height samples once at `createSim`.

### 2.5 Ranges before and after
Day camera at full zoom (1.5° horizontal FOV, 1280 px; the scripted and generated camera), path inside the haze layer (m = 1, like every Punjab and URBAN scenario). "Before" = today (Johnson, capped at V). "Sky" and "ground" = after; ground = Punjab farmland (S = 2.5). Computed with the formula above; the build pins these in a test.

| V | Contact | DETECT before / sky / ground | RECOGNISE before / sky / ground | IDENTIFY before / sky / ground |
|---|---|---|---|---|
| 20 km | Small quad 0.35 m | 8.56 / 5.10 / 3.05 km | 2.14 / 1.79 / 1.24 km | 1.34 / 1.19 km / 860 m |
| | Fixed-wing 2.0 m | 20 / 10.7 / 6.37 km | 12.2 / 6.19 / 3.68 km | 7.64 / 4.77 / 2.87 km |
| | Large bird 1.5 m | 20 / 11.4 / 4.74 km | 9.17 / 6.28 / 2.56 km | 5.73 / 4.61 / 1.94 km |
| 10 km | Small quad | 8.56 / 3.64 / 2.16 km | 2.14 / 1.57 / 1.01 km | 1.34 / 1.08 km / 730 m |
| | Fixed-wing | 10 / 6.35 / 3.76 km | 10 / 4.23 / 2.51 km | 7.64 / 3.45 / 2.05 km |
| | Large bird | 10 / 6.89 / 2.88 km | 9.17 / 4.44 / 1.81 km | 5.73 / 3.58 / 1.44 km |
| 5 km | Small quad | 5.0 / 2.40 / 1.42 km | 2.14 / 1.27 km / 760 m | 1.34 km / 930 / 580 m |
| | Fixed-wing | 5.0 / 3.55 / 2.10 km | 5.0 / 2.68 / 1.59 km | 5.0 / 2.30 / 1.37 km |
| | Large bird | 5.0 / 3.92 / 1.64 km | 5.0 / 2.86 / 1.18 km | 5.0 / 2.43 km / 990 m |
| 1 km | Small quad | 1.0 km / 700 / 410 m | 1.0 km / 520 / 310 m | 1.0 km / 440 / 260 m |
| | Fixed-wing | 1.0 km / 800 / 470 m | 1.0 km / 730 / 430 m | 1.0 km / 690 / 410 m |
| | Large bird | 1.0 km / 900 / 370 m | 1.0 km / 810 / 340 m | 1.0 km / 750 / 320 m |

Reading it:
- **Against the sky, the small quad's IDENTIFY range barely moves in clear air** (1.34 → 1.19 km at 20 km). Most of the change is in DETECT at long range, which is beyond the radar's range for a quad anyway.
- **Against the ground, ranges fall by roughly 35–60 %.** This is the skylining effect.
- **In fog, nothing reaches the old cap any more.** S08's heavy quad (1.0 m, 800 m fog): before, IDENTIFY all the way to 800 m; after, DETECT 620 m, RECOGNISE 550 m, IDENTIFY 510 m. At 642 m (decision 181's case) it gets **no level**, so the verdict and the picture agree.
- **J&K ridge (S05, 6 km, camera 926 m above the valley floor):** a quad level with the camera, sky-backed (m ≈ 0.19) identifies at 1.24 km, against 0.97 km for the same haze taken as even. A quad below the ridge against the slope (S = 4, m ≈ 0.5) identifies at 680 m.
- **[C3] Distant backgrounds (S05: 6 km, m = 0.5, S = 4, small quad, IDENTIFY):** background right behind the quad 681 m; 1 km behind 791 m; 3 km behind 860 m; 10 km behind 892 m (C₀ held at the ground value). With the C₀ blend, as the code does it: 863 m, 995 m and 1,103 m. All stay below today's 1,337 m. Without this, a ridge 10 km behind the drone would count as a slope right behind it, and J&K would be harsher than reality.
- **For scale:** an overcast forest slope with the unverified S = 20 would cut a quad's IDENTIFY range to 360 m at 10 km visibility. That is why cloud cover is held back until it can be sourced.

Small-quad DETECT limit at the cue's fields of view (the tracker needs DETECT to lock):

| FOV | Before | 20 km sky / ground | 10 km sky / ground | 6 km sky / ground |
|---|---|---|---|---|
| 30° (cue under 500 m) | 430 m | 410 / 310 m | 400 / 290 m | 380 / 270 m |
| 14° (cue 500 m–1 km) | 920 m | 840 / 620 m | 790 / 550 m | 720 / 480 m |
| 6.7° (cue beyond 1 km) | 1.92 km | 1.63 / 1.14 km | 1.44 km / 940 m | 1.27 km / 770 m |

## 3. Decision A: Punjab visibility
**Recommendation: S04, S07 and S15, the three Punjab scenarios at 20 km, go to 10 km.** All other scripted scenarios stay as they are.
- **Why 10 km:** an IGP AOD of 0.5 in the post-monsoon layer gives about 10 km by Koschmieder (decision 179). Post-monsoon afternoon good-visibility days over the IGP are falling (Jaswal et al. 2013), and S15 (7 Oct) falls in the smoke season, which starts on 15 September. 10 km is still a good day: about 7.7 km on a METAR (§1.8). The render then draws S15 as HAZE (decision 180: ≤ 10 km), the milky Punjab look the atmosphere plan asked for, from the scenario's own numbers.
- **S07** (24 March, dusk) is pre-monsoon: dust adds to the haze, and its layer is the deepest of the year (decision 180). **S04** (13 March, night) changes nothing in the sim, because the day camera is off at night and the IR cap of 15 km is far beyond any IR Johnson range in it. It changes only the night render, for consistency.
- **Without decision B, decision A changes almost nothing in the sim:** the S15 quad's ranges are all well inside 10 km. With B, S15's quad IDENTIFY goes 1.34 → 1.08 km against the sky.
- **How:** a merge patch `"patch": {"environment": {"weather": {"visibilityM": 10000}}}` in `apps/api/app/seed/scenarios/src/{S04,S07,S15}.json`, then `build_scripted.py` (the generator picked 20 km through its CLEAR preset, so this is a patch, not a request change). The briefings change "clear" to "hazy" ("Daylight, hazy." / "Dusk, hazy."); these are display fields.
- **The seeder needs one rule** (an API seed change, outside "sim-core and scenario data", needed for this to land): `WEATHER_SIM_VERSION = 8` lets `environment.weather` change on a used scenario while no started session has run on v8 or later, like `CAMERA_SIM_VERSION` (decision 176). Plus one pytest, like `test_seed_updates_ai_suggestions_only_before_sim_version_6`.
- **Not in this task:** the generator's CLEAR preset is 20 km for every region. A Punjab-specific value is a generator change (`GENERATOR_VERSION`, API) and is parked (Q5).

## 4. Files, tests, versions

### 4.1 Files to change (sim-core and scenario data, plus the one seeder rule)
| File | Change |
|---|---|
| **New** `packages/sim-core/src/atmosphere.ts` | `KOSCHMIEDER`, `presetFor`, `regionFor`, `seasonOf`, `layerFor` (numbers only, moved from `apps/web/lib/sim/atmosphere-look.ts`), `meanDensity` (the exact even-then-exponential integral, same maths as the shader), `pathHaze(cam, target, layer, floorY)`, `SKY_GROUND_RATIO` per preset, `INHERENT_CONTRAST` per category. All using `dexp`. |
| **New** `packages/sim-core/src/horizon.ts` | `buildSkyline(world, sensorPos)` → `Float64Array` of 720 bins; `isSkyBacked(skyline, from, to)` |
| `packages/sim-core/src/sensors/eoir.ts` | `EO_CONTRAST_THRESHOLD`, `CTF_RISE`, `CONTRAST_REF`; `contrastTransmittance`, `ttpRatio`; `eoLevel` takes `{ inherentContrast, skyBacked, pathHaze }` on the target and `skyGroundRatio` in the conditions; DAY path as §2.4, IR path unchanged |
| `packages/sim-core/src/sim.ts` | build the layer and skyline in `createSim`; **one helper** used by both `eoLevelNow()` and `scanEo()` so they cannot diverge |
| `packages/sim-core/src/version.ts` | `SIM_VERSION = 8` with its comment line |
| `packages/sim-core/src/index.ts` | export the atmosphere functions (the web imports them later, §5) |
| `apps/api/app/seed/scenarios/src/{S04,S07,S15}.json` → rebuilt `S04.json`, `S07.json`, `S15.json` | §3 |
| `apps/api/app/seed/scenarios.py` | `WEATHER_SIM_VERSION` rule (§3) |
| **[C1]** `apps/web/lib/hud/cue-zoom.ts`, `apps/web/lib/sim/commands.ts`, new `apps/web/test/cue-lock.test.ts`, `apps/web/test/cue-zoom.test.ts` | detection-first cue rule (§5.1); lock-time harness |
| **[C4]** new `packages/sim-core/scripts/export-sim-version.ts` → generated `apps/api/app/seed/generated/sim.json` (added to `pnpm gen:schemas`); `apps/api/app/services/sessions.py` guard; one pytest | §4.3 |
| Re-recorded data | `apps/api/app/seed/demo_sessions/*.json` (42), `apps/api/tests/fixtures/*.json`, `apps/api/app/seed/e2e/*.json` |
| Docs | SPEC §6.2 (model, inputs, cap note), §14 table of sources; `docs/decisions.md` (next free numbers when built; atmosphere step 3 is taking 183–184); `docs/realism-sources.md`; CLAUDE.md §14 |

No change to `packages/shared` (no schema change), the scoring trees or the generator. In `apps/web` only the cue rule changes ([C1]); the atmosphere session's files are not touched. `pnpm gen:schemas` gains the `sim.json` step ([C4]).

### 4.2 Tests to add
`packages/sim-core/test/eo-haze.test.ts`:
- **Formula:** sky-backed τ equals `dexp(−βR)`; ground with S = 1 equals sky; S > 1 is always lower than sky; C₀ = 1 at R = V inside the layer gives C = 0.02 ± 1e-12; `ttpRatio` is continuous at C = G·ε (within 1e-12), 0 at C ≤ ε, 1 at C_ref, never above 1, and increases with C.
- **Edge cases:** V = 0 (the schema allows it) gives no level and no NaN; R = 0; zoom at both limits; a contact exactly on the skyline (defined as ground); path entirely above the layer (m → small, no division by zero, mirroring the shader's near-level branch); night DAY still null; **IR results identical to today** (the existing IR assertions in `sun-eo.test.ts` stay unchanged as the proof).
- **Golden table:** every number in §2.5 pinned to ± 10 m, so the plan, the docs and the code cannot drift apart.
- **Layer:** `meanDensity` is 1 inside the layer, exp(−Δ/H) on a level path Δ above it, and continuous at the layer top. `layerFor` matches the web table (one shared test fixture until the web imports it).
- **Skyline:** a flat map gives a skyline just below 0°; a test hill raises its bearings only; a building raises its bins; two `createSim` calls give identical profiles.
- **Scenarios:** S08: no `EO_IDENTIFIABLE` IDENTIFY beyond 520 m. S15 (10 km): every quad IDENTIFY at ≤ 1.09 km. S05: some contact seen against the slope gets a lower level than the same range against the sky.
- **Determinism:** the existing replay and determinism suites (S01–S15 and generated PUNJAB D5 seed 6: replayed log identical, every keyframe restore equals the straight run) must pass unchanged in form. Add one Node-only check that the skyline uses only `dmath` (the ESLint rule already forbids `Math.exp` / `Math.atan2` in `sim-core/src`).

Existing tests to update: `sun-eo.test.ts` (DAY boundaries move; IR unchanged); `phase2a-scenarios.test.ts` and `eo-track.test.ts` if lock timing assertions move; `library-scenarios.test.ts` guards; `demo-sessions.test.ts` (re-record); the seeder pytest; any e2e baseline whose capture depends on the lock moment (the 6 player baselines last moved at decision 176).

### 4.3 `SIM_VERSION` 8 and what happens to old data
- **Stored sessions (local and hosted, guests included):** scores, Elo, records and trends are untouched (stored; a re-score reads the stored log, which is unchanged). Their AAR shows the **event timeline, not a replay**, with the existing SPEC §3.4 wording. Nothing is deleted.
- **Demo history:** re-recorded with `node packages/sim-core/scripts/export-demo-sessions.ts`. The changed fingerprint makes the seeder replace all 42 demo sessions on its next run (hosted: the API image seeds at start).
- **API fixtures and e2e seeds:** re-exported with `scripts/export-api-fixtures.ts`; then `uv run pytest`. A pytest that pins an outcome which really depends on EO is updated with the reason stated.
- **Scenario content:** S04 / S07 / S15 update in place under the new seeder rule; S01–S03, S05, S06, S08–S14 are unchanged as data, but their day sessions log differently from v8 on.
- **Hosted deploy order:** API first (seed the new S15 and demo logs), then web. If the v8 web ships first and a guest plays S15 at 20 km, the rule would then lock S15 at 20 km. Recovery would be a manual seed after deleting that session.
- **[C4] Guard:** `POST /sessions` rejects a `simVersion` newer than the API's own `SIM_VERSION` (409, `SIM_VERSION_AHEAD`, "This simulator version (8) is newer than the server's (7). The server must be updated first."). The API reads `SIM_VERSION` from a file generated from sim-core by `pnpm gen:schemas`, so the two cannot drift (CLAUDE.md rule 4; CI's no-diff check covers it).

## 5. Effects elsewhere

### 5.1 Cue and lock
**[C1] Replaced by a change in this build:** `cue-zoom.ts` gains `cueFovDeg(steps, rangeM, detectRangeAt)`. It picks the widest zoom step whose worst-case DETECT range (`eoWorstCaseDetectRangeM` from sim-core: 0.35 m, ground-backed, this scenario's visibility, preset and camera) reaches the track's radar range. If no step does, it keeps today's pick (the narrowest step that covers the p95 pointing error). The re-search after a lost lock uses the same rule. The rule uses only the radar range and the scenario's own conditions, never the contact's truth. Lock times before and after on S15, S06 and S05 come from `apps/web/test/cue-lock.test.ts` (full report behind `CUE_LOCK_REPORT=1`).

Original analysis: the drone chat's finding holds and gets slightly worse: at 30° a small quad is detectable inside 430 m today and 400 m sky-backed at 10 km, so a cue under 500 m on a quad cannot lock between 400 and 500 m. The bigger change is ground-backed quads at the cue's middle steps: 14° covers 500 m–1 km but detects them only inside 550 m, and 6.7° beyond 1 km only inside 940 m (10 km visibility). Low drones against the ground will lock later, mostly in J&K and URBAN; on the Punjab plains nearly everything is sky-backed.
- **Recommendation:** no cue change in this task. Measure lock times before and after on S15, S06 and S05 with the trainee policy (`scripts/cue-error.ts` style), and report them. If they grow a lot, the camera session changes the cue rule so the opening FOV gives at least one cycle on a nominal 0.35 m target at the track's radar range, using the sim-core function with the ground-backed (worst-case) contrast. That still uses no truth.

### 5.2 Scoring fairness
- `identifiableWhenClassified` turns false more often in haze, because IDENTIFY now comes later or not at all. That is the fair answer: the picture did not show it. A correct call still gets full marks; a wrong call scores 0 either way, and only its feedback changes ("before it was identifiable … wait for a clear EO/IR view").
- `firstDetectableTMs` may move later where EO came before radar. Latency then runs from a later point, which favours the trainee. `NOT_DETECTABLE` and `UNAVOIDABLE` use the same field and stay consistent.
- Trees cannot change: v1–v4 are immutable and read only events. New sessions on the same tree score differently because their logs differ, which is intended. Old scores are unchanged.

### 5.3 AI-assist panel
Unchanged: suggestions are baked by the generator. Over-trust (accepting a wrong suggestion) now more often happens when the camera could not have checked the call. Parked idea: split over-trust in the AAR by "camera could identify at the time" (from `EO_IDENTIFIABLE` events; changes `AarSessionResponse`, a shared schema).

### 5.4 AAR
- New v8 sessions replay, and the kill-chain IDENTIFY stage's "available" time moves with the new events. Old sessions show the timeline (§4.3).
- Parked: carry `background` and `contrast` in the `EO_IDENTIFIABLE` payload so the AAR can say "seen against the ridge". That is a schema change.

### 5.5 HUD verdict
It reads `camera.targetLevel`, so it changes with no code change and now matches the picture. A contact flying along the skyline can flip between sky and ground from tick to tick; events already have hysteresis, but the verdict line could flicker (§7, risk 5).

## 6. Retiring the render's contact floor
- **Owner: the atmosphere session** (`apps/web/lib/sim/atmosphere-look.ts` `CONTACT_FLOOR`, the `uAtmosFloor` uniform and its 0.9–1.0 V fade in `atmosphere-fog.ts`, decision 181). This plan does not touch those files.
- **When:** after this lands on `main` and the atmosphere session has committed step 3.
- **Steps** (for that session):
  1. `atmosphere-look.ts` imports `KOSCHMIEDER`, `presetFor`, `layerFor` and `meanDensity` from `@vyuh/sim-core` instead of defining them, so the picture and the sensor use one table. **From then on, changing `base` / `falloff` is a sim change and needs a `SIM_VERSION` bump.** The colours stay in the web.
  2. Set the floor to 0 and remove the range-fraction fade. On J&K it measures distance / V without the layer, which no longer matches the sim.
  3. Check the day render's inherent contrast against C₀: a drone against the sky should read about 0.5 (the `MODEL_DAY_TONE` 0.55 of decision 177 is close; measure it from a still).
  4. Stills: S08 heavy quad at 642 m (sim: no level; picture: gone), S15 quad at 1.0 km (sim: IDENTIFY; picture: shape visible), S05 quad against the slope at 700 m (sim: RECOGNISE).
- **If stills show a RECOGNISE contact you cannot make out** (at 2 % it is near invisible on an 8-bit, noisy picture), the recommendation is a global **electronic defog**, a contrast stretch in the EO post-process, as real EO cameras offer. It is honest because it lifts terrain too, unlike a contact-only floor. That is a render-only decision for that session.

## 7. Risks
1. **The gameplay constants are representative, not measured:** C₀ per category, S per preset, G = 10. They decide how much harder the game gets. Mitigation: the golden-table test, every value labelled and cited, and a playtest pass on S15, S06, S05 and S08 before close-out.
2. **Harder identification against the ground** (35–60 % shorter) can shift library guard tests and the demo trainees' scores. That is expected, but the demo "5 of 6 trainees improving" check (Phase 4b) must still pass after re-recording; if not, the demo policy's skill scaling is looked at, not the model.
3. **Lock regression for ground-backed quads** at the cue's 14° and 6.7° steps (§5.1).
4. **Hosted deploy order** (§4.3).
5. **Skyline flicker:** a contact flying right along the skyline flips its background between ticks. The emission hysteresis covers events; if the verdict flickers in stills, the HUD (web) can hold it for 0.5 s.
6. **Trees are not in the sim's skyline** (decision 170): a Punjab drone drawn in front of a tree line is ground-backed on screen but sky-backed in the sim, so the sim is the more generous of the two. Accepted.
7. ~~On J&K ridges, DAY can now see farther than IR.~~ **[C2] Closed:** the DAY cap at V stays, so DAY never passes IR's 1.5 × V.
8. **The layer becomes sim data** (§6, step 1): the atmosphere session must know before tuning `base` / `falloff` again.
9. **Performance:** expected negligible (one `dexp` per in-frustum contact; about 340 k height samples once at sim creation). Measured with `packages/sim-core/scripts/bench.ts` (60 contacts, JK and URBAN) and the AAR worker's sim creation time.

## 8. Open questions (one recommendation each)
- **Q1. CTF rise G.** Recommend **10**, representative. It only changes how fast detail is lost near threshold; the golden table pins it.
- **Q2. Cloud cover in S.** Recommend **leaving it out of v1** until the Middleton or ARL table is read from a primary source (overcast is said to multiply S by about 5).
- **Q3. Snow in J&K winter** (S ≈ 0.3, so drones stand out against snow). Recommend **not in v1**; it needs a snow-cover rule by month and altitude.
- **Q4. IR haze model.** Recommend **unchanged for now** (§1.6); revisit with a temperature-difference model.
- **Q5. Generator CLEAR on Punjab and a visibility climatology.** Recommend a separate small task: IMD or NCEI METAR records for Ludhiana and Amritsar give seasonal afternoon visibility, then a per-region CLEAR value (`GENERATOR_VERSION` + 1).
- **Q6. Threshold by difficulty** (Middleton's spread, 0.02 → about 0.04). Recommend **parking it**: it would make difficulty less transparent, and the D1–D5 table is already tuned.
- **Q7. Sun-relative S and glare** (S depends on the look direction relative to the sun, RCC 356-22). Already parked as "sun glare in the EO view".

## 9. Build order (revised at approval; nothing here touches the atmosphere session's files)
0. **[C1] Before anything changes:** record lock times on S15, S06 and S05 with today's sim and cue (`apps/web/test/cue-lock.test.ts`, `CUE_LOCK_REPORT=1`).
1. `atmosphere.ts` + tests: pure functions, not wired in yet, so no behaviour change.
2. `horizon.ts` (with the hit distance, [C3]) + tests.
3. `eoir.ts` contrast and TTP functions, the worst-case DETECT range for the cue, the golden-table test (with [C2]'s after ≤ before and [C3]'s rows).
4. Wire into `sim.ts` through one helper, `SIM_VERSION` 8, update the existing sim-core tests, run the full replay and determinism suite and the bench.
5. **[C1]** The cue rule in `cue-zoom.ts` / `commands.ts` + tests; lock times after.
6. Scenario data (S04 / S07 / S15 patches, briefings, `build_scripted.py --check`), the seeder rule, **[C4]** the generated `SIM_VERSION` for the API and the session guard, each with its pytest.
7. Re-record the demo logs, API fixtures and e2e seeds; `pnpm lint`, `pnpm test`, `uv run pytest`, `pnpm gen:schemas` (no diff), CI-size generator sweep (expected unchanged), `pnpm e2e` (review any changed baselines).
8. Docs: SPEC §6.2, decisions, realism sources, CLAUDE.md §14.
9. Hand-off to the atmosphere session for §6 (import the layer, retire the floor, stills).
10. Deploy: API, then web (§4.3; the [C4] guard enforces it).

## 10. Sources
- Gordon, J. I. (1980), *Daytime visibility, a conceptual review*, Scripps Visibility Lab SIO 80-1 (read: Eq. 2–3, 29–30; Middleton and Douglas–Young thresholds; Duntley's 0.75; reflectances; the 1.5× background rule): https://misclab.umeoce.maine.edu/education/VisibilityLab/reports/SIO_80-1.pdf
- Duntley, S. Q. (1948), "The reduction of apparent contrast by the atmosphere", JOSA 38(2):179 (cited through Gordon; listing): https://www.scilit.net/publications/09b1d3582778ce66504e0b2253036105
- Volpe Center (2019), *Tower Controllers' Visual Detection of a Small Unmanned Aircraft System* (read: Weber contrast 0.03–0.33, detection proportional to contrast, the Duntley nomogram): https://www.faasafety.gov/files/gslac/library/documents/2022/Jul/353206/Volpe%20Study%20UAS_ControllerStudyReport_15November2019.pdf
- Vollmerhausen and Jacobs (2004), *The Targeting Task Performance (TTP) Metric*, AMSEL-NV-TR-230 (listing): https://apps.dtic.mil/sti/pdfs/ADA422493.pdf; Vollmerhausen, Jacobs and Driggers (2004), Opt. Eng. 43(11) (listing): https://journals.spiedigitallibrary.org/journals/optical-engineering/volume-43/issue-11/0000/New-metric-for-predicting-target-acquisition-performance/10.1117/1.1799111.full; 2003 conference version (listing): https://neurophotonics.spiedigitallibrary.org/conference-proceedings-of-spie/5076/0000/New-metric-for-predicting-target-acquisition-performance/10.1117/12.487215.full
- NV-IPM and atmosphere inputs (listing): Sensors 21:7067 (2021) https://doi.org/10.3390/s21217067; Applied Optics 62(31) (2023) https://desertlaboratory.arizona.edu/sites/default/files/2024-02/Wiley%20ao-62-31-8316.pdf
- Brien and Shirkey (2004), *Determination of Atmospheric Path Radiance: Sky-to-Ground Ratio for Wargamers*, ARL (listing only; the PDF was refused): https://apps.dtic.mil/sti/tr/pdf/ADA428277.pdf, https://www.semanticscholar.org/paper/Determination-of-Atmospheric-Path-Radiance:-Ratio-Brien-Shirkey/22abbb9bc024dde39c2d0264788e29e3a458d208
- Range Commanders Council 356-22, *Guidelines for atmospheric measurements* (listing: Koschmieder at S = 1, longer below, shorter above, depends on the sun): https://www.trmc.osd.mil/wiki/download/attachments/113019912/356-22.pdf?api=v2
- FLIR (2020), *Can thermal imaging see through fog and rain?* (read; DLR MODTRAN results by ICAO fog category): https://www.flir.com/discover/rd-science/can-thermal-imaging-see-through-fog-and-rain/
- FM 3-21.8 (2007), *The Infantry Rifle Platoon and Squad*, "Do not silhouette yourself against the skyline" (listing): https://www.marines.mil/Portals/1/Publications/FM%203-21.8%20%20The%20Infantry%20Rifle%20Platoon%20and%20Squad_3.pdf; FM 21-75 (1962 edition, dark outline against a lighter sky; listing): https://archive.org/download/MManuals/UsArmyVietnamCombatTrainSoldierPatrol1962_text.pdf
- Jaswal et al. (2013), "Decline in horizontal surface visibility over India (1961–2008)", Natural Hazards (listing): https://link.springer.com/article/10.1007/s11069-013-0666-2
- Punjab stubble-burning season (listing): https://www.deccanherald.com/amp/story/india%2Fpunjab%2Fpunjab-reports-seasons-highest-farm-fire-cases-at-1251-total-touches-9655-3281329, https://www.business-standard.com/india-news/punjab-records-283-stubble-burning-cases-highest-single-day-spike-125102901599_1.html
- IGP aerosols, the visibility definitions (MOR 5 % against 2 %) and the derived ~10 km: `docs/plans/atmosphere-plan.md` §6, `docs/plans/atmosphere-step2-direction.md` §6, decisions 178–180
- Middleton (1952), *The Estimation and Measurement of the Visual Range* (not reachable; its sky-to-ground table is unverified and not used): https://www.cmosarchives.ca/RMS/r0307.pdf
- Code read: `packages/sim-core/src/{sensors/eoir.ts,sim.ts,version.ts,dmath.ts,validate.ts}`, `packages/sim-core/scripts/export-demo-sessions.ts`, `packages/sim-core/test/{sun-eo,demo-sessions,fixture-logs}.ts`, `packages/shared/src/{threats,scenario}.ts`, `apps/api/app/services/scoring/{metrics.py,trees/default_v4.json}`, `apps/api/app/services/analytics/kill_chain.py`, `apps/api/app/seed/{scenarios.py,demo_history.py}`, `apps/api/app/seed/scenarios/src/*.json`, `apps/api/app/services/generator/environment.py`, `apps/web/lib/sim/{atmosphere-look,atmosphere-fog}.ts` (read only), `scripts/scenarios/build_scripted.py`, `render.yaml`, `docs/DEPLOY.md`
