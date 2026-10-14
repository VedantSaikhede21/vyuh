# Realism sources

Every data source, model, asset and incident inspiration used in VYUH is listed here. All numeric values in the simulator are **representative** — drawn from public commercial-drone specs and textbook physics, tuned for training, not accuracy. No real or classified military data is used anywhere.

## Terrain (DEM, OSM)

- **`PROCEDURAL_HILLS` (Phase 1):** generated in code (`packages/sim-core/src/terrain.ts`) from seeded value noise; 12 km square, ~60 m relief, flat within 400 m of the origin. No external data. Real DEM presets arrive in Phase 2.

## Sun, weather

- Phase 1 uses a fixed daytime sun direction and clear weather for rendering only; suncalc and Open-Meteo arrive in Phase 2.

## Sensor models (radar, EO/IR, RF, micro-Doppler)

- **Radar detection range ∝ RCS^¼** (SNR ∝ σ / R⁴): the radar range equation, e.g. M. I. Skolnik, *Introduction to Radar Systems*, 3rd ed., McGraw-Hill, 2001, ch. 2. Pd is modelled as a logistic function of SNR (dB) around the reference point (0.01 m² at `refRangeM` → Pd 0.5, slope 2 dB). This is a training simplification of textbook Pd-vs-SNR curves, not a fitted model of any real radar.
- **Measurement noise:** Gaussian, σ = 10 m in range and 1° in bearing. Representative values.
- **Track confirmation, 3 hits in 5 scans; drop after 4 misses:** the M-of-N logic described in S. Blackman and R. Popoli, *Design and Analysis of Modern Tracking Systems*, Artech House, 1999. The specific numbers are from SPEC §5.
- **EO view (Phase 1):** a plain narrow-FOV perspective camera (30° to 1.5° horizontal). Johnson criteria and the thermal model arrive in Phase 2.

## Threat library (drone classes and specs)

- `CLASS_PROFILES` in `packages/shared/src/threats.ts` uses the SPEC §7 table (size, RCS, max speed). All values are **representative**.
  - Small-quadcopter speeds (15–20 m/s) are the range given on public spec sheets of consumer camera quadcopters.
  - A small-multirotor RCS of about 0.01 m² is an order-of-magnitude figure, not a measurement of any specific airframe.
- **Turn and climb rates** are not in the SPEC table. They are representative values chosen to give plausible flight paths (e.g. small quad 120°/s, 5 m/s climb). They are not taken from any specific product.
- **Intercept effectiveness** (Pkill 0.9 close in, 0.4 at maximum range; range, ammo and cooldown per scenario) is an abstract training rule (SPEC §8). It is not derived from any real system.

## Behaviours and incident inspirations

- **ATTACK_RUN** (S01–S03): a low approach ending in a terminal dive on the defended position, about 34° below the horizon. Inspired in general terms by widely reported use of small commercial drones to deliver payloads. No specific incident, location or unit is modelled. The defended position "Post Alpha" and the scenario origin are fictional.

## 3D models and other assets (licence + author)

- Small-quad mesh: built in code from primitive shapes (`apps/web/components/sim/drones.tsx`). No external asset.
- Sky: drei `<Sky>` shader (MIT, pmndrs/drei), based on the three.js Sky example (MIT).
