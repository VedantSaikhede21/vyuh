# Atmosphere phase: research, plan and prompts

Written 2026-11-16. Phase 2 of the portfolio rebuild ("the player"), first part: make the 3D world look like a real place at a real time of day. Read this whole file before starting any step.

## 1. Where the code is today (read before changing anything)

- `apps/web/components/sim/environment.tsx`: background colour, **linear** `<fog>` (near/far), `SkyDome`, drei `<Stars>` at night, one `hemisphereLight` and one `directionalLight` from the sim's sun.
- `apps/web/components/sim/sky-dome.tsx`: custom gradient sky (horizon → zenith by sun elevation, plus a soft sun disc). No HDR, `toneMapped: false`, on purpose: an earlier drei `<Sky>` "blew out to white" (audit P1-3).
- `apps/web/lib/sim/environment-look.ts`: one function, `environmentLook(env, variant)`, turns the sim's sun and `weather` (`visibilityM`, `rainMmph`, `windMps`, `windDirDeg`, `cloudPct`) into colours, intensities and fog near/far. Variants `tactical` and `eo`.
- `apps/web/components/sim/terrain-mesh.tsx`: Lambert + `onBeforeCompile`, satellite colour, a baked shadow mask from a worker (`use-shadow-mask`), edge fade, LOD tiles.
- `apps/web/components/sim/sim-canvas.tsx`: **one** WebGL canvas, two drei `<View>`s (tactical and EO/IR), adaptive pixel ratio capped at 1.25. No post-processing library installed.
- `apps/web/lib/gpu-tier.ts`: quality tiers HIGH / MEDIUM / LOW (detail texture, shadow mask size, tree distance).
- Weather presets: `CLEAR`, `HAZE`, `FOG`, `RAIN`, `DUST` (`packages/shared/src/enums.ts`).
- Budget (SPEC §16): **≥ 30 fps on Intel UHD 620-class graphics at 1080p.**
- Live look (S15, Punjab, midday): high camera, one flat green, a plain grey sky band, haze the same everywhere, no visible sun direction, drones too small to see.

## 2. The standard take (what most web projects do)

A `Sky` shader from the three.js examples (Preetham model, with turbidity, rayleigh and mie settings) plus `scene.fog`, and an ACES tone map. It looks fine in a demo, but `FogExp2` is not physical: three.js computes it with **density and depth both squared**, unlike the textbook exponential (Beer–Lambert) fog, so it has no link to a real visibility in metres. And the Preetham sky is HDR: it needs tone mapping and exposure, which is why VYUH's earlier drei `<Sky>` blew out.

## 3. Research findings

### 3.1 Full physical atmosphere libraries
- **Takram `@takram/three-atmosphere`** (v0.19.1): Bruneton's precomputed atmospheric scattering for three.js and R3F, with sky, aerial perspective, sun and sky lights, stars (Yale Bright Star Catalogue, 9,096 stars) and the moon. Peers: three ≥ 0.170, postprocessing ≥ 6.36.7, R3F ≥ 9, drei ≥ 10, @react-three/postprocessing ≥ 3.
  - Costs for VYUH: it needs an `EffectComposer` with a normal pass and half-float buffers. Its "post-process lighting" mode needs **unlit materials**. Its frame is fixed to Earth-centred coordinates (place the scene with `worldToECEFMatrix`). It is GLSL only. Its docs give **no frame-time figures**. Volumetric light shafts are not implemented.
  - VYUH renders two `<View>`s in one canvas on integrated graphics, so it is a poor fit for the player now. It is a candidate for the landing hero later (one view, no FPS-critical HUD).
- **Hillaire 2020** ("A Scalable and Production Ready Sky and Atmosphere Rendering Technique", the Unreal Engine sky): LUT-based, and it scales from mobile to high-end PCs by changing LUT resolution and sample count. This is the reference if VYUH ever writes its own physical sky.
- **`@takram/three-clouds`**: volumetric clouds, beta, with temporal upscaling. Too heavy for the UHD 620 budget.

### 3.2 Cheap techniques that carry most of the look
- **Fog tied to real visibility (Koschmieder):** visual range V = 3.912 / β, from the eye's 2% contrast threshold. So the extinction β = 3.912 / `weather.visibilityM`, and the fog factor is exp(−β·d). VYUH already stores visibility in metres, so the render fog can match the number the sim uses.
- **Height fog (Inigo Quilez):** fog density that falls off exponentially with height has an analytic integral, so it is cheap in a shader. Haze sits in valleys and thins on ridges, which suits J&K. Quilez also shows tinting the fog towards the sun colour when looking near the sun, and separate RGB extinction and in-scattering.
- **Military image generators already do layered fog:** Aechelon's IG has a ground-fog layer with a base elevation and a transition band. Precedent that a fog layer is normal in defence sims.
- **Cloud shadows for almost nothing:** project a large tiling noise texture over the ground and scroll it with the wind. Games fake moving cloud shadows this way. VYUH already has `cloudPct`, `windMps` and `windDirDeg`.
- **Tone mapping:** AgX (in three since r160) handles bright, saturated light without the hue shifts of ACES; you may need to raise contrast. pmndrs postprocessing merges effects into one shader pass, if post-processing is ever added.

### 3.3 Real-place facts that make it VYUH, not a generic sky
- **Punjab (Indo-Gangetic Plain) is one of the haziest places on Earth.** It is a global hotspot for aerosols, PM2.5 rises sharply towards winter, and modelled aerosol optical depth is 0.5–1. Post-monsoon crop burning in Punjab and Haryana adds smoke, and winter fog follows western disturbances. **So PUNJAB_PLAINS should be milky and warm-grey, never crisp blue.**
- **J&K high altitude is the opposite.** The sky is darker blue up high because there is less air above to scatter light, and mountain blue is deeper because large aerosols thin out with height. **JK_MOUNTAIN gets a deep zenith, low turbidity and crisp distance, with haze only in valleys.**
- **Night is blue and grey to the eye (Purkinje shift).** At low light the eye's peak sensitivity moves towards blue, and colour fades towards grey ("all cats are grey at night"). Night renders should be desaturated and cool. This applies to the day camera and the tactical view, **not** the thermal (IR) view.

### 3.4 Drones you can see (input for a later step, not this one)
- In an airborne study, pilots missed a DJI Phantom in 28 of 40 close encounters, and the best detection was at 708 m. A small drone at a few hundred metres is close to invisible to the eye.
- MAK's VR-Vantage IG has an "eXaggerated Reality" mode. Precedent: the overview (tactical) view may use symbols and exaggerated markers, while the EO camera stays truthful.

### 3.5 Niche finds chosen for this phase
1. **Render fog = sim visibility (Koschmieder).** The haze you see is computed from the same `visibilityM` and the same 2% contrast rule the sensor model uses. Realism you can cite.
2. **A different sky per region:** Punjab haze from IGP aerosol data, J&K deep blue from altitude. Every scenario family gets its own character from cited physics.
3. **Night by human vision (Purkinje),** not just "dark blue".

### 3.6 Open questions
- No published frame-time figures for Takram on integrated graphics: measure before ever adopting it.
- Whether AgX or Neutral reads better with the satellite terrain textures: decide from stills.
- The existing tone-mapping setup per `<View>` and for the EO render target must be checked in code before changing it.

## 4. The plan (render-only: sim-core, scoring and the sim's sensor maths do not change)

Rules for every step:
- **No new dependency** unless a step says so and the user approves (CLAUDE.md rule 10). Everything below is shader work inside the existing stack.
- **Behind a switch:** keep the current look reachable (`?atmos=0`, or a graphics setting) until the user approves, so before/after stills come from the same build.
- **Track symbols, labels and zone colours keep exact colours:** `toneMapped: false` on their materials.
- **IR view untouched** except where a step names it.
- **Proof per step:** stills of S15 (Punjab, day), S05 and S11 (J&K), S12 or S13 (night) and one URBAN scenario, at 1366×768 and 1920×1080, using `pnpm --filter @vyuh/web render:stills`, before and after; FPS on S06 and URBAN D5 with the existing FPS spec; `pnpm lint`, `pnpm test`, `pnpm e2e` (new visual baselines are expected, so review them and say which changed).
- Log decisions in `docs/decisions.md`, and add every new source to `docs/realism-sources.md`.

Steps:
1. **Baseline and look targets.** Render "before" stills. Write a small `atmosphere-look.ts` table: per terrain preset (PUNJAB_PLAINS, JK_MOUNTAIN, URBAN) and weather preset, give turbidity, haze colour, zenith colour, height-fog base and falloff. Get approval of the table and the stills before shaders.
2. **Physical fog.** Replace linear fog with a shared GLSL chunk: Beer–Lambert with β = 3.912 / visibility, height falloff (Quilez analytic), and fog colour that brightens towards the sun. Apply it to terrain, buildings, trees and drones through `onBeforeCompile` (one place). The sky's horizon uses the same colour, so there's no seam. Tactical and EO use the same physics; the tactical view may cap density so the map stays readable (state the cap).
3. **Sky and light.** Upgrade `SkyDome` with sun-elevation colour (deep zenith in J&K, milky in Punjab), a sun disc and Mie glow, twilight colours below about 6° sun elevation, and the sun light colour and strength taken from the same table. Decide the tone mapping (AgX vs Neutral vs none) from stills; keep symbols untouched.
4. **Clouds and wind.** Scrolling cloud-shadow noise on the terrain material from `cloudPct` (coverage), `windMps` and `windDirDeg` (drift). Dim the sun light under heavy cover. Optional: one high cloud layer on the sky dome. No volumetric clouds.
5. **Night and twilight.** Moonlight from suncalc's moon position and phase; Purkinje: cool and desaturated day-camera and tactical views at night; stars fade with twilight; IR stays as it is.
6. **Quality tiers and close-out.** LOW: cheap fog (no height term), no cloud shadows. MEDIUM: everything except the sky cloud layer. HIGH: all. Re-measure FPS, update DESIGN.md (the 3D world section), CLAUDE.md §14, decisions and realism sources.

Later steps of the player phase (separate prompts once this is approved): a lower "watchtower" camera; drones you can see (EO truthful; tactical view with exaggerated markers, per §3.4); then the HUD.

## 5. Prompts for the new chat

Paste one at a time. Wait for the step's stills and say "approved" (or what to change) before the next.

### Prompt 1: baseline and look targets
```
We're starting the atmosphere phase of the VYUH player. Read docs/plans/atmosphere-plan.md in full first, then CLAUDE.md, then the files it lists in section 1. Don't change any code yet.

Do step 1 of the plan:
1. Render "before" stills of S15, S05, S11, S13 and one URBAN scenario at 1366×768 and 1920×1080 with the existing render:stills script (start what it needs; tell me if you need me to run something).
2. Propose apps/web/lib/sim/atmosphere-look.ts as a table, per terrain preset (PUNJAB_PLAINS, JK_MOUNTAIN, URBAN) and weather preset (CLEAR, HAZE, FOG, RAIN, DUST), with turbidity, haze colour, zenith colour, sun tint, height-fog base and falloff. Back each region's values with the sources in plan section 3.3.
3. Show me the stills and the table, then give me the plan for step 2 (files, approach, risks, how the switch to the old look works). Wait for my approval.

Rules: render-only, no sim-core changes, no new dependency, plain words, one recommendation at a time.
```

### Prompt 2: physical fog
```
Step 1 is approved (or: approved with these changes: …). Do step 2 of docs/plans/atmosphere-plan.md: the physical fog chunk (Koschmieder β = 3.912 / visibility, height falloff, sun-tinted fog colour), applied in one place to terrain, buildings, trees and drones, with the sky horizon matching. Keep the old look behind the switch. Show me before/after stills (same five scenarios, both sizes) and FPS on S06 and URBAN D5, then wait.
```

### Prompt 3: sky, light and tone mapping
```
Step 2 is approved. Do step 3 of docs/plans/atmosphere-plan.md: the upgraded sky dome and sun light from the look table, twilight colours, and the tone-mapping choice. Render each candidate (AgX, Neutral, none) on S15 and S05 so I can pick. Track symbols, labels and zones must keep their exact colours. Stills and FPS, then wait.
```

### Prompt 4: cloud shadows and wind
```
Step 3 is approved with tone mapping: <AgX/Neutral/none>. Do step 4 of docs/plans/atmosphere-plan.md: scrolling cloud shadows from cloudPct, windMps and windDirDeg, and the sun dimmed under heavy cover. No volumetric clouds. Show a short screen recording or three stills a few seconds apart, plus FPS, then wait.
```

### Prompt 5: night and twilight
```
Step 4 is approved. Do step 5 of docs/plans/atmosphere-plan.md: moonlight from the moon's position and phase, the Purkinje night look (cool, desaturated) on the day camera and tactical views, stars fading with twilight, and the IR view unchanged. Stills of S12 and S13 at night and one scenario at dusk, plus FPS, then wait.
```

### Prompt 6: quality tiers and close-out
```
Step 5 is approved. Do step 6 of docs/plans/atmosphere-plan.md: the LOW / MEDIUM / HIGH split, a final FPS pass on S06 and URBAN D5 at both sizes, pnpm lint, pnpm test and pnpm e2e (review and list the visual baselines that changed), then update DESIGN.md (3D world), CLAUDE.md §14, docs/decisions.md and docs/realism-sources.md. Remove the old-look switch only if I say so. Give me a short summary, then stop.
```

## 6. Sources

- Takram three-geospatial / three-atmosphere: https://github.com/takram-design-engineering/three-geospatial, README https://cdn.jsdelivr.net/npm/@takram/three-atmosphere@0.18.0/README.md, package https://cdn.jsdelivr.net/npm/@takram/three-atmosphere/package.json
- Takram three-clouds: https://cdn.jsdelivr.net/npm/@takram/three-clouds@0.7.4/README.md
- Hillaire 2020, EGSR: https://diglib.eg.org/handle/10.1111/cgf14050, slides https://blog.selfshadow.com/publications/s2020-shading-course/hillaire/s2020_pbs_hillaire_slides.pdf
- Inigo Quilez, Better fog: https://iquilezles.org/articles/fog/
- three.js FogExp2 squared terms: https://lightrun.com/answers/mrdoob-three-js-introduce-fogexp-and-consider-refactoringfoglinear
- Koschmieder / meteorological visibility: https://reference.org/facts/visibility/reqevMCQ, Horvath & Noll 1969 https://data.zhenzhi.com/details/1/1007281454
- Aechelon IG ground fog layer: https://docs.aechelon.com/aechelon-products-documentation/Working-version-Branch-TBD/Unrestricted/nova-lightning
- Cloud shadow trick: https://threadreaderapp.com/thread/1659208008491208704, https://mirzabeig.substack.com/p/unity-tutorial-fake-cloud-shadows
- Tone mapping: https://discourse.threejs.org/t/is-agx-tonemapping-implemented-correctly/60609, https://pmndrs.github.io/postprocessing/public/docs/file/src/enums/ToneMappingMode.js.html, https://github.com/pmndrs/postprocessing
- IGP aerosols and haze: https://link.springer.com/10.1038/s41598-020-62710-8, https://acp.copernicus.org/articles/24/6635/2024/
- Altitude and sky colour: https://www.webexhibits.org/causesofcolor/14D.html, https://www.vaia.com/en-us/textbooks/physics/conceptual-physics-12-edition/chapter-27/problem-81-why-is-the-sky-a-darker-blue-when-you-are-at-high
- Purkinje / night vision: https://history.siggraph.org/?p=114629, https://community.acescentral.com/t/all-cats-are-grey-at-night-render-theory-question/4511
- Drone visual detection: https://scitechdaily.com/dangerous-close-encounters-skilled-aircraft-pilots-usually-cannot-spot-an-encroaching-drone/, https://www.volpe.dot.gov/news/gregory-woo-receives-stanley-n-roscoe-aviation-human-factors-award
- MAK VR-Vantage (eXaggerated Reality): https://docs.mak.com/support/VR-Vantage_3.2_Users_Guide.pdf
- Primland (camera-led terrain experience, trees instanced for performance): https://www.commarts.com/webpicks/primland-luxury-blue-ridge-mountain-resort
