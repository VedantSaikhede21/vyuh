# Realism sources

Every data source, model, asset and incident inspiration used in VYUH is listed here. All numeric values in the simulator are **representative** — drawn from public commercial-drone specs and textbook physics, tuned for training, not accuracy. No real or classified military data is used anywhere.

## Terrain (DEM, OSM)

- **`PROCEDURAL_HILLS` (Phase 1):** generated in code (`packages/sim-core/src/terrain.ts`) from seeded value noise; 12 km square, ~60 m relief, flat within 400 m of the origin. No external data. Its "origin" (27.0 N, 74.0 E) is fictional and only used for the sun.
- **DEM: Copernicus DEM GLO-30** (30 m, public release), downloaded from the public AWS Open Data bucket `s3://copernicus-dem-30m/` (https://copernicus-dem-30m.s3.amazonaws.com/). Tiles used: `Copernicus_DSM_COG_10_N30_00_E075_00_DEM` (PUNJAB_PLAINS) and `Copernicus_DSM_COG_10_N33_00_E075_00_DEM` (JK_MOUNTAIN). Licence: free of charge for any use under the Copernicus DEM licence; required attribution, carried in each preset's `meta.json`: *"© DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA; all rights reserved."*
- **Processing:** `scripts/terrain/build_preset.py` reprojects the DEM (bilinear, rasterio/GDAL) onto a 512 × 512 local azimuthal-equidistant grid centred on the preset origin, 14 km square (27.4 m per sample), heights relative to the origin elevation (SPEC §14).
- **Preset areas (generic, vetted):**
  - `PUNJAB_PLAINS`: centre 30.520 N, 75.700 E — open farmland and villages (Chhapa, Lohgarh, Kasba, Kutba, Manal…), 232–250 m. About 130 km from the International Border.
  - `JK_MOUNTAIN`: centre 33.750 N, 75.875 E — uninhabited high valley in the Kishtwar/Warwan ranges, 2,431–5,315 m. About 85 km from the LoC.
  - Both were checked against OpenStreetMap for `landuse=military`, `military=*`, `aeroway=*`, `power=plant` and `waterway=dam` within the box plus a 10 km buffer: none found. The nearest such features were ≥ 18 km (Punjab) and ≥ 42 km (J&K) away. "Post Alpha" and all scenario positions are fictional.
- **Buildings: OpenStreetMap** footprints via osmnx/Overpass, © OpenStreetMap contributors, licensed under the Open Database License (ODbL) 1.0 (https://www.openstreetmap.org/copyright). Heights from `height`, else `building:levels` × 3 m, else 2 levels (6 m, representative). OSM coverage is sparse: 41 footprints in PUNJAB_PLAINS; JK_MOUNTAIN was built while Overpass was unreachable (`buildingsStatus: UNAVAILABLE`; OSM shows essentially no buildings there).
- **Line of sight:** straight-segment sampling every ~10 m against the bilinear heightmap and building footprints (point-in-polygon + roof height), a standard terrain-masking approach (e.g. viewshed analysis in GIS). Representative: no Earth curvature or refraction (negligible within 14 km for this purpose).
- **Snow on the 3D terrain** above 4,300 m is a rendering choice (representative western-Himalayan snow line), not data.

## Sun, weather

- **Sun position: suncalc 1.9.0** (V. Agafonkin, BSD-2-Clause), which implements the formulas from *Astronomy Answers* (https://aa.quae.nl/en/reken/zonpositie.html). Computed at the preset origin with the preset's UTC offset (IST = UTC+5:30).
- **Night = sun more than 6° below the horizon:** civil twilight definition (e.g. US Naval Observatory, "Rise, Set, and Twilight Definitions").
- **Fog/haze** is driven by the scenario's `visibilityM` (render fog distance; EO range cap). Live weather (Open-Meteo) is not yet used.

## Sensor models (radar, EO/IR, RF, micro-Doppler)

- **Radar detection range ∝ RCS^¼** (SNR ∝ σ / R⁴): the radar range equation, e.g. M. I. Skolnik, *Introduction to Radar Systems*, 3rd ed., McGraw-Hill, 2001, ch. 2. Pd is modelled as a logistic function of SNR (dB) around the reference point (0.01 m² at `refRangeM` → Pd 0.5, slope 2 dB). This is a training simplification of textbook Pd-vs-SNR curves, not a fitted model of any real radar.
- **Measurement noise:** Gaussian, σ = 10 m in range and 1° in bearing. Representative values.
- **Track confirmation, 3 hits in 5 scans; drop after 4 misses:** the M-of-N logic described in S. Blackman and R. Popoli, *Design and Analysis of Modern Tracking Systems*, Artech House, 1999. The specific numbers are from SPEC §5.
- **Radar LOS masking (Phase 2 Part A):** a contact with no line of sight to the radar is not detected (Pd × 0).
- **Ground clutter (Phase 2 Part B):** Pd × 0.4 for a contact below 15 m AGL within 2 km horizontal range. Low targets near the ground compete with clutter returns (Skolnik, *Introduction to Radar Systems*, 3rd ed., ch. 7). The factor and thresholds are representative training values (SPEC §6.1).
- **Rain attenuation (Phase 2 Part B, decision 50):** specific attenuation γ = k · R^α dB/km with k = 0.0101, α = 1.276 — the X-band (10 GHz, horizontal polarisation) values of the original ITU-R Recommendation P.838 table (*Specific attenuation model for rain for use in prediction methods*; current revision P.838-3 gives slightly different coefficients). Applied as a two-way path loss on the SNR (2 · γ · range km). Representative: one frequency for every radar, no polarisation or rain-cell geometry.
- **Track filter (Phase 2 Part B, decision 51):** a 2D alpha-beta (g-h) filter, α 0.5, β 0.2, with the track extrapolated every tick between scans (Blackman & Popoli, *Design and Analysis of Modern Tracking Systems*, ch. 4; P. R. Kalata, "The tracking index: a generalized parameter for α-β and α-β-γ target trackers", *IEEE Trans. Aerospace and Electronic Systems* 20(2), 1984). Gains are representative, not tuned to any radar.
- **EO video auto-track (decision 52):** radar "slew-to-cue" followed by a video tracker that holds the target is the usual pattern of C-UAS EO/IR sensors, as described in public overviews such as A. Holland Michel, *Counter-Drone Systems*, 2nd ed., Center for the Study of the Drone at Bard College, 2019. Acquisition after 0.5 s near the frame centre, a 1 s drop-out tolerance and a 2 %-of-FOV pointing jitter are representative.
- **RF detector (Phase 2 Part B, decision 53):** passive detection of drone control/video links with a direction-finding bearing (± a few degrees) and no range; silent for drones that do not emit (pre-programmed GNSS flight, fibre-optic control). Described in general terms in Holland Michel (2019). Bands (2.4 / 5.8 GHz) are the common consumer ISM bands; bearing error and range are per scenario and representative.
- **Birds as radar false alarms:** small radars that detect small drones also detect birds of similar RCS; separating them is a known C-UAS problem (Holland Michel 2019; micro-Doppler literature, e.g. V. C. Chen, *The Micro-Doppler Effect in Radar*, Artech House, 2011). Bird RCS values (0.005 / 0.02 m²) are order-of-magnitude figures from SPEC §7.
- **EO/IR, Johnson criteria:** J. Johnson, "Analysis of image forming systems", *Image Intensifier Symposium*, Fort Belvoir, 1958; as used in e.g. G. C. Holst, *Electro-Optical Imaging System Performance*, SPIE Press. Cycles = pixels on target / 2, with pixels = target size / (range × IFOV) and IFOV = horizontal FOV / horizontal pixels. Thresholds: detect 1, recognise 4, identify 6.4 cycles (SPEC §6.2; the classic 50 % probability values are 1 / 4 / 6.4 — later work uses 8 for identification, so ours is mildly optimistic).
- **EO camera:** 30°–1.5° horizontal FOV, 640 × 360 (day) and 640 × 512 (IR, S11/S12). Representative of commercial pan-tilt-zoom surveillance cameras; not a specific product.
- **Thermal contrast per class** (`thermalContrast`, 0.4–1.0) scales the IR cycles: small electric drones have little heat signature (motors and batteries only), larger and engine-driven aircraft more, birds are warm-blooded. **Representative** values chosen for training, not measurements.
- **IR range cap = 1.5 × visibility:** long-wave IR penetrates haze better than visible light but not fog. Representative factor.

## Threat library (drone classes and specs)

- `CLASS_PROFILES` in `packages/shared/src/threats.ts` uses the SPEC §7 table (size, RCS, max speed). All values are **representative**.
  - Small-quadcopter speeds (15–20 m/s) are the range given on public spec sheets of consumer camera quadcopters.
  - A small-multirotor RCS of about 0.01 m² is an order-of-magnitude figure, not a measurement of any specific airframe.
- **Turn and climb rates** are not in the SPEC table. They are representative values chosen to give plausible flight paths (e.g. small quad 120°/s, 5 m/s climb). They are not taken from any specific product.
- **Intercept effectiveness** (Pkill 0.9 close in, 0.4 at maximum range; range, ammo and cooldown per scenario) is an abstract training rule (SPEC §8). It is not derived from any real system.
- **Typical control links per class** (`typicalLinks`, SPEC §7 table) and the class `category` (drone / bird / manned aircraft) are representative groupings, not product data. The `threat_types` table is seeded from them via a generated file (decision 49).
- **EW effectiveness (decision 54):** jamming works against RF-controlled drones and not against GNSS-autonomous or fibre-optic ones; GNSS spoofing works against GNSS-navigating drones (A. J. Kerns, D. P. Shepard, J. A. Bhatti, T. E. Humphreys, "Unmanned aircraft capture and control via GPS spoofing", *Journal of Field Robotics* 31(4), 2014; Holland Michel 2019). The ±10° sector, P = 0.9 (jam) / 0.8 (spoof), ranges and cooldowns are abstract training values. Effects are deliberately coarse (link lost / route drifts); this is a decision trainer, not an EW simulator.
- **Link-loss behaviour:** on loss of the control link, consumer drones typically hover and land, or return to their home point, depending on settings and situation (failsafe / "return-to-home" sections of public consumer-drone user manuals). VYUH maps attack runs and swarms to hover-and-land and every other behaviour to return-home (representative).

## Behaviours and incident inspirations

- **ATTACK_RUN** (S01–S03): a low approach ending in a terminal dive on the defended position, about 34° below the horizon. Inspired in general terms by widely reported use of small commercial drones to deliver payloads. No specific incident, location or unit is modelled. The defended position "Post Alpha" and the scenario origin are fictional.
- **S11 Ridge Line / S12 Night Watch** (Phase 2 test scenarios): a heavy quad using a valley side for terrain masking, and a night approach that needs thermal imaging to identify. General tactics (terrain masking, night flights) only; no specific incident.
- **Fibre-optic FPV (S13 Silent Ridge):** inspired by the widely reported battlefield use, from 2024, of FPV drones controlled over a fibre-optic cable, which emits nothing for an RF detector to hear and cannot be jammed (public news coverage of the Russia–Ukraine war). No specific incident, place or unit is modelled.
- **Bird flocks (S13, S14):** flocking motion uses Reynolds' boids model (C. W. Reynolds, "Flocks, herds, and schools: a distributed behavioral model", *SIGGRAPH '87*, Computer Graphics 21(4)), with a leader flying the scenario path and a random altitude wander. Weights and limits are representative.
- **Friendly drone without ID (S14 Mixed Sky):** identification/IFF ambiguity with own drones and the risk of jamming them along with a hostile in the same sector (the SPEC §8 "also jams friendly drones in range" constraint). General problem only; no specific incident.

## 3D models and other assets (licence + author)

- Contact meshes (quad, fixed-wing, bird, helicopter): built in code from primitive shapes (`apps/web/components/sim/drones.tsx`), scaled to each class's size. No external asset. Bird wingbeat (3–6 Hz) is a display effect only.
- **Affiliation symbols:** simplified, domain-agnostic APP-6 / MIL-STD-2525 frames — hostile diamond, friendly circle, neutral square, unknown quatrefoil — always with the letter H/F/N/U (NATO APP-6(D) *Joint Military Symbology*; US MIL-STD-2525D). Real symbology uses different frames per battle dimension; ours are simplified for a single air picture.
- Sky: drei `<Sky>` shader (MIT, pmndrs/drei), based on the three.js Sky example (MIT). Night sky: drei `<Stars>` (MIT).
- IR display: a custom white-hot shader (noise + blur) written for VYUH; no external asset.
- **Typeface:** IBM Plex Sans, IBM Plex Sans Condensed and IBM Plex Mono, © 2017 IBM Corp., SIL Open Font License 1.1 (`apps/web/app/fonts/OFL.txt`). woff2 files taken unmodified from IBM's npm packages `@ibm/plex-sans` 1.1.0, `@ibm/plex-sans-condensed` 2.0.0 and `@ibm/plex-mono` 2.5.0 (https://github.com/IBM/plex), self-hosted via `next/font/local` (decision 60).
- **Login background** (`apps/web/public/landing/login-hillshade.png`): hillshade (sun azimuth 315°, altitude 45°) of the committed JK_MOUNTAIN preset, which is derived from Copernicus DEM GLO-30 (attribution under Terrain above, and shown on the page). Generated by `pnpm gen:hillshade` (`scripts/hillshade/gen-hillshade.ts`, Node stdlib only).
