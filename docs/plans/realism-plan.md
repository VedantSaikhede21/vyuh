# VYUH realism plan

Date: 2026-11-16. Status: proposed, waiting for your approval.
This plan replaces steps 4 to 6 of `atmosphere-plan.md`. Steps 1 to 3 of that plan stay as built.

---

## 1. The new rule

The player must look as close to real footage as a browser allows. Looks come first.

What changes:

| Before | Now |
|---|---|
| Each terrain preset at most about 10 MB | No size limit. Big files load in stages. |
| FPS budget on integrated graphics | No budget. One floor only: 30 fps at 1920×1080 on your own machine on High. |
| Ask before every new dependency | Rendering dependencies listed in this plan are pre-approved. Anything else still gets asked. |
| "Clean and minimal" 3D | Dense and detailed 3D. |

What does not change:

1. **Rendering only.** `packages/sim-core`, scoring, replay and the API are not touched. The determinism test must pass after every step.
2. **The sensors decide what is visible, not the graphics.** If the sim says the camera cannot see a drone at 6 km in haze, the picture must agree. The haze law from atmosphere step 2 (fog strength = 3.912 ÷ visibility) stays the rule.
3. **A plain look stays available.** The current look becomes the "Plain" setting. `?atmos=0` keeps working. Weak machines and the e2e tests use Plain.
4. **No real military data.** Assets are civilian: trees, houses, commercial drones.
5. **Every step ends with before and after stills for you to approve.** No step is done on a report alone.

Because this breaks rules in `CLAUDE.md` (§10 FPS line, §12 size limit, golden rule 10), the first task logs a decision in `docs/decisions.md` and edits those lines. Nothing diverges silently.

---

## 2. What the research found

### The standard way (what everyone does)

A sky shader, distance fog, a satellite photo stretched over the terrain, low-poly trees, grey box buildings. This is what VYUH has now. It looks like a map, not a place, as soon as the camera gets close to the ground. The EO camera zooms in a lot, so VYUH is close to the ground all the time.

### Niche finds (what will make VYUH look different)

1. **Level of detail must follow zoom, not distance.** Every tree system picks detail by distance from the camera. VYUH's EO camera has a narrow field of view, so a tree 3 km away can fill a quarter of the screen. Detail must be chosen by size on screen. No off-the-shelf demo does this; ours must.
2. **Punjab trees stand in lines, not in forests.** Poplar, eucalyptus and dek are planted in single rows on field edges and along irrigation channels. Scattering trees randomly would look wrong to anyone who has seen Punjab from the air. Rows will sell the place.
3. **The Punjab roofline has water tanks, and in Doaba they are sculptures.** Villages around Jalandhar put concrete tanks shaped like aeroplanes, footballs, tractors and army tanks on rooftops. A few of these on the skyline is a detail nobody else would add, and it is real and cited.
4. **A Kashmir house today is two storeys of unplastered brick under a shining pitched tin roof.** The roofs catch the sun. From the air, a J&K village is a scatter of bright roofs among dark conifers. That glint is the look to get.
5. **The J&K map sits inside the conifer belt.** The map floor is 2,431 m. Fir grows mostly at 2,400 to 3,000 m and reaches 40 to 60 m tall; blue pine and deodar mix in below; birch forms the tree line above about 3,200 m. Our trees are 15 m cones. Real ones are three times taller, and species should change with height on the slope.
6. **Thermal cameras freeze for a moment.** Real uncooled thermal cameras close a shutter to recalibrate; the image pauses with a soft click. They also show faint fixed stripes of noise. Adding a light version of both makes the IR view read as a real sensor.
7. **Tiled ground textures give themselves away from the air.** The eye locks onto the repeat. There are published fixes (hex tiling, and a cheaper two-sample method by Inigo Quilez). Without one of them, close-up ground detail will look worse than no detail.
8. **Flight simulators already solved "satellite photo plus building outlines".** Microsoft Flight Simulator builds its world from aerial photos, building footprints and tree detection, then generates region-styled houses and trees. VYUH already has the same three inputs (`albedo.jpg`, `buildings.geojson`, `cover.png`). We copy the method, at small scale.
9. **Fields change with the month.** The satellite photo shows one season. Punjab wheat is green in winter and gold in April; paddy fields are flooded in early summer; stubble is burnt in October and November (which is also the haze season already in our look table). Tinting fields by scenario date ties the ground to the sky.

### Things checked and rejected

- **Google Photorealistic 3D Tiles.** Would give real 3D scans. Rejected: the terms forbid caching and offline use, so the Docker build and stills would break; coverage of rural Punjab and J&K is unverified.
- **WebGPU now.** Rejected for now. The Takram clouds package is still "work in progress" on WebGPU, and R3F, drei and our shaders are WebGL. Revisit after this plan.
- **HDRI photo skies.** Good-looking but frozen: one sun position per photo. Our sun moves with scenario date and time. Use them only as a fallback for night stars.

---

## 3. Quality settings

Three settings, chosen in Settings and by `lib/gpu-tier.ts`:

| Setting | What it is | Who gets it |
|---|---|---|
| Plain | Today's look (atmosphere steps 1 to 3) | Weak machines, e2e tests, `?atmos=0` |
| High | Everything in this plan, medium clouds, half-resolution effects | Default on a discrete GPU |
| Ultra | Everything at full quality | Stills, video capture, strong machines |

Stills for approval are always taken on High. Ultra is the same code with quality numbers raised; nobody tunes it, it is for portfolio stills and video.

---

## 4. Reference shots

Every step is judged on the same eight shots, 1920×1080, saved by one script (`pnpm --filter @vyuh/web render:reference`) into `apps/web/e2e/reference/<step>/`.

| # | Shot | Why |
|---|---|---|
| 1 | S15, tactical view, day | Punjab plains overview |
| 2 | S15, EO camera zoomed on a drone at about 2 km | Contact against haze |
| 3 | S15, EO camera looking across a village at low angle | Houses and trees up close |
| 4 | S05, tactical view, day | J&K mountains overview |
| 5 | S05, EO camera along a forested slope | Conifers and ridgelines |
| 6 | S13, night, IR mode | Thermal look |
| 7 | URBAN D5 seed 2, EO camera down a street | Dense buildings |
| 8 | S06, dusk or dawn (time set by URL) | Low sun, long shadows, clouds lit from below |

Each step's report shows these eight before and after, side by side.

---

## 5. Priority order

Ordered by how much of the screen each one changes. Sky and ground fill every frame, so they go first.

| Order | Step | Size | Fills how much of the frame |
|---|---|---|---|
| R0 | Ground rules, reference shots, asset pipeline | Small | Nothing visible. Needed by all. |
| R1 | Takram test (time-boxed) | Small | Decides R2 |
| R2 | Sky, sun, clouds, shadows | Large | Top half of every frame, and all lighting |
| R3 | Ground detail | Large | Bottom half of every frame |
| R4 | Trees | Large | J&K slopes, Punjab field lines |
| R5 | Houses and village clutter | Large | EO close-ups, urban preset |
| R6 | Roads, water, rain | Medium | Lines that organise the land |
| R7 | Drones and birds | Medium | Small on screen, but the subject |
| R8 | Camera finish (EO and IR sensor look) | Medium | Every frame of the EO view |
| R9 | Staged loading and final tuning | Medium | Nothing visible. Makes it shippable. |

After R9: player layout, then briefing → play → result → replay flow, then other screens, then the landing page. Those are outside this plan.

---

## 6. The steps

### R0. Ground rules, reference shots, asset pipeline

**Do**
- Log the decision; edit `CLAUDE.md` §10, §12 and rule 10; add a short "Rendering" section to `docs/SPEC.md` §16 with the three settings.
- Build the reference-shot script (section 4). Capture the "before" set now.
- Asset pipeline, in `scripts/assets/`: every model goes through `gltf-transform optimize --compress meshopt --texture-compress ktx2`. Loaders set up once in `apps/web/lib/assets/` (KTX2Loader, MeshoptDecoder).
- `docs/assets.md`: one row per asset: name, source link, author, licence, original size, shipped size. This extends `docs/realism-sources.md`.
- Where big files live: keep them out of git history. Use Git LFS, or put them in Supabase Storage (already in the stack) and load by URL. Recommend Supabase Storage with a local copy for the offline Docker build. Check Vercel's static file limits before choosing.
- Uncap frame rate for measuring: try Chrome flags `--disable-frame-rate-limit --disable-gpu-vsync` in the FPS spec so costs can be seen above 120 fps.

**Done when** the before set of eight stills exists, and one test model loads through the pipeline as KTX2 + meshopt.

### R1. Takram test (two working sessions at most)

Takram's `@takram/three-atmosphere` and `@takram/three-clouds` give a physically based sky, sun and sky light colours, volumetric clouds, cloud shadows and light shafts. The test answers five questions on S15 and S05 in a throwaway route `/dev/takram`:

1. **Two views.** VYUH draws one canvas with two drei `<View>`s. Takram's effects run in a full-canvas `EffectComposer`, and the clouds keep frame history for one camera. Can each view get its own composer and cloud history? If not, can the EO view render to its own target with its own composer?
2. **Our materials.** Use Takram's forward-lighting mode (`SunLight`, `SkyLight`) so the existing terrain, building and tree materials keep working. Does it look right without rewriting them?
3. **Our haze law.** Takram's air is clean-air scattering. Our haze layer (visibility-driven, region table) must still sit on top, without doubling. Proposed split: Takram does the clear air, our fog chunk does only the haze part. Does S15 at 6 km visibility still lose a contact exactly at 6 km?
4. **Contacts.** Drones are drawn after Takram's haze pass with our own fog rule and contrast floor. Do they stay visible as designed?
5. **Sun agreement.** Takram places the sun from date and position; the sim uses suncalc. The two directions must agree within 0.5°.

Also record: frame time on High and Ultra, download size, any ghosting on moving drones.

**Decision rule**
- Questions 1, 3 and 4 all pass → Takram becomes the sky and cloud system (R2 path A).
- Question 1 fails but the rest pass → Takram in the tactical view only; EO view keeps our sky plus a cloud layer rendered from Takram's shadow and coverage data if possible (path B).
- Question 3 or 4 fails → keep our sky and haze, add clouds a different way (path C: a cloud dome with scrolling noise and a matching shadow texture).

**Done when** you have a one-page report with the five answers, numbers, and four stills (S15 and S05, tactical and EO).

### R2. Sky, sun, clouds, shadows

**Do** (path A assumed)
- Sky, sun disc and moon from Takram. Stars at night.
- Sun and sky light colours from Takram into the scene lights, so the ground at dusk turns warm on its own.
- Clouds: map scenario weather to cloud settings.

| Weather preset | Coverage | Cloud type | Base height above ground |
|---|---|---|---|
| CLEAR | 0.1 to 0.2 | Fair-weather cumulus | 1,500 to 2,000 m |
| HAZE | 0.2 | Thin high cloud, washed out | 3,000 m and above |
| FOG | 0.3 above the fog | Ground layer as a thin low cloud layer | 0 to 200 m |
| RAIN | 0.8 to 1.0 | Thick layered cloud | 600 to 1,200 m |

  J&K: cloud base often sits below the ridgelines, so peaks poke through. Seeded from the scenario seed so replay shows the same sky. Values are representative; log them in `docs/realism-sources.md`.
- Cloud movement from scenario wind (`localWeatherVelocity`).
- Cloud shadows on the ground (replaces old step 4).
- Light shafts on Ultra only.
- Real-time shadows for trees and buildings near the camera: three.js cascaded shadow maps, 3 to 4 splits. The baked terrain shadow mask stays for far terrain.
- Night (replaces old step 5): moonlight from real moon phase, stars, the blue-shifted dim look, village lights (comes with R5).

**Watch for**
- Cloud ghosting behind fast drones. If seen, lower `temporalUpscale` reliance in the EO view on Ultra.
- IR view: clouds must not be drawn as white daylight clouds. In IR, sky is cold (dark in white-hot), clouds slightly warmer.

**Done when** shots 1, 4 and 8 look like photographs of weather, and shot 2 still drops the contact at the visibility limit.

### R3. Ground detail

The satellite photo is right from far away and blurred up close. Keep it for colour; add detail under it.

**Do**
- **Land-cover map.** `cover.png` already exists. Check its classes against ESA WorldCover (10 m, free, CC BY 4.0: tree cover, shrubland, grassland, cropland, built-up, bare, snow and ice, water, wetland). If ours is coarser, rebuild from WorldCover in `scripts/terrain/build_display.py`.
- **Detail materials** per class, from Poly Haven and ambientCG (both CC0): colour, normal, roughness at 2K, KTX2. Starting set:

| Class | Punjab | J&K |
|---|---|---|
| Cropland | Ploughed soil; wheat stubble; young green crop | Terraced field soil |
| Grassland | Dry grass | Alpine meadow grass |
| Bare | Packed earth | Scree, bare rock |
| Built-up | Packed earth, concrete | Packed earth, gravel |
| Tree floor | Leaf litter | Pine needle floor |
| Steep slopes | n/a | Cliff rock, drawn with triplanar mapping |
| Snow | n/a | Snow above a season-dependent line |

- **Blend rule.** Satellite photo gives the hue. Detail texture gives brightness variation, normals and roughness. Detail fades in by size on screen (so EO zoom triggers it), fully in at about 2 cm per pixel, gone beyond about 2 m per pixel.
- **No visible tiling.** Use the two-sample method by Inigo Quilez first (cheap); move to hex tiling if repeats still show in shot 3.
- **Terrain normals** from the heightmap at full resolution so slopes catch light.
- **Field season tint** for Punjab cropland by scenario month (niche find 9). Tint only, small range, logged as representative.
- Switch the terrain to a physically based material so wet ground (R6) and low sun work.

**Done when** shot 3 and shot 5 show ground that holds up at full zoom, and shot 1 shows no repeating pattern.

### R4. Trees

**Species (representative; heights are typical adult ranges)**

| Preset | Where on the map | Species | Height | Shape |
|---|---|---|---|---|
| J&K | Below about 2,400 m | Blue pine, deodar | 25 to 45 m | Deodar: wide, drooping tiers. Pine: open, long needles |
| J&K | 2,400 to 3,000 m | Fir, spruce | 35 to 55 m | Narrow dark cones |
| J&K | Above about 3,200 m | Birch, thinning out | 6 to 12 m | Pale trunks, sparse |
| J&K | Valley floor, near houses | Poplar, willow, chinar | 15 to 30 m | Poplar: narrow columns in rows |
| Punjab | Field edges, channels, roads | Poplar, eucalyptus | 20 to 35 m | Tall, thin, in single rows |
| Punjab | Village edges, yards | Dek, shisham, mulberry, kikar | 8 to 20 m | Round, spreading crowns |
| Urban | Streets, compounds | Neem-like round crowns, a few palms | 8 to 18 m | Round |

**Do**
- Make each species with EZ-Tree (MIT licence, exports GLB) from its pine, aspen, ash and oak presets, tuned to the shapes above. Three variants per species. Use Poly Haven scanned trees where a close match exists.
- Three detail levels per tree: full mesh, a simplified mesh, and an octahedral impostor (a flat card that shows the right picture from any angle). Use `@three.ez/instanced-mesh` (InstancedMesh2), which culls with a BVH and switches levels per instance. The published demo runs 200,000 trees this way.
- **Switch levels by size on screen** (niche find 1), using each view's field of view.
- Placement: keep `vegetation.bin` positions for forests; pick species by altitude for J&K. For Punjab, add a new placement pass in `scripts/terrain/`: rows along field boundaries (edges between cropland patches in the cover map) and along OSM waterways and roads, spacing 3 to 6 m, with gaps.
- Wind sway in the vertex shader, driven by scenario wind. Leaves let some light through (cheap back-lighting term).
- Trees cast shadows (near: real shadows; far: a dark blob in the terrain shader).
- Tree density stays as the sim's LOS model expects. If LOS uses tree cover, the picture must not show clear air where the sim blocks sight, or the reverse. Check `sim-core` LOS inputs before changing density, and report any mismatch instead of fixing it in the sim.

**Done when** shot 5 shows a mixed conifer slope with species changing uphill, shot 1 shows tree lines along Punjab fields, and zooming the EO camera onto a far tree never shows a flat card.

### R5. Houses and village clutter

**Method:** generate each house from its OSM footprint (the flight-simulator method), not hand-placed models.

| | Punjab village | J&K village | Urban |
|---|---|---|---|
| Storeys | 1 to 2 | 2 to 3 | 2 to 5 |
| Walls | Brick, or plaster in white, cream, pale pink, pale green | Unplastered brick; some timber-laced walls | Plaster, concrete |
| Roof | Flat, with a low parapet wall | Pitched tin sheet, shining, with dormer projections | Flat |
| On the roof | Black plastic water tank on most; stair hut; a few sculpture tanks | Chimney pipe | Tanks, dishes |
| Around it | Courtyard and boundary wall, cattle shed, fodder stack | Wood store, small orchard | Shops at street level |

**Do**
- Generator in `apps/web/lib/world/house-gen.ts`: footprint → walls with a window and door texture atlas → roof by region → roof props (instanced). Seeded by building id so replay matches.
- Materials from Poly Haven and ambientCG: brick, plaster, corrugated metal, concrete. Dirt and rain streaks by a second texture so walls are not uniform.
- Prop kit, about 15 small models (CC0 from Poly Haven, Quaternius, Kenney, or made in Blender): plastic water tank, three sculpture tanks, electric pole with wires, transformer, tube-well hut, hay stack, tractor and trolley, boundary wall pieces, gate, mobile tower, hand pump, parked motorbike, charpai, satellite dish.
- Night: some windows lit warm, a few street lights. Seeded.
- IR: roofs and walls get a simple heat value by material and time of day (tin roof hot by day, cold at night; lit rooms warm). Representative only.
- Building heights and positions stay exactly as the sim's LOS uses them.

**Done when** shots 3 and 7 read as a Punjab village and a town street, and a J&K EO shot shows tin roofs glinting among trees.

### R6. Roads, water, rain

- **Roads and tracks** from OSM, drawn as strips that follow the terrain: tarmac, dirt track, field path. Roads organise an aerial view more than any other single feature.
- **Canals and rivers** from OSM waterways and the water class: Punjab canals are straight, tree-lined, slow and green-brown; J&K streams are narrow, fast, with white water on rocks. Water uses sky reflection, depth tint, and flow direction.
- **Flooded paddy** in Punjab for June and July scenarios: a thin water sheet on cropland patches.
- **Rain** (RAIN preset): streaks near the camera, wet ground (darker, shinier, puddles in low spots), drops and trails on the EO lens, lower cloud base (already in R2). Rain must match the sim's rain value.

**Done when** shot 1 shows roads and a canal, and a RAIN scenario still looks wet with the camera at rest.

### R7. Drones and birds

- Redo the seven contact models with full materials: plastic, carbon, metal, scuffs. Keep licences listed.
- Rotors: spinning blades blend into a blurred disc with speed.
- Navigation and status lights at night where a commercial drone would have them; a "dark" drone has none (it is then found by IR only, which is the lesson).
- Birds: wing-beat animation in the vertex shader, different rates for small and large birds, soaring with wings held for large ones. Flocks already move in the sim; this only animates the body.
- IR: motors and battery warm, body cool; birds evenly warm. This is the visual difference a trainee should learn. Representative.
- Per-object motion blur in the EO view on Ultra.
- Size on screen stays truthful. No enlarging drones to make them easier to see.

**Done when** shot 2 shows a drone you could identify by type at EO zoom, and shot 6 shows drone and bird differing in IR.

### R8. Camera finish

Effects chain, in order: scene → ambient occlusion (N8AO, half resolution on High) → clouds → aerial perspective → contacts → bloom (sun glints, tin roofs, lights) → anti-aliasing (SMAA; temporal AA on Ultra if cloud ghosting allows) → tone mapping (Neutral, as decided in step 3) → sensor look.

**EO day camera look**
- Sensor noise that grows as light falls.
- Slight softening and shimmer at long zoom over hot ground (Punjab, summer, midday). Tie strength to range, time of day and season.
- Small shake at maximum zoom, eased by the tracker when locked.
- Video compression feel: slight blockiness in fast pans, off by default, on in Ultra.
- No lens flares, no chromatic fringes, no film grain. Those read as a game.

**IR camera look**
- White-hot image built from per-material heat values (R5, R7), not from a filter over the day picture.
- Fine fixed stripe noise, barely visible.
- Recalibration freeze (niche find 6): once every few minutes the picture holds for about 0.3 s. This touches what the trainee sees while tracking, so it is **off by default and your decision**. It would be seeded so replay matches.
- Hot objects bloom slightly.

**Tactical view** stays clean: no sensor effects, slightly dimmed sky (as decided).

**Done when** shot 2 and shot 6 could pass for frames from a real camera feed.

### R9. Staged loading and final tuning

- Load order: Plain world first (playable in seconds) → terrain detail → trees → houses → clouds. A small labelled progress line, per `docs/DESIGN.md`.
- Settings page: Plain, High, Ultra, with a one-line cost note each.
- Auto-pick the setting from the GPU tier; drop one level if frame rate stays under 30 for 10 seconds, and say so.
- Regenerate e2e visual baselines on Plain only, so tests stay stable.
- Re-render landing stills and briefing thumbnails on Ultra.
- Update `docs/DEPLOY.md` for asset hosting; update the offline Docker build to include or skip the Ultra assets.
- Final reference set, all eight shots, before against after.

---

## 7. Pre-approved dependencies

| Package | For | Licence |
|---|---|---|
| `@takram/three-atmosphere`, `@takram/three-clouds`, `@takram/three-geospatial` | Sky, clouds | MIT |
| `postprocessing`, `@react-three/postprocessing` | Effects chain (Takram needs them) | Zlib, MIT |
| `n8ao` | Ambient occlusion | Check licence at install |
| `@three.ez/instanced-mesh` | Tree instancing, culling, detail levels | MIT |
| `@dgreenheck/ez-tree` | Tree generation (build-time script) | MIT |
| `@gltf-transform/cli` (dev) | Model compression | MIT |
| Octahedral impostor code from `agargaro/octahedral-impostor` | Tree impostors | Check licence at install |

Each licence is confirmed at install and written into `docs/assets.md`.

---

## 8. Risks

| Risk | What we do |
|---|---|
| Takram cannot handle two views | Decision rule in R1 has paths B and C |
| Your machine (AMD integrated) cannot hold 30 fps on Ultra | High becomes your default; Ultra is for stills and video |
| Picture and sim disagree (trees, haze, buildings) | Each step checks against sim inputs; mismatches are reported, never patched in the sim |
| Asset hunting eats weeks | Generate first (EZ-Tree, house generator); buy or scan nothing |
| Repo bloat | Assets outside git history (R0) |
| e2e baselines churn | Tests pinned to Plain |
| Scope creep | One step at a time, stills approved before the next |

---

## 9. Prompts for the build chat

### Prompt 1 (R0 + R1)

```
Read CLAUDE.md, then docs/plans/realism-plan.md sections 1, 3, 4, 6 (R0, R1) and 7.
Direction changed: the player now aims for maximum realism. Rendering only; sim-core,
scoring and replay are not touched.

Task A (R0):
1. Log the decision in docs/decisions.md and edit CLAUDE.md §10, §12 and golden rule 10
   as section 1 of the plan says. Add the three quality settings to SPEC §16.
2. Build the reference-shot script from section 4 and capture the "before" set of eight
   stills at 1920×1080.
3. Set up the asset pipeline (gltf-transform with meshopt + KTX2, loaders in
   apps/web/lib/assets) and docs/assets.md. Prove it with one existing GLB.
4. Propose where big assets live (Git LFS or Supabase Storage). Do not move anything yet.

Task B (R1), time-boxed: build /dev/takram as a throwaway route with
@takram/three-atmosphere and @takram/three-clouds on S15 and S05. Answer the five
questions in R1 with evidence. Do not wire it into the player.

Plan first and wait for my approval before editing. Finish with: the eight before
stills, four Takram stills, the five answers, frame times, download size, and which
path (A, B or C) the decision rule gives. Do not add Claude as co-author in commits.
```

### Prompts 2 to 9 (one per step, same shape)

```
Read CLAUDE.md and docs/plans/realism-plan.md section 6, step R<n>, plus the "does not
change" rules in section 1. Build step R<n> only. Plan first (files, approach, assets
with source and licence, risks) and wait for approval. Rendering only. Check any world
content against what sim-core uses for line of sight and visibility, and report
mismatches instead of changing the sim. Finish with the eight reference shots before
and after on High, frame time on High, new download size, docs/assets.md
rows, and the determinism test result. Do not start the next step.
```

Bring each report back to this chat for review before approving.

---

## 10. Sources

Atmosphere and clouds
- Takram three-geospatial (atmosphere, clouds, WebGPU status): https://github.com/takram-design-engineering/three-geospatial
- three-clouds README (limitations, quality presets, shadows): https://cdn.jsdelivr.net/npm/@takram/three-clouds@0.7.4/README.md

Ground
- ESA WorldCover 10 m, classes and licence: https://developers.google.com/earth-engine/datasets/catalog/ESA_WorldCover_v200
- Inigo Quilez, texture repetition: https://iquilezles.org/articles/texturerepetition
- Mikkelsen, Practical Real-Time Hex-Tiling (JCGT 2022): https://jcgt.org/published/0011/03/05/paper.pdf
- ambientCG licence (CC0): https://docs.ambientcg.com/license
- Poly Haven (CC0 textures, models, HDRIs): https://polyhaven.com

Trees
- EZ-Tree: https://github.com/dgreenheck/ez-tree
- Octahedral impostors with InstancedMesh2: https://github.com/agargaro/octahedral-impostor
- J&K forest zones and Punjab farm-boundary plantations: see `atmosphere-plan.md` research notes (earlier session)

Houses
- Kashmir house today (two storeys, unplastered, pitched CGI roof): https://mohsinpeerzada.blogspot.com/2023/02/the-traditional-kashmiri-house-saga-of.html
- Rural Kashmir roof and wall types: https://de.slideshare.net/razarizwanraza/rural-of-kashmir-architecture
- Dhajji dewari (World Housing Encyclopedia): https://world-housing.net/?p=46376
- Punjab rooftop water tank sculptures: https://www.tribuneindia.com/news/features/doabas-outlandish-water-tank-art-256227 and https://www.thebetterindia.com/59025/water-tank-shapes-punjab/
- Punjab village house materials and courtyards: https://www.homelane.com/blog/?p=44668

Camera
- Thermal camera recalibration (NUC) freeze and fixed pattern noise: https://trends.directindustry.com/raythink-raytron-industrial/project-4602863-1185560.html and https://www.mdpi.com/1424-8220/22/23/9458
- Rain as a coupled system (streaks, wet surfaces): https://advances.realtimerendering.com/s2006/Chapter3-Artist-Directable_Real-Time_Rain_Rendering_in_City_Environments.pdf

Rejected options
- Google Map Tiles API policies (caching limits): https://developers.google.com/maps/documentation/tile/policies

Not verified, to check during the steps
- Tree heights in section R4 are typical ranges, not measured for these sites.
- Cloud base heights in R2 are representative.
- Field season tints follow the usual Punjab wheat and paddy calendar; exact months vary.
- Licences of `n8ao` and the impostor code.
- Whether Chrome's frame-rate flags uncap FPS on your machine.
