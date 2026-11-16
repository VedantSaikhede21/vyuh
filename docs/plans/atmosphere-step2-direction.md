# Atmosphere step 2: review of step 1 and direction for the physical fog

Written 2026-11-16, after the step-1 report (20 before-stills, the proposed `atmosphere-look.ts` table, the step-2 plan). Read this together with `docs/plans/atmosphere-plan.md`. Where the two differ, this file wins.

**Verdict: approve step 1, with seven changes.** The table points in the right direction for every region, and the step-2 plan is sound. But the haze colour and thickness of the sky can disagree with the ground, the preset rule invents a weather the generator never makes, and a strict physical fog would hide contacts the sim says you can identify. The changes below fix those before any shader is written.

## 1. Checked against the code

Everything here was read in the repo or in `node_modules` on 2026-11-16.

| Claim in the report | What the code says | Result |
|---|---|---|
| The EO sensor uses visibility as its range cap | `eoLevel()` in `packages/sim-core/src/sensors/eoir.ts`: `if (target.rangeM > cap) return null`, with cap = `visibilityM` (×1–1.5 for IR). Inside the cap, the level comes from Johnson cycles only. **There is no contrast or haze term.** | True, but see change 6 |
| Buildings and trees share materials between the two views | `DAY_MATERIAL` in `buildings-mesh.tsx` and `MATERIAL` in `vegetation-mesh.tsx` are module-level singletons | True (risk 1 is real) |
| drei `<View>` may not give a per-view hook | drei 10.7.9 `web/View.js` line 106 calls `state.gl.render(scene, camera)` once for each view's own scene | Solved: `scene.onBeforeRender` runs before each view's draw |
| three adds fog after converting colours for the screen | three 0.186.1 `meshlambert.glsl.js`: `tonemapping_fragment`, then `colorspace_fragment`, then `fog_fragment` | True |
| Fog colour has to be prepared differently per view | `refreshFogUniforms` sets `fogColor` with `getUnlitUniformColorSpace(renderer)`: the output colour space for the screen, the working (linear) space for a render target | Solved: use three's own `fogColor` uniform and the conversion happens per view automatically |
| Today's terrain fog | `terrain-material.ts` replaces `fog_fragment` with `smoothstep(fogNear, fogFar, vFogDepth)` and its own `uHorizon`, converted to sRGB by hand when `encoded` | It uses **view depth**, not distance (change 7) |

## 2. The seven changes

### Change 1: keep the 3.912 constant, and write down why
The report uses Koschmieder's β = 3.912 / V. That constant comes from a 2% contrast threshold. The WMO's meteorological optical range (MOR), which is what visibility sensors and weather reports give, is defined at 5% instead (β = 2.996 / V). The IALA dictionary notes that 2% is the ideal laboratory value, and that a visibility on that basis is called the "meteorological range" (Normsichtweite).

**Keep 3.912 anyway.** VYUH's EO sensor drops a contact exactly at `visibilityM`. With 3.912, the rendered contrast reaches 2%, about the limit of sight, at that same distance, so a contact fades out as the sim drops it. With 2.996 it would still show at 5% contrast when the sim says it can't be seen. Log this as a decision, quoting both definitions.

### Change 2: work out turbidity from the visibility; don't pick it by hand
The table picks turbidity (how milky the sky is) per row, while the ground haze comes from the scenario's visibility. Those two can disagree: a sky drawn milky over clear ground, or the other way round.

Preetham's model, which three's `Sky` uses, defines turbidity as the ratio of the optical thickness of the hazy atmosphere (haze plus molecules) to that of molecules alone: T = (t_m + t_h) / t_m. Every input can be estimated:

- **Molecules (t_m):** the Hansen–Travis formula as quoted by NOAA, τ_R = 0.008569·λ⁻⁴·(1 + 0.0113·λ⁻² + 0.00013·λ⁻⁴) at sea level and 1013.25 hPa, gives **0.097 at 550 nm**. Scale it by pressure with height: exp(−altitude / 8000 m), the standard 8 km scale height.
- **Haze (t_h):** the haze extinction at the ground times the depth of the haze layer. Extinction at the ground is 3.912 / V minus the molecular part, about 13.2 × 10⁻⁶ per metre at sea level. With the table's shape (constant up to `base`, then thinning with e-folding height `falloff`), the column is exactly β_haze × (base + falloff).

So **T = 1 + β_haze·(base + falloff) / t_m**, clamped to [1.7, 20]. The SLIB notes on Preetham say the model fails below 1.3.

Check against the cited data:
- **Punjab:** IGP aerosol optical depth (AOD) of 0.5–1 gives T ≈ 1 + 0.5/0.094 = 6.3 up to 1 + 1/0.094 = 11.6. The report's 7 and 12 match.
- **J&K:** Hanle (4,500 m, trans-Himalaya) has a yearly mean AOD at 500 nm of 0.042, and 0.031 in winter. At the map's floor of 2,431 m (t_m ≈ 0.072), an AOD of 0.05–0.1 gives T ≈ 1.7–2.4. The report's 2.2 matches.

**But S15 shows the problem:** with 20 km visibility and the Punjab CLEAR layer (300 + 1000 m), the derived T is about 3.5, not 7. A 20 km day is cleaner than typical IGP air. With an AOD of 0.5 in a 1.3 km layer, Koschmieder gives a ground visibility of about 10 km. **Use the derived T.** The sky and ground then always agree, and S15 looks as clear as its own data says. If Punjab should look milkier, change the scenario's visibility (open decision A), not the sky.

**The table loses its turbidity column.** The sky shader in step 3 reads `turbidityFor(look, weather, altitude)`.

### Change 3: haze depth follows the season in the plains
The depth of the layer haze can mix into changes a lot through the year over the IGP. In summer that ceiling reaches 2,000 m or more by day; by winter it drops by several hundred metres, and the same pollution is packed into a space about five times smaller.

**Change:** PUNJAB_PLAINS and URBAN `base` and `falloff` depend on the scenario's month:

| Months | base | falloff | Layer (base + falloff) |
|---|---|---|---|
| Nov–Feb (winter) | 150 m | 400 m | 550 m |
| Mar–Jun (pre-monsoon) | 600 m | 1,200 m | 1,800 m |
| Jul–Oct (monsoon, post-monsoon) | 400 m | 900 m | 1,300 m |

These are representative values, labelled as such. The FOG row stays shallow (50 / 100 m) in every season. J&K doesn't change by season: its haze stays in the valleys, as the report proposed.

### Change 4: valley fog in J&K is real; keep the report's FOG row
Kashmir's winter brings dense valley fog; Srinagar has reported visibility under 50 m. The report's J&K FOG row (base 100 m, falloff 150 m, blue sky above) fits. Cite the reports as "valley fog in winter" and keep the hex colours as representative.

### Change 5: replace the preset rule
The report's rule can output DUST, which no scenario can use yet. Its fog limit (1.5 km) also isn't a standard one. The India Meteorological Department counts fog when visibility drops to 1,000 m or less.

**New rule:**
- rain > 0 → RAIN
- visibility ≤ 1,000 m → FOG (IMD definition)
- visibility ≤ 5,000 m → HAZE
- anything else → CLEAR

DUST rows stay in the table but are never chosen until a desert map exists. PROCEDURAL_HILLS uses the PUNJAB_PLAINS rows, as the report recommends. Re-list which scenarios land in which preset under the new rule.

**URBAN:** keep it slightly hazier than Punjab. Winter fog and haze are frequent over megacities such as Delhi, Kolkata, Karachi, Lahore and Dhaka. Cite that, and drop the "my own pick" note.

### Change 6: fog must not hide a contact the sim says you can see
Inside the visibility cap, the sim grades a contact by size and zoom only (Johnson cycles); haze plays no part. Physical fog makes it fade sooner. At 0.8 × V, Koschmieder leaves exp(−3.13) ≈ 4% contrast, almost invisible, while the sim may report IDENTIFY. A trainee would be marked down for missing something the screen didn't show.

**Change:** terrain, buildings and trees get the full physical fog. **Contact models in the EO view get a contrast floor of 0.2**, which fades to 0 between 0.9 V and V, so a contact disappears where the sim drops it. Military image generators have a precedent: MAK's VR-Vantage has an "eXaggerated Reality" mode. Log it as a deliberate trainer choice. The tactical view keeps its own markers and is not affected.

The proper fix is in the sim: add atmospheric contrast to `eoLevel()`. That is open decision B, not part of this phase.

### Change 7: measure fog by distance, not by view depth
three's `vFogDepth` is −mvPosition.z: depth along the camera's view direction. Turning the camera changes it for the same point, so haze appears to slide at the edges of the screen. **Use the true distance, `length(worldPos − cameraPosition)`.** three declares `cameraPosition` in every fragment shader, and inside a drei View it is that view's camera.

## 3. How step 2 is built

### 3.1 Files
- **New `apps/web/lib/sim/atmosphere-look.ts`:** the table (colours, base and falloff by region, season and preset); `presetFor(weather)` (change 5); `layerFor(preset, region, month)` (change 3); `betaFor(visibilityM)`; `turbidityFor(...)` (change 2); `transmittance(distance, camY, pointY, params)`, a TypeScript copy of the shader maths for tests.
- **New `apps/web/lib/sim/atmosphere-fog.ts`:** the GLSL chunk (3.3); `withAtmosphereFog(material, kind)`, where kind is `'ground' | 'contact'`; one shared uniforms object; `bindAtmosphere(scene, variant, look)`, which sets `scene.onBeforeRender` to write that view's values.
- **New `apps/web/lib/sim/atmosphere-switch.ts`:** `atmosEnabled()` reads `?atmos=0` once.
- **Edit `lib/terrain/terrain-material.ts`:** replace the custom `fog_fragment` block with the chunk. The edge fade uses three's `fogColor`, so `uHorizon` and the manual sRGB conversion go away. The old block stays behind the switch.
- **Edit `buildings-mesh.tsx`, `vegetation-mesh.tsx`, `contact-model-mesh.tsx`:** wrap the materials once. Buildings also get the edge fade, which fixes the villages floating past the map edge.
- **Edit `environment.tsx`:** keep a three `Fog` on each view's scene, so `USE_FOG` and `fogColor` stay set. Its near/far values are ignored by the chunk but kept for the old look. Call `bindAtmosphere`.
- **Edit `sky-dome.tsx`:** the horizon colour equals the fog colour, so distant ground and sky meet without a seam.
- **Edit `tactical-view.tsx`, `components/hud/eo-view.tsx` and every other scene that renders `Environment`:** pass the terrain preset and the scenario month.
- **New `apps/web/test/atmosphere-look.test.ts`:** see 3.5.

### 3.2 Per-view values without cloning materials
One uniforms object is shared by every wrapped material. Each view's scene gets an `onBeforeRender` that writes β, base height, falloff, sun direction, sun tint and, in EO, the contact floor, right before that view draws. drei draws each view with its own `gl.render(scene, camera)` call, and three uploads uniforms at draw time, so each view gets its own values. Each wrapped material needs a `customProgramCacheKey` that includes `atmos`, so three doesn't reuse a program without the chunk.

### 3.3 The chunk (replaces `#include <fog_fragment>`; same place as today)
```glsl
// vertex: varying vec3 vAtmosWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;  (instanceMatrix applied for instanced meshes)
uniform float uAtmosBeta;        // 3.912 / visibility used by this view
uniform float uAtmosTopY;        // world y where the even haze ends (map floor + base)
uniform float uAtmosFalloff;     // e-folding height above it (m)
uniform vec3  uAtmosSunDir;      // world, unit, towards the sun
uniform vec3  uAtmosSunTint;     // same colour space as fogColor (converted in JS per view)
uniform float uAtmosFloor;       // 0 for ground; 0.2 for EO contacts
varying vec3  vAtmosWorld;

// Mean of exp(-max(y,0)/H) along a straight path between heights a and b (relative to uAtmosTopY).
float atmosMeanDensity(float a, float b, float H) {
  float lo = min(a, b), hi = max(a, b);
  if (hi <= 0.0) return 1.0;                          // all inside the even layer
  float span = hi - lo;
  if (span < 1.0) return exp(-max(0.5 * (a + b), 0.0) / H);  // near-level ray: no division by ~0
  float l0 = max(lo, 0.0);
  float above = H * (exp(-l0 / H) - exp(-hi / H));    // exact integral above the layer top
  return (max(-lo, 0.0) + above) / span;
}

#ifdef USE_FOG
  vec3 aD = vAtmosWorld - cameraPosition;
  float aT = length(aD);                              // distance, not view depth (change 7)
  float aMean = atmosMeanDensity(cameraPosition.y - uAtmosTopY, vAtmosWorld.y - uAtmosTopY, uAtmosFalloff);
  float aTrans = exp(-uAtmosBeta * aMean * aT);       // Beer–Lambert / Koschmieder
  float aRangeFrac = aT * uAtmosBeta / 3.912;         // distance / visibility
  aTrans = max(aTrans, uAtmosFloor * (1.0 - smoothstep(0.9, 1.0, aRangeFrac)));  // change 6
  float aSun = pow(max(dot(aD / max(aT, 1e-3), uAtmosSunDir), 0.0), 8.0);         // Quilez sun glow
  vec3 aAir = mix(fogColor, uAtmosSunTint, 0.5 * aSun);
  gl_FragColor.rgb = mix(aAir, gl_FragColor.rgb, aTrans);
#endif
```
Notes:
- **Why the mean-density form, not Quilez's closed form:** the closed form divides by the ray's vertical slope (`rd.y`), which tends to 0/0 for a level view, and level views are most of the EO camera's. The mean-density form is the exact integral for the table's two-part shape (even layer, then exponential), with no division by a tiny slope.
- **The blend still happens after tone mapping and sRGB conversion,** as today. That is not physically ideal: Beer–Lambert should blend in linear light. But moving it changes the look together with the tone mapping, so it belongs in step 3. Note it there.
- **Glow:** the exponent 8 is Quilez's. The 0.5 weight is a starting point to tune from the stills.

### 3.4 Values per view
- **EO:** β = 3.912 / `visibilityM` (the truth), contact floor 0.2.
- **Tactical:** β = 3.912 / max(2.5 × visibility, 20,000 m), contact floor 0. Tune it from the stills and report the final number. Keep decision 167's darkened tactical sky until step 3.
- **IR view:** untouched (its own materials, cold sky).
- **Track symbols, labels, zones, sites:** not wrapped. Keep `toneMapped: false` where they already have it.

### 3.5 Tests (vitest; GLSL can't be unit tested, so the TypeScript copy is)
- `transmittance(V, y, y, flat)` = 0.02 ± 0.0005 when the camera and point are inside the even layer.
- The mean density is 1 below the layer top, and it equals exp(−Δ/H) on a level path at Δ above it. It is continuous across the layer top (no jump within 1 m).
- `turbidityFor`: Punjab with AOD-equivalent inputs of 0.5 and 1 gives about 6.3 and 11.6; J&K CLEAR with 40 km visibility gives a value between 1.7 and 2.6. It is clamped to [1.7, 20].
- `presetFor`: the rule edges (1,000 m, 5,000 m, rain), never DUST.
- `layerFor`: each season band for PUNJAB_PLAINS and URBAN, constant for JK_MOUNTAIN, PROCEDURAL_HILLS mapped to PUNJAB_PLAINS.
- **Contact floor:** 0.2 at 0.5 V, 0 at V, and the plain physical value beyond it.

### 3.6 Proof before asking for step-3 approval
- **Stills:** after-stills from the same scratch script with `?atmos=0` and `?atmos=1`, the same five scenarios × two shots × two sizes, laid side by side. Plus one EO still of S15 with a contact at about 0.8 V, showing it is still visible.
- **FPS:** S06 and URBAN D5 at 1366×768 and 1920×1080 on a production build, before and after. Expect under a 2% change (one `exp` and one `length` per pixel).
- **Checks:** `pnpm lint`; `pnpm test`; `pnpm e2e`, listing each visual baseline that changed and why; `pnpm gen:schemas` with no diff (no schema change); no change under `packages/sim-core`.
- **Docs:** `docs/decisions.md` (next free numbers: the 3.912 choice; derived turbidity; the season layer; the EO contact floor; distance not depth) and `docs/realism-sources.md` (every source in section 6).

## 4. The revised table (colours as the report proposed; turbidity is now derived)

| Region | Preset | Haze | Zenith | Sun tint | Base / falloff |
|---|---|---|---|---|---|
| PUNJAB_PLAINS, URBAN* | CLEAR | `#c4c0b4` | `#7d98b0` | `#fff0d8` | by season (change 3) |
| | HAZE | `#bdb5a3` | `#a3a8a8` | `#ffe6c4` | by season |
| | FOG | `#c9c9c4` | `#b4b7b8` | `#fff4e6` | 50 / 100 m |
| | RAIN | `#8e969c` | `#6f7a84` | `#e8ecf0` | 0 / 1,500 m |
| JK_MOUNTAIN | CLEAR | `#b4c6d8` | `#2b5c9e` | `#fffaf0` | 0 / 300 m |
| | HAZE | `#b6c0c8` | `#4a74a4` | `#fff4e4` | 100 / 500 m |
| | FOG | `#c3c8cc` | `#6d86a3` | `#fff8ee` | 100 / 150 m |
| | RAIN | `#959ea6` | `#75808b` | `#e6ebf0` | 0 / 800 m |

\*URBAN uses its own colours from the report (browner haze). Its season layer is the Punjab one with base and falloff × 0.8 (a lower, trapped smog layer); label it representative. DUST rows are kept but never selected. All values are labelled "representative" in code and docs.

## 5. Open decisions for the user (not part of step 2)
- **A. Realistic visibility in the Punjab scenarios.** S15's 20 km is clean for the IGP: about 10 km fits an AOD of 0.5, and the IMD fog limit is 1,000 m. Lowering it changes the EO range cap, so it is a sim-data change: demo logs re-recorded, `SIM_VERSION` checked. **Recommendation: yes, as its own small task after the atmosphere phase.**
- **B. Haze in the EO sensor model.** Add atmospheric contrast to `eoLevel()` so the sim and the picture agree without the contact floor. It is a sim and scoring change with a determinism test, needs `SIM_VERSION` + 1, and needs its own plan. **Recommendation: later, after the player redesign.**

## 6. Sources
- Visibility definitions: MOR at 5% and the 2% "meteorological range" (IALA dictionary, from WMO) https://www.iala.int/wiki/dictionary/index.php/Meteorological_Optical_Range, https://iala.int/wiki/dictionary/index.php/Meteorological_Visibility; Met Office https://weather.metoffice.gov.uk/guides/observations/how-we-measure-visibility; Koschmieder equation and sea-level Rayleigh extinction https://cavac.at/cavacopedia/Visibility
- Preetham turbidity definition: https://www.scribd.com/document/546352919/sunsky (paper text), https://courses.cs.duke.edu/fall01/cps124/resources/p91-preetham.pdf; the lower limit https://sources.debian.org/src/slib/3b1-4/daylight.scm
- Rayleigh optical depth formulas (Hansen–Travis, Bodhaine): https://www.gml.noaa.gov/grad/neubrew/docs/RayleighInBrewer.pdf; 8 km scale height https://docs.rs/crate/siderust/0.8.0/source/src/atmosphere/rayleigh.rs
- IGP aerosols (AOD 0.5–1): https://link.springer.com/10.1038/s41598-020-62710-8; winter fog https://acp.copernicus.org/articles/24/6635/2024/; megacity fog and haze https://acp.copernicus.org/articles/20/14457/2020/acp-20-14457-2020.pdf
- IGP boundary layer by season: https://codeblue.galencentre.org/2024/01/whats-inside-northern-indias-winter-smog/, https://eastmojo.com/environment/2024/01/19/whats-inside-northern-indias-winter-smog/
- IMD fog definition (≤ 1,000 m): https://science.thewire.in/?p=473797
- Hanle AOD (high-altitude background): https://dspace.uohyd.ac.in/handle/1/2738, https://ui.adsabs.harvard.edu/abs/2012AGUFM.A51A0010L
- Kashmir valley fog: https://www.dtnext.in/news/national/intense-cold-wave-continues-in-kashmir-valley-dense-fog-in-srinagar-affects-normal-life-757000
- Height fog and sun glow: https://iquilezles.org/articles/fog/
- Exaggerated Reality precedent: https://docs.mak.com/support/VR-Vantage_3.2_Users_Guide.pdf
- Code checked: `packages/sim-core/src/sensors/eoir.ts`, `apps/web/lib/terrain/terrain-material.ts`, `apps/web/components/sim/{buildings-mesh,vegetation-mesh}.tsx`, drei 10.7.9 `web/View.js`, three 0.186.1 `meshlambert.glsl.js`, `WebGLMaterials.js`, `UniformsUtils.js`.
