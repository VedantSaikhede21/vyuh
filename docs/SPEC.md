# VYUH — Detailed Project Spec

> Place at `docs/SPEC.md`. `CLAUDE.md` holds the rules; this file holds the *what* and *how*. Sections are referenced as SPEC §N.
> All numeric values below are **representative placeholders** for a training simulator, drawn from public commercial-drone specs and textbook sensor physics. They are tuned for gameplay, not accuracy, and every source must be logged in `docs/realism-sources.md`.

---

## §1. Problem & users

**Problem (PS 26247):** Drones and swarms are now decisive on the battlefield. Current training (classroom + limited live drills) is costly, weather-dependent and gives too few repetitions. A software trainer is needed for recognising, classifying and responding to drone/swarm threats across realistic scenarios, usable at unit level with minimal hardware.

**Users & roles**
| Role | Can do |
|---|---|
| Trainee | Run assigned or free-practice scenarios, see own results, AAR, debriefs, trends |
| Instructor | Everything a trainee can + build/generate scenarios, assign to unit/users, view unit dashboard, edit scoring tree weights |
| Admin | Manage units, users, threat library, terrain presets |
| Guest (demo) | Run curated demo scenarios with a guided tour; data auto-deleted after 24 h |

---

## §2. Feature list (with priority)

**P0 — must have for any demo**
- Kill-chain gameplay loop: detect → track → identify → decide → respond → assess.
- 3D tactical view, radar scope, EO/IR camera view, contact list, action bar.
- Scenario JSON loading; at least 3 scripted scenarios.
- Event logging, server-side decision-tree scoring, result screen.

**P1 — the realism differentiators**
- Real-DEM terrain presets with line-of-sight masking.
- Real sun position (day/dusk/night), thermal view at night.
- Sensor models with degradation; RF detector that misses silent drones.
- False contacts: birds, friendly drone, civilian hobby drone, manned helicopter.
- Threat behaviours (recon loiter, smuggling drop, attack run, swarm saturation, decoy).
- ROE zones and abstract response effectiveness rules (e.g. jamming does nothing vs fibre-optic).
- Seeded procedural generator + difficulty levels.

**P2 — the "this team thought deeply" layer**
- AAR: replay with timeline scrubber, kill-chain stage breakdown, trends, unit dashboard.
- Structured contact report (what / where / how many / heading / time) scored for accuracy.
- AI-assist panel that is sometimes wrong + over-trust metric.
- Micro-Doppler spectrogram view for classification.
- Elo-based adaptive difficulty.
- LLM debrief; text-to-scenario for instructors.

**P3 — bonus**
- Live weather toggle (Open-Meteo).
- WebXR VR mode.
- Two-seat team mode (sensor operator + commander).

---

## §3. Architecture details

### 3.1 Client loop
- `sim-core` runs a **fixed 20 Hz tick** (50 ms) driven by an accumulator in a `useSimLoop` hook. Render runs at display rate and **interpolates** positions between the last two ticks.
- Sim state = plain objects (arrays of contacts, sensors, effectors, tracks). Renderer and HUD subscribe via a thin zustand selector bridge — they never mutate sim state.
- Trainee actions are dispatched as commands to sim-core (`sim.dispatch({type:'CLASSIFY', trackId, class})`), which applies them on the next tick and emits the corresponding event. This keeps replay deterministic: replay = re-run scenario + re-apply the logged commands at the same ticks.
- Event batcher flushes every 2 s and on session end; retries with backoff; stores unsent batches in memory (and `sessionStorage` best-effort) so a flaky network doesn't lose a session.

### 3.2 Server
- **Generator** builds full scenario JSON from a `ScenarioRequest` (preset, time of day, weather, difficulty, threat mix, swarm size, seed). Python, seeded `random.Random(seed)`.
- **Scoring** runs on `POST /sessions/{id}/complete`: loads scenario ground truth + event log → runs plausibility checks → computes per-contact metrics → evaluates decision tree → stores score.
- **Analytics** computes AAR aggregates on read (small data; no warehouse needed) and updates Elo on completion.
- **AI service** wraps the LLM: one client, prompt templates in files, Pydantic-validated JSON output, retries once, falls back to templates.

### 3.3 Trust boundary
- The server trusts sensor events from the client for MVP but **validates plausibility**: monotonic `t_ms`, within session duration, contact ids exist in scenario, no sensor detection before contact spawn, no classification before detection, batch size ≤ 500, total events ≤ 20 000.
- Scores are never accepted from the client.

### 3.4 Determinism contract
- Same scenario JSON + same command log ⇒ identical sim state at every tick, in browser and in Node (vitest).
- RNG: `mulberry32` seeded from scenario seed, with **separate named streams** (`rng.stream('sensors')`, `rng.stream('birds')`…) so adding a feature doesn't shift other random sequences.
- Floating point: avoid order-dependent accumulation across entity lists (always iterate in id order).

---

## §4. Domain model (defined in `packages/shared`, zod)

```ts
// enums.ts (selected)
ThreatClass = QUAD_SMALL | QUAD_HEAVY | FPV | FIXED_WING_SMALL | LOITERING_GENERIC
NonThreatClass = BIRD_SMALL | BIRD_LARGE | FRIENDLY_QUAD | CIVILIAN_HOBBY | HELICOPTER_FRIENDLY
ContactClass = ThreatClass | NonThreatClass
Affiliation = HOSTILE | FRIENDLY | NEUTRAL | UNKNOWN          // APP-6 style colours: red/blue/green/yellow
ControlLink = RF_MANUAL | AUTONOMOUS_GNSS | FIBRE_OPTIC | NONE
Behaviour = RECON_LOITER | SMUGGLING_DROP | ATTACK_RUN | SWARM_SATURATION | DECOY | TRANSIT | FRIENDLY_PATROL | BIRD_FLOCK
SensorKind = RADAR | EO_IR | RF | ACOUSTIC (future)
ResponseKind = MONITOR | REPORT | EW_JAM | EW_SPOOF | INTERCEPT
ZoneKind = PROTECTED_ASSET | NO_KINETIC | BORDER_LINE | SENSOR_SITE
KillChainStage = DETECT | TRACK | IDENTIFY | DECIDE | RESPOND | ASSESS
Difficulty = 1..5
```

```ts
ScenarioRequest {
  terrainPreset: string; timeOfDay: ISO time; date?: ISO date;
  weather: { visibilityM, rainMmph, windMps, windDirDeg, cloudPct } | 'LIVE';
  difficulty: 1-5; seed: number;
  threatMix?: Partial<Record<ThreatClass, number>>; swarmSize?: number;
  falseContactDensity?: 'LOW'|'MED'|'HIGH'; aiAssistAccuracy?: 0..1;
  durationS: number; roe: 'WEAPONS_FREE'|'WEAPONS_TIGHT'|'WEAPONS_HOLD';
}

Scenario {
  id (string: "S04" for scripted, DB uuid otherwise), schemaVersion, name, briefing (markdown), seed, difficulty,
  request?: ScenarioRequest            // present for GENERATED/AUTHORED, absent for hand-scripted
  terrain: { preset, origin {lat, lon} },
  environment: { date, time, isNight, weather, sunAzEl? {azDeg, elDeg} (computed) },
  roe, durationS,
  zones: Zone[]  // discriminated by kind: BORDER_LINE has `polyline`, others have `polygon`; points are [x, z]
  assets: Asset[] // protected points with radius
  sensors: SensorConfig[] // discriminated by kind (RADAR / EO_IR / RF), position + kind-specific params
  effectors: EffectorConfig[] // kind ∈ EW_JAM / EW_SPOOF / INTERCEPT, position, rangeM, cooldownS, ammo?
  contacts: ContactSpec[]
  scoringTreeId: string
}

ContactSpec {
  id, class: ContactClass, isThreat: boolean, affiliation (truth),
  controlLink: ControlLink, behaviour: Behaviour,
  spawnTMs, despawnTMs?, groupId?  // swarm/flock membership
  path: Waypoint[] // {x,y,z, speedMps, holdS?, action?: 'DROP'|'DIVE'|'RTH'}
  emissions: { rfActive: boolean, rfBand?: string, friendlyIdCode?: string }
  aiSuggestion?: { suggestedClass, confidence } // pre-baked from seed for determinism
}

SimEvent { seq, tMs, type, contactId?, trackId?, payload }   // discriminated union on `type`
Score { total, components{detection, classification, decision, report, efficiency}, penalties[], perContact[], metrics{}, treeVersion }
// Penalty and PerContactMetrics shapes are provisional until Phase 1 scoring (see packages/shared/src/score.ts).
```

**Coordinates in scenario JSON:** `x` = east (m), `z` = **north** (m), `y` = metres **above ground level** (AGL). 2D zone points are `[x, z]`. The flip to Three.js (`z = -north`) happens only in `packages/sim-core/src/coords.ts`.

**Phase 2 additions (all additive, no `schemaVersion` bump):**
- `Waypoint.altRef?: 'AGL' | 'MSL'` (default `AGL`). An `MSL` waypoint's `y` is metres above sea level; sim-core converts it with the preset's `originElevM`.
- `EoIrSensor.irResolution?: [w, h]` — thermal detector resolution (defaults to `resolution`).
- `CAMERA_SLEWED` may carry a top-level `trackId` = "camera locked on this track" (sim-core then follows the track's estimated position every tick), and `payload.mode?: 'DAY' | 'IR'`.
- `ClassProfile.thermalContrast` (0..1, representative) per contact class.
- **Preset meta is authoritative:** `terrain.origin` in a scenario is informational; the preset's `meta.json` origin (and `utcOffsetMin`) is used for sun position and geo-referencing.
- **`environment.isNight` is computed** (sun elevation < −6° from suncalc at the preset origin, scenario date/time and preset `utcOffsetMin`) and overrides any stored value. `sunAzEl` is likewise computed.

**Additional enums** (all in `packages/shared/src/enums.ts`): `Roe`, `UserRole` (TRAINEE / INSTRUCTOR / ADMIN), `ScenarioKind`, `SessionMode`, `SessionStatus`, `EventType`, `ResponseResult`, `TrackLostReason`, `EoLevel`, `AltitudeBand`, `Activity`, `WaypointAction`, `FalseContactDensity`, `SessionEndReason`, `TimeBand` (DAY / DUSK / NIGHT) and `WeatherPreset` (CLEAR / HAZE / FOG / RAIN / DUST) for the generator (§7.1).
- **Zones** may carry an optional `name` (e.g. "village", "border"); the HUD labels zones with their id and name and names the zone in disabled reasons ("No kinetic response over the village — zone Z3"). `SensorKind.ACOUSTIC` is not added until it is implemented.

### 4.1 Event types
System: `SESSION_STARTED, CONTACT_SPAWNED, CONTACT_DESPAWNED, CONTACT_REACHED_ASSET, CONTACT_NEUTRALISED, CONTACT_DROPPED, SENSOR_TRACK_CREATED, SENSOR_TRACK_LOST, EO_IDENTIFIABLE (contact became identifiable in current EO pointing), RESPONSE_OUTCOME, SESSION_ENDED`
Trainee: `TRACK_SELECTED, CAMERA_SLEWED, MARKED_DETECTED, CLASSIFIED, AFFILIATION_SET, RESPONSE_ORDERED, REPORT_SUBMITTED, AI_SUGGESTION_SHOWN, AI_SUGGESTION_ACCEPTED, AI_SUGGESTION_REJECTED`

### 4.2 Event payloads
| Event | Emitted by | Payload |
|---|---|---|
| `SESSION_STARTED` | sim | `{ mode: 'PRACTICE'\|'ASSESSMENT', scenarioId, seed }` |
| `CONTACT_SPAWNED` / `CONTACT_DESPAWNED` | sim | `{}` + top-level `contactId` (ground truth, hidden from trainee UI) |
| `SENSOR_TRACK_CREATED` | sim | `{ sensorId, sensorKind, rangeM, bearingDeg }` + top-level `trackId`, `contactId` |
| `SENSOR_TRACK_LOST` | sim | `{ reason: 'MISSES'\|'LOS'\|'OUT_OF_RANGE' }` |
| `EO_IDENTIFIABLE` | sim | `{ level: 'DETECT'\|'RECOGNISE'\|'IDENTIFY', rangeM }` |
| `TRACK_SELECTED` | trainee | `{}` + top-level `trackId` |
| `CAMERA_SLEWED` | trainee | `{ azDeg, elDeg, zoom, mode? }` + optional top-level `trackId` (lock). Throttled to max 2/s, plus one final event at the end of every drag/slew/zoom/mode gesture so the sim's pointing settles on what the trainee sees |
| `MARKED_DETECTED` | trainee | `{}` + top-level `trackId` |
| `CLASSIFIED` | trainee | `{ class: ContactClass }` |
| `AFFILIATION_SET` | trainee | `{ affiliation }` |
| `RESPONSE_ORDERED` | trainee | `{ response: ResponseKind, effectorId? }` |
| `RESPONSE_OUTCOME` | sim | `{ response, result: 'NEUTRALISED'\|'NO_EFFECT'\|'MISSED'\|'BLOCKED_BY_ROE'\|'BLOCKED_NO_KINETIC'\|'OUT_OF_RANGE'\|'COOLDOWN'\|'NO_AMMO', collateral?: {contactIds: string[]} }` — `collateral` lists every other contact the same response affected (e.g. all RF contacts in a jam sector) |
| `REPORT_SUBMITTED` | trainee | `ContactReport` (§4.3) |
| `AI_SUGGESTION_SHOWN` / `_ACCEPTED` / `_REJECTED` | sim / trainee | `{ suggestedClass, confidence }` |
| `CONTACT_REACHED_ASSET` | sim | `{ assetId }` |
| `CONTACT_NEUTRALISED` | sim | `{ by: ResponseKind }` |
| `CONTACT_DROPPED` | sim | `{ x, z }` + top-level `contactId`, and top-level `trackId` **only** when the EO tracker was in TRACK on that contact's track at the release (the operator saw it; Comms then shows `<trackId> PAYLOAD RELEASE OBSERVED`). Emitted once, when a `DROP` waypoint's hold ends (or on arrival without a hold), never after an EW defeat (decisions 70, 72) |
| `SESSION_ENDED` | sim | `{ reason: 'TIME_UP'\|'ALL_RESOLVED'\|'ABORTED' }` |

`trackId` and `contactId` live **only at the top level** of the event (matching the `session_events` columns and the §11.1 example); they are not repeated inside payloads, so e.g. `CLASSIFIED` has payload `{ class }` and top-level `trackId`.

Every event also carries `tMs` (sim time) and `seq` (monotonic per session). Trainee commands are applied on the next tick, so `tMs` is always a tick boundary — this is what makes replay exact.

### 4.3 Contact report (structured, simplified from standard military report formats)
```ts
ContactReport {
  tMs, trackIds: string[],
  count: number,
  class: ContactClass | 'UNKNOWN',
  affiliation: Affiliation,
  location: { bearingDeg, rangeM, fromSensorId } ,
  headingDeg: number,
  altitudeBand: 'LOW' | 'MEDIUM' | 'HIGH',      // < 50 m, 50–150 m, > 150 m AGL
  activity: 'APPROACHING' | 'LOITERING' | 'DEPARTING' | 'HOVERING' | 'UNKNOWN'
}
```

### 4.4 Example scenario JSON (abbreviated)
```json
{
  "id": "S04", "schemaVersion": 1, "name": "Night Drop", "seed": 40417, "difficulty": 3,
  "briefing": "## Situation\nForward post on open plains near a border fence. Reports of night-time drone drops...\n## ROE\nWEAPONS TIGHT — engage only positively identified hostiles. No kinetic response over the village.",
  "terrain": { "preset": "PUNJAB_PLAINS", "origin": { "lat": 30.9, "lon": 74.5 } },
  "environment": { "date": "2026-11-20", "time": "01:30", "isNight": true,
                   "weather": { "visibilityM": 4000, "rainMmph": 0, "windMps": 3, "windDirDeg": 300, "cloudPct": 20 } },
  "roe": "WEAPONS_TIGHT",
  "zones": [
    { "id": "z1", "kind": "BORDER_LINE", "polyline": [[-3000, 2500], [3000, 2600]] },
    { "id": "z2", "kind": "NO_KINETIC", "polygon": [[800, -400], [1400, -400], [1400, 200], [800, 200]] }
  ],
  "assets": [ { "id": "a1", "name": "Post Alpha", "x": 0, "z": 0, "radiusM": 150 } ],
  "sensors": [
    { "id": "rad1", "kind": "RADAR", "x": 0, "y": 6, "z": 0, "refRangeM": 3000, "scanPeriodS": 2 },
    { "id": "eo1", "kind": "EO_IR", "x": 0, "y": 8, "z": 0, "fovDegMin": 1.5, "fovDegMax": 30, "resolution": [640, 360] },
    { "id": "rf1", "kind": "RF", "x": 0, "y": 4, "z": 0, "rangeM": 4000, "bearingErrDeg": 7 }
  ],
  "effectors": [
    { "id": "jam1", "kind": "EW_JAM", "x": 0, "z": 0, "rangeM": 1500, "cooldownS": 10 },
    { "id": "int1", "kind": "INTERCEPT", "x": 0, "z": 0, "rangeM": 1200, "ammo": 4, "cooldownS": 6 }
  ],
  "contacts": [
    { "id": "c01", "class": "QUAD_HEAVY", "isThreat": true, "affiliation": "HOSTILE",
      "controlLink": "RF_MANUAL", "behaviour": "SMUGGLING_DROP", "spawnTMs": 20000,
      "path": [ { "x": -600, "y": 40, "z": 3200, "speedMps": 12 }, { "x": -300, "y": 30, "z": 1800, "speedMps": 10, "holdS": 15, "action": "DROP" }, { "x": -600, "y": 40, "z": 3200, "speedMps": 12, "action": "RTH" } ],
      "emissions": { "rfActive": true, "rfBand": "2.4GHz" },
      "aiSuggestion": { "suggestedClass": "QUAD_HEAVY", "confidence": 0.82 } },
    { "id": "c02", "class": "BIRD_LARGE", "isThreat": false, "affiliation": "NEUTRAL",
      "controlLink": "NONE", "behaviour": "BIRD_FLOCK", "groupId": "g1", "spawnTMs": 0, "path": [ "..." ],
      "emissions": { "rfActive": false } }
  ],
  "durationS": 300, "scoringTreeId": "default_v1"
}
```

### 4.5 Session lifecycle
`CREATED` (POST /sessions) → `ACTIVE` (first event batch) → `COMPLETED` (POST complete) or `ABANDONED` (no batch for 15 min, or explicit abort). Completed sessions and their events are immutable. Only `ACTIVE` sessions accept events; only `COMPLETED` sessions have scores.

---

## §5. Simulation engine (`packages/sim-core`)

Modules: `rng.ts`, `clock.ts`, `coords.ts`, `terrain.ts` (heightmap sampling + LOS raycast), `contacts.ts` (kinematics along waypoints), `behaviours/*.ts`, `boids.ts`, `sensors/{radar,eoir,rf,microdoppler}.ts`, `tracks.ts` (track management, N-of-M confirmation), `effectors.ts`, `roe.ts`, `events.ts`, `sim.ts` (public API: `createSim(scenario, terrain)`, `tick()`, `dispatch(cmd)`, `getState()`, `getEvents()`).

- **Kinematics:** move toward next waypoint at `speedMps` with max turn rate per class; altitude above ground (AGL) uses heightmap.
- **Boids (swarms, bird flocks):** separation / alignment / cohesion + leader-follow toward group waypoint; fixed weights per behaviour; deterministic iteration order.
- **World:** `createSim(scenario, world)` takes a `World` = heightmap (heights relative to the preset origin elevation) + building footprints (100 m uniform grid index) + LOS helper. Passing a bare `Heightmap` still works (no buildings). `PROCEDURAL_HILLS` is a built-in preset; real presets are decoded from `heightmap.u16` + `meta.json` + `buildings.geojson` by a pure function (no I/O in sim-core).
- **LOS:** raycast sensor→contact over heightmap at ~10 m step (fixed integer step count, endpoints excluded, 0.5 m tolerance) + building footprints (2D polygon test with height). Cache per sensor per tick.
- **Tracks:** a radar track is created after **3 hits in 5 scans**, lost after 4 consecutive misses. Tracks get ids `T001…`, distinct from contact ids (trainee sees tracks, not truth). A LOS-masked contact counts as a miss but still consumes its fixed per-contact random draws; a track lost while every losing miss was masked reports reason `LOS`.
- **Sun:** suncalc at the preset origin; the instant is `Date.UTC(date time) − utcOffsetMin`, never the machine's timezone.

---

## §6. Sensor models (simplified, cite in realism-sources.md)

### 6.1 Radar
- Config: `refRangeM` = range at which a 0.01 m² target has Pd = 0.5; scan period 2 s; bearing/range noise σ.
- Detection range scales with RCS^(1/4) (radar equation: SNR ∝ RCS / R⁴).
- `Pd = logistic((SNRdB − thresholdDb) / slope)`; then × LOS (0 if masked) × clutter factor (if AGL < 15 m within 2 km horizontal range: × 0.4).
- **Rain (accepted divergence, decision 50):** not a Pd factor but a two-way SNR loss, so it grows with range: γ = 0.0101 · R^1.276 dB/km (R = `rainMmph`, representative X-band, ITU-R P.838 style), loss = 2 · γ · range_km.
- Clutter and rain add no random draws: every scan draws exactly five numbers per active contact.
- **Tracks (decision 51):** 2D (x, z) alpha-beta filter, α 0.5, β 0.2; velocity starts from the first two measurements. Every tick a live track is extrapolated `pos + vel·Δt`; the HUD range/bearing/heading/speed and the EO lock use this filtered estimate. Track height is the true AGL (not filtered).
- Birds produce tracks too (similar RCS) — this is intentional.

### 6.2 EO/IR camera
- Trainee slews a narrow-FOV camera (drag on view or "slew to track"). Zoom levels change FOV.
- Pixels on target = targetSizeM / (rangeM × IFOV). **Johnson criteria** (cycles = pixels/2): detect ≥ 1, recognise ≥ 4, identify ≥ 6.4.
- Visibility caps EO range (fog/haze); at night, EO is useless and IR is used with lower contrast for small electric drones (thermal signature parameter per class).
- Rendered as a second R3F camera at reduced resolution with a post-process shader: day = slight noise; IR = white-hot palette + noise + blur. Emits `EO_IDENTIFIABLE` when a contact crosses the identify threshold in the current pointing (used for fair scoring).
- **Model (Phase 2):** IFOV = horizontal FOV (rad) ÷ horizontal pixels (`irResolution` in IR mode). Cycles = (sizeM / (rangeM × IFOV)) / 2, × `thermalContrast` in IR mode. Level: DETECT ≥ 1, RECOGNISE ≥ 4, IDENTIFY ≥ 6.4. A contact counts only if inside the camera frustum and in LOS. Visibility cap: DAY range ≤ `visibilityM`; IR range ≤ f × `visibilityM`, where f = 1 at visibility ≤ 1 km (dense fog) rising linearly to 1.5 at ≥ 3 km — thermal sees better through haze, not through fog (`SIM_VERSION` 4, decision 94). DAY mode gives nothing when `isNight`.
- **Pointing is sim state**, set only by logged `CAMERA_SLEWED` commands (incl. lock and mode), so EO results replay exactly.
- **EO video auto-track (decision 52).** The camera is in one of three states, all derived deterministically from the logged commands (no new event type):
  - `MANUAL` — trainee pointing (`CAMERA_SLEWED` without `trackId`).
  - `CUE` — locked on a radar track (`CAMERA_SLEWED` with `trackId`): the camera follows the track's filtered, predicted estimate.
  - `TRACK` — the EO tracker holds the contact: entered from `CUE` when the cued track's contact has been at EO level ≥ DETECT inside the central half of the frame (both axes) for 0.5 s. Each tick the camera aims at the contact itself plus a small jitter (1σ = 2 % of the horizontal FOV per axis, own RNG stream `eo-track`, two draws per TRACK tick).
  - `TRACK` → `CUE` when the contact leaves the frame (checked against the previous tick's pointing), loses LOS, has no EO level for > 1 s, or stops being active; if the radar track is no longer live it falls back to `MANUAL`. A `CAMERA_SLEWED` with the same `trackId` (zoom / day–IR change) keeps `TRACK`; one without `trackId` → `MANUAL`; a different `trackId` → `CUE`. The EO tracker keeps holding the contact if the radar track drops.
  - `EO_IDENTIFIABLE` logic is unchanged; the HUD shows `MAN` / `CUE` / `TRK` on the EO view.
- **Emission:** `EO_IDENTIFIABLE` is emitted when the highest level reached for a contact in the current pointing episode rises; the episode resets after the contact has had no level for 1 s (hysteresis, no flicker spam). The event carries the matching live track id when one exists.

### 6.3 RF detector
- Detects only contacts with `rfActive` within range; gives bearing ± 5–10° and band; no range.
- `AUTONOMOUS_GNSS` and `FIBRE_OPTIC` contacts are **silent**. Friendly drones may broadcast a friendly ID code — but not always (scenario-controlled ambiguity).
- **Model (Phase 2B, decision 53):** scan every 1 s (at x.5 s, off the whole-second ticks where 2 s radar scans fall, to spread LOS work) on stream `rf:<sensorId>`, two draws per active contact per scan (heard or not). Heard when `emissions.rfActive`, slant range ≤ `rangeM` and in LOS. Output: bearing + gaussian noise (σ = `bearingErrDeg` / 2), band, `friendlyIdCode` if set — no range. The scenario rules forbid `rfActive` on `AUTONOMOUS_GNSS` / `FIBRE_OPTIC` / `NONE` links and a `friendlyIdCode` without `rfActive`.
- **Strobes are sim state, not events** (`state.rfStrobes`, ids `E01…` per heard contact, expiring 3 s after the last detection). Each tick a radar track takes the strobe nearest in bearing (from the RF sensor to the track estimate) within `bearingErrDeg` as its RF badge (band + ID code), else none.
- **RF-only contacts are not "detectable" for scoring:** the trainee cannot act on a strobe, so a contact never tracked by radar (or EO-identifiable) still gets `NOT_DETECTABLE`.

### 6.4 Micro-Doppler spectrogram
- Shown for the selected radar track when SNR is high enough.
- Templates generated offline by `scripts/signatures/gen_spectrograms.py` (numpy/scipy): multirotor = strong periodic blade-flash sidebands; fixed-wing = single prop line + sidebands; bird = low-frequency (2–10 Hz) wingbeat modulation, no blade flashes; helicopter = strong low-frequency main-rotor flashes.
- Client composes template + seeded noise scaled by SNR.

---

## §7. Threat library & behaviours (seed data, representative)

| Class | Threat | Size m | RCS m² | Max speed m/s | Typical links |
|---|---|---|---|---|---|
| QUAD_SMALL | yes | 0.35 | 0.01 | 18 | RF_MANUAL, AUTONOMOUS_GNSS |
| QUAD_HEAVY | yes | 1.0 | 0.05 | 15 | RF_MANUAL, AUTONOMOUS_GNSS |
| FPV | yes | 0.25 | 0.005 | 40 | RF_MANUAL, FIBRE_OPTIC |
| FIXED_WING_SMALL | yes | 2.0 | 0.08 | 28 | AUTONOMOUS_GNSS, RF_MANUAL |
| LOITERING_GENERIC | yes | 2.5 | 0.1 | 45 | AUTONOMOUS_GNSS |
| BIRD_SMALL / BIRD_LARGE | no | 0.3 / 1.5 | 0.005 / 0.02 | 15 | NONE |
| FRIENDLY_QUAD | no | 0.5 | 0.02 | 18 | RF_MANUAL (+ friendly ID sometimes) |
| CIVILIAN_HOBBY | no | 0.35 | 0.01 | 15 | RF_MANUAL |
| HELICOPTER_FRIENDLY | no | 12 | 5 | 70 | NONE (radio, not modelled) |

**Behaviours (inspired by publicly reported patterns; note inspiration in realism-sources.md)**
- `RECON_LOITER` — approach at 80–150 m AGL, orbit near asset, leave.
- `SMUGGLING_DROP` — night, low (20–60 m), cross `BORDER_LINE`, hover 10–20 s, `DROP`, return.
- `ATTACK_RUN` — low approach using terrain masking, terminal `DIVE` at asset.
- `SWARM_SATURATION` — 4–20 members, 2–3 axes, staggered arrival.
- `DECOY` — high/visible, emits RF loudly, draws attention while real threats come low/silent.
- `TRANSIT` — civilian/hobby drone wandering, never approaches asset closely.
- `FRIENDLY_PATROL` — friendly drone on a patrol loop near own position.
- `BIRD_FLOCK` — boids flock, erratic altitude, slow.

### 7.1 Difficulty scaling (generator defaults; tune during playtests)
**Time bands** (generator): DAY = sun elevation ≥ 15°; DUSK = evening, −4° to +6°; NIGHT = evening, ≤ −12° — all ≥ 2° clear of the sim's −6° night rule; computed with the NOAA solar equations at the preset and cross-checked against suncalc (decision 74). **Weather presets** (representative): CLEAR visibility 20 km; HAZE 6 km; FOG 0.8 km; RAIN 5 km and 4–12 mm/h; DUST 2 km (refused until a desert preset exists); wind 0–8 m/s; the date's month follows the preset's season. **D1–D2 first threat** (against rote learning, decision 81): an attack run of a class drawn from small quad / heavy multirotor / small fixed-wing, spawning at a random time in the first 15 s on a random in-view bearing, so it is tracked within 30 s.

Minimum warning and the D1–D2 first-track target are shared constants (`packages/shared/src/difficulty.ts`, exported to the API); the generator targets them and the sim-core validator enforces them (decisions 75, 79).
| Parameter | 1 | 2 | 3 | 4 | 5 |
|---|---|---|---|---|---|
| Threat contacts | 1 | 1–2 | 2–4 | 4–8 | 8–20 |
| False contacts | 0 | 1–2 | 2–4 | 4–8 | 8–12 |
| Bird flock members (total) | ≤ 15 (25 % of the 60-entity cap; flocks of 3–5; threats have budget priority) | ≤ 15 | ≤ 15 | ≤ 15 | ≤ 15 |
| Lowest threat altitude AGL | 100 m | 60 m | 30 m | 15 m | 5 m |
| Pop-down (share of threats; final 1.5–2 km below the 15 m clutter height, down to) | — | — | — | 15 % (10 m) | 30 % (5 m) |
| Share of silent links | 0% | 0% | 25% | 50% | 70% |
| Spawn distance | first threat 2.6 km from the radar, spawning in the first 3 s (first radar track ≤ 30 s); others 3.5 km | as D1 | 4 km | 3 km | 2.5 km |
| Minimum warning (first radar track → reaching the asset / dropping; recon: → within 1 km) | 60 s | 50 s | 45 s | 40 s | 30 s |
| Conditions | clear day | day / haze | any day or dusk | dusk / night / fog | night + fog or rain |
| Swarms / decoys | no | no | small group | 1 swarm + decoy | multi-axis swarm + decoys |
| AI-assist accuracy | 0.95 | 0.90 | 0.85 | 0.75 | 0.65 |
| Interceptor ammo per threat | 3 | 2 | 1.5 | 1.2 | 1.0 |
| ROE | FREE | FREE | TIGHT | TIGHT | TIGHT |

### 7.2 Scripted scenario library (Phase 3 target)
| Id | Name | Diff | Preset · time | What it trains | Inspired by (cite in realism-sources.md) |
|---|---|---|---|---|---|
| S01 | First Contact | 1 | PROCEDURAL_HILLS · day | Basic loop: detect, classify, intercept one quad in daylight | — (tutorial) |
| S02 | Two Axes | 1 | PROCEDURAL_HILLS · day | Two quads on two axes; prioritise by time to the asset | — (tutorial) |
| S03 | Low and Fast | 2 | PROCEDURAL_HILLS · day | A low, fast quad that appears late on radar | — (tutorial) |
| S04 | Night Drop | 3 | PUNJAB_PLAINS · night | Night smuggling drop across a border line; IR, RF bearing, report | Reported cross-border drone drops |
| S05 | Silent Approach | 3 | JK_MOUNTAIN · day, haze | Fibre-optic FPV through a mountain valley; jamming useless, terrain masking | Reported fibre-optic FPV use in recent conflicts |
| S06 | Crowded Skies | 3 | URBAN_GENERIC · day, haze | Urban area with civilian hobby drones and NO_KINETIC zones; one hostile | Urban drone incidents, collateral constraints |
| S07 | Look Over There | 4 | PUNJAB_PLAINS · dusk | Loud high decoy + silent low loitering threat | Reported decoy + strike tactics |
| S08 | Fog Line | 4 | PUNJAB_PLAINS · day, fog 0.8 km | Winter fog on the Punjab plains (0.8 km, January): EO identifies only inside 0.8 km, radar-led decisions; friendly patrols and birds | Weather-degraded operations; IMD winter fog |
| S09 | Dusk Swarm | 4 | PUNJAB_PLAINS · dusk | 8-drone swarm on 2 axes with sun glare at dusk | Reported swarm attacks |
| S10 | Saturation | 5 | PUNJAB_PLAINS · night, rain | Night mixed swarm + decoys + birds + friendly helicopter, limited ammo | Reported large-scale drone incursions |
| S15 | Birds or Drone? | 2 | PUNJAB_PLAINS · day | Two bird flocks tracked first, then a single quad on a nearby bearing; sort by radar behaviour and EO (the spectrogram arrives in Phase 5) | Common bird false-alarm problem in C-UAS |

**Build (Phase 3b):** S01–S03 are hand-written on the built-in PROCEDURAL_HILLS. S04–S10 and S15 are each a generator request with a fixed seed plus small overrides, built from `apps/api/app/seed/scenarios/src/<id>.json` by `scripts/scenarios/build_scripted.py`; a pytest fails if a committed file drifts from its source (decision 95). Sun glare in EO is not modelled (S09 puts one axis on the sun's bearing; glare is an open idea).

**Test scenarios (tag `test`, not part of the training library):**
| Id | Name | Preset | Purpose |
|---|---|---|---|
| S11 | Ridge Line | JK_MOUNTAIN, day | A quad's path passes behind a ridge: sensors lose it (LOS) and reacquire it |
| S12 | Night Watch | PUNJAB_PLAINS, night | A quad that can only be identified in IR mode |
| S13 | Silent Ridge | JK_MOUNTAIN, night | A fibre-optic FPV, silent to RF and hidden by the ridge until ~1.1 km, plus a bird flock that creates radar tracks |
| S14 | Mixed Sky | PUNJAB_PLAINS, day | Bird flock, an RF-linked hostile quad and a friendly patrol (no ID code) on the same bearing: jamming the hostile also jams the friendly |

---

## §8. Responses, effectiveness & ROE (abstract by design)

| Response | Effect | Effective vs | Ineffective vs | Constraints |
|---|---|---|---|---|
| MONITOR | Keep tracking | — | — | — |
| REPORT | Opens report form | — | — | Scored on accuracy |
| EW_JAM | Link loss → contact hovers/lands or RTH (per behaviour) | RF_MANUAL | AUTONOMOUS_GNSS, FIBRE_OPTIC | Range, cooldown; also jams friendly drones in range (penalty) |
| EW_SPOOF | Navigation drift → contact misses target | AUTONOMOUS_GNSS | FIBRE_OPTIC, manual-flown | Range, cooldown |
| INTERCEPT | Abstract `Pkill` by range/speed/class | All | — | Limited ammo; ROE-gated and blocked over `NO_KINETIC` zones (table below) |

Outcomes are rolled with the seeded `effectors` RNG stream and emitted as `RESPONSE_OUTCOME`.

**ROE and no-kinetic zones (Phase 3a, `SIM_VERSION` 3, decisions 69–70):**

| Rule | INTERCEPT allowed when | Result if not |
|---|---|---|
| WEAPONS_FREE | always | — |
| WEAPONS_TIGHT | the trainee has **classified** the track as a threat class **and** declared it **HOSTILE** | `BLOCKED_BY_ROE` |
| WEAPONS_HOLD | never (EW still allowed) | `BLOCKED_BY_ROE` |
| `NO_KINETIC` zone | the **track or intercept point** is outside every NO_KINETIC zone. Intercepts resolve instantly when ordered, so the intercept point coincides with the track position, and the sim tests the track's estimated (operator-known) position — equivalent to the rule, not a reduction of it. If intercept time-of-flight is ever modelled, the check must move to the predicted intercept point. A point on a zone edge counts as inside | `BLOCKED_NO_KINETIC` |

ROE is checked first, then the zone, then cooldown and ammo; a blocked order spends nothing. EW is never ROE- or zone-gated. The HUD disables Intercept with the same reasons in the same order, naming what is missing ("ROE: weapons tight — classify as a threat type (C) and declare HOSTILE (H)") or the zone ("No kinetic response over the village — zone Z3").

**EW rules (Phase 2B, decision 54):**
- **Geometry:** EW_JAM and EW_SPOOF act on a **±10° sector** from the effector toward the ordered track's estimate, out to `rangeM` (range is checked to the ordered contact first: `OUT_OF_RANGE` spends nothing).
- **Who is affected:** every susceptible, active, not-yet-defeated contact in the sector, in id order — jam: `RF_MANUAL` (P = 0.9 each); spoof: `AUTONOMOUS_GNSS` (P = 0.8 each). Friendlies and civilians are included (collateral). Rolls are drawn only when the effector fires.
- **Result** for the ordered contact: `NEUTRALISED` if defeated, `MISSED` if susceptible but the roll failed, `NO_EFFECT` if its link is not susceptible (cooldown and ammo are still consumed); `COOLDOWN` / `NO_AMMO` / `OUT_OF_RANGE` spend nothing. Other affected contacts are listed in `collateral.contactIds`; every affected contact gets `CONTACT_NEUTRALISED {by}`.
- **Reactions:** jam → `ATTACK_RUN` / `SWARM_SATURATION` hover 5 s then land; all other behaviours return to their first waypoint and despawn. Spoof → the remaining route drifts sideways, growing to ~400 m by its end, so a dive misses the asset. A defeated contact keeps flying visibly, can never reach an asset, and counts as resolved for `ALL_RESOLVED`.
- **Not ROE-gated:** EW is non-kinetic; ROE and `NO_KINETIC` zones restrict only INTERCEPT.
- **INTERCEPT on a contact already defeated by EW** returns `NO_EFFECT` and uses no round.

---

## §9. Scoring

### 9.1 Per-contact metrics (computed in `services/scoring/metrics.py`)
`firstDetectableTMs` (first SENSOR_TRACK_CREATED or EO_IDENTIFIABLE), `traineeDetectedTMs`, `detectionLatencyS`, `classifiedAs`, `classificationCorrect` (exact / category-level / wrong), `identifiableWhenClassified` (fairness flag), `responses[]`, `responseAppropriate` (from §8 table + ROE), `outcome` (NEUTRALISED / LEAKED / IGNORED_OK / WRONGLY_ENGAGED / FRATRICIDE), `aiSuggestionShown/Accepted/Correct`.

### 9.2 Decision tree (JSON, editable, versioned in `services/scoring/trees/default_v1.json`)
```json
{ "id": "default_v1", "root": "isThreat",
  "nodes": {
    "isThreat": { "if": {"metric": "isThreat", "op": "==", "value": true}, "then": "detected", "else": "nonThreatEngaged" },
    "detected": { "if": {"metric": "traineeDetectedTMs", "op": "exists"}, "then": "latency", "else": {"leaf": "MISSED", "points": 0, "feedback": "Threat never detected."} },
    "latency":  { "bands": {"metric": "detectionLatencyS", "edges": [5, 15, 30]}, "points": [25, 18, 10, 4], "next": "classified" },
    "classified": { "...": "exact = 25, category = 12, wrong = 0; if not identifiableWhenClassified and correct → still full (lucky guess not penalised); if wrong and not identifiable → feedback 'classified before identifiable'" },
    "...": "decision (30): appropriate response before leak; ineffective response (e.g. JAM vs FIBRE_OPTIC) = 5 + feedback",
    "nonThreatEngaged": { "...": "FRATRICIDE −40, WRONGLY_ENGAGED civilian −25, correctly classified non-threat +5" }
  } }
```
- Session components: detection 25, classification 25, decision 30, report 10, efficiency 10 (ammo wasted, time to neutralise) → normalised to 100. Penalties listed separately with timestamps.
- Every leaf has a `feedback` string used in the result screen and fed to the LLM debrief.
- Instructor can adjust weights (not structure) from the UI; tree version stored with each score.
- **`default_v2` (Phase 2B, decisions 55–56)** = `default_v1` plus:
  - decision branch: neutralised (feedback names the method: jammed / spoofed / N round(s); a feedback-only `DECISION_EW_LESSON` note when an ineffective EW order came first) → else `DECISION_UNAVOIDABLE` (excludes the decision component only) → else engaged-not-neutralised (any effector fired, 15) → else `DECISION_INEFFECTIVE_EW` (EW against a link it cannot affect, 5, e.g. "Jamming has no effect on a fibre-optic drone.") → else ordered-but-no-effect (5) → else none (0);
  - non-threat branch, in precedence order: `FRATRICIDE` −40 (intercept fired at a friendly), `FRIENDLY_JAMMED` −15 (a friendly affected by a jam, targeted or collateral), `WRONGLY_ENGAGED` −25 (intercept fired at, or jam/spoof ordered on, a non-threat's own track), `CIVILIAN_JAMMED` −5 (civilian affected by a jam **only as collateral**), `NON_THREAT_IDENTIFIED` +5, left alone 0. Birds are never penalised for EW (no RF link), but an EW order on a bird is listed with 0 points (`BIRD_EW_ORDERED`, "this was a bird — check the spectrogram/EO before engaging") so the AAR shows the mistake; firing an interceptor at a bird stays `WRONGLY_ENGAGED` −25.
  - Leaves may carry `excludeComponents` (e.g. `["decision"]`); each component is averaged over the threats not excluded for it (per-component denominators). `default_v1` scores are unchanged.
  - `default_v1` stays immutable (it has scored sessions); scenarios with sessions (S01, S03, S11, S12) keep it; new scenarios (S13, S14) use `default_v2`.
  - `default_v3` (Phase 3a, decision 72) = `default_v2` + payload drops: a threat that dropped its payload before it was neutralised is `LEAKED` (`DROP_BEFORE_NEUTRALISED`; neutralised only after the drop earns 15 decision points). Generated scenarios use it. `PerContactMetrics.droppedTMs` records the release time for the result screen.

### 9.3 Adaptive difficulty (Elo)
User rating R (start 1000). Scenario rating D = 800 + 150 × difficulty. Expected E = 1 / (1 + 10^((D − R)/400)); actual A = total/100; R' = R + 32 × (A − E). Recommended next difficulty = the level whose D is closest to R + 50.

### 9.4 AI over-trust metrics
`overTrust = acceptedWrong / shownWrong`, `underTrust = rejectedCorrect / shownCorrect`. Shown in AAR, not part of total score (flagged as an insight).

### 9.5 Contact report scoring (10 points)
| Field | Full credit when |
|---|---|
| Timeliness (3) | Submitted within 60 s of first `MARKED_DETECTED` for those tracks (linear to 0 at 180 s) |
| Count (2) | Exact; 1 point if within ±1 (or ±20% for swarms) |
| Class (2) | Exact class 2, correct category (threat vs non-threat type) 1 |
| Location (1) | Within 300 m of true position at `tMs` |
| Heading (1) | Within 30° of true heading |
| Altitude band + activity (1) | Both correct (0.5 each) |

### 9.6 Fairness rules
- No penalty for missing a contact that was never detectable (no track, never EO-identifiable, always LOS-masked).
- Latency is measured from `firstDetectableTMs`, not spawn time.
- Penalties caused by an outcome the trainee could not influence (e.g. a contact spawns inside effector range and reaches the asset within one cooldown) are flagged `UNAVOIDABLE` and excluded.
- **UNAVOIDABLE (Phase 2B rule, decision 56):** for a threat that was not neutralised and reached an asset, if `reachedAssetTMs − firstDetectableTMs < max(shortest cooldown among effectors able to engage it, 10 s)` the decision component for that contact is excluded (`DECISION_UNAVOIDABLE`, with feedback). Detection and classification are still scored. "Able to engage": INTERCEPT always; EW_JAM if `RF_MANUAL`; EW_SPOOF if `AUTONOMOUS_GNSS`. There is no separate leak penalty (a leak already forfeits the decision points).
- A tree change never re-scores old sessions silently; re-scoring is an explicit instructor action that writes a new score row with the new `tree_version`.

---

## §10. Database (PostgreSQL, SQLAlchemy 2 + Alembic)

| Table | Columns (key ones) |
|---|---|
| `units` | id, name, parent_id (nullable), created_at |
| `users` | id, auth_id (unique), name, email, role, unit_id, rating (int, default 1000), is_guest, created_at |
| `threat_types` | code (pk), name, category, is_threat, size_m, rcs_m2, max_speed_mps, thermal_signature, control_links (text[]), model_path, source_ref |
| `terrain_presets` | code (pk), name, meta (jsonb), attribution |
| `scenarios` | id, code (nullable unique, e.g. `S04`), name, kind (SCRIPTED/GENERATED/AUTHORED), seed, difficulty, tags (text[], e.g. `demo`, `tutorial`), request (jsonb), content (jsonb), schema_version, created_by, created_at |
| `assignments` | id, scenario_id, unit_id (nullable), user_id (nullable), assigned_by, due_at, created_at |
| `sessions` | id, user_id, scenario_id, mode (PRACTICE/ASSESSMENT), status (CREATED/ACTIVE/COMPLETED/ABANDONED), last_batch_seq, is_demo (bool), started_at, ended_at, client_meta (jsonb: fps, gpu, browser), sim_version (int, nullable: sim-core `SIM_VERSION` the session ran on; null before Phase 2B) |
| `session_events` | id (bigserial), session_id, seq (unique with session_id), t_ms, type, contact_id, track_id, payload (jsonb). Index (session_id, t_ms) |
| `scores` | id, session_id (unique with tree_version), total, detection, classification, decision, report, efficiency, penalties (jsonb), per_contact (jsonb), metrics (jsonb), tree_version, created_at |
| `debriefs` | session_id (pk), model, content (jsonb), created_at |
| `rating_history` | id, user_id, session_id, before, after, created_at |

The API owns all DB access (Supabase service key stays server-side; no client-side DB queries).

---

## §11. API (`/api/v1`)

| Method & path | Role | Purpose |
|---|---|---|
| GET `/health` | any | Liveness |
| GET `/auth/me` | any | Current user + role + unit |
| POST `/auth/guest` | public | Create guest user, return token (demo mode) |
| GET `/threats` | any | Threat library |
| GET `/terrain-presets` | any | Presets + meta |
| GET `/scenarios` | any | List (filter: kind, difficulty, assigned) |
| GET `/scenarios/{id}` | any | Full scenario JSON |
| POST `/scenarios/generate` | trainee+ | `GenerateRequest` → Scenario (trainee: terrain, time band, difficulty, seed only; rate-limited per user) |
| POST `/scenarios` | instructor | Save scripted/edited scenario |
| POST `/scenarios/from-text` | instructor | Text → ScenarioRequest (LLM) → Scenario |
| POST `/sessions` | trainee+ | Start session for scenario |
| POST `/sessions/{id}/events` | owner | Append event batch |
| POST `/sessions/{id}/complete` | owner | Validate, score, update Elo → Score |
| GET `/sessions/{id}` | owner/instructor | Session + score |
| GET `/aar/sessions/{id}` | owner/instructor | Scenario + events + score (for replay) |
| POST `/aar/sessions/{id}/debrief` | owner/instructor | Generate/cache LLM debrief |
| GET `/aar/users/{id}/trends` | self/instructor | Score + component trends, rating history, recurring mistakes (Assessment sessions only) |
| GET `/aar/units/{id}` | instructor | Unit averages, leaderboard, weakest kill-chain stage, common mistakes |
| POST `/assignments` | instructor | Assign scenario to unit/users |
| GET `/assignments/mine` | trainee | My assignments |
| PATCH `/scoring/trees/{id}/weights` | instructor | Adjust weights |
| POST `/sessions/{id}/rescore` | instructor | Re-score with a newer tree version (new score row) |
| GET `/weather/live?preset=&time=` | instructor | Cached Open-Meteo lookup (if enabled) |

### 11.1 Key payloads
```jsonc
// POST /sessions
{ "scenarioId": "uuid", "mode": "ASSESSMENT", "simVersion": 2 }   // sim-core SIM_VERSION of the client
→ { "sessionId": "uuid", "scenario": { /* full Scenario */ }, "startedAt": "ISO", "simVersion": 2 }

// POST /sessions/{id}/events   (idempotent by batchSeq — a re-sent batch is ignored)
{ "batchSeq": 7, "events": [ { "seq": 101, "tMs": 41250, "type": "CLASSIFIED", "trackId": "T003", "payload": { "class": "QUAD_HEAVY" } } ] }
→ { "accepted": 1, "lastSeq": 101 }

// POST /sessions/{id}/complete
{ "endTMs": 300000, "clientMeta": { "avgFps": 48, "gpu": "Intel UHD 620", "browser": "Chrome 141" } }
→ Score  // §4, with perContact[] and penalties[]

// POST /scenarios/generate   (GenerateRequest; decision 80)
// Trainee: only terrainPreset, timeBand, difficulty, seed (any other field → 403 FORBIDDEN).
{ "terrainPreset": "JK_MOUNTAIN", "difficulty": 4, "seed": 9182, "timeBand": "DUSK" }
// Instructor / admin may also set: weatherPreset, durationS, roe, threatMix, swarmSize,
// falseContactDensity, aiAssistAccuracy. The generator resolves the rest from §7.1 and
// stores the full ScenarioRequest as scenario.request.
→ 201 { "scenarioId": "uuid", "scenario": { /* Scenario, generatorVersion: 1, scoringTreeId: "default_v3" */ } }
// Stored as kind GENERATED (tag "generated", owner = requester; the same request again
// returns the same row). Hidden from GET /scenarios; GET /scenarios/{id} and POST /sessions
// allow it only for its creator and instructors/admins (404 otherwise).
// GENERATE_RATE_LIMIT_PER_MIN (default 10) per user → 429 RATE_LIMITED.
```

### 11.2 Errors
All errors: `{ "error": { "code": "...", "message": "...", "details": {} } }`
| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Schema validation failed |
| `IMPLAUSIBLE_EVENTS` | 422 | Plausibility check failed (details list which rule) |
| `UNAUTHORIZED` | 401 | Missing/invalid token |
| `FORBIDDEN` | 403 | Role or ownership check failed |
| `NOT_FOUND` | 404 | Unknown id |
| `SESSION_NOT_ACTIVE` | 409 | Events/complete on a non-active session |
| `RATE_LIMITED` | 429 | LLM / generate limits |
| `LLM_UNAVAILABLE` | 503 | Only when no fallback exists (debrief always falls back) |
| `INTERNAL` | 500 | Unexpected; logged with request id |

---

## §12. Phases — tasks and done-criteria

### Phase 0 — Foundations
- pnpm monorepo, TS strict, ESLint/Prettier, ruff, vitest, pytest, CI workflow.
- `packages/shared`: enums + core zod schemas (§4) + JSON Schema export + Pydantic codegen script.
- `apps/api`: FastAPI skeleton, config, DB session, Alembic with all §10 tables, auth dependency (Supabase JWT + `AUTH_MODE=local`), `/health`, `/auth/me`.
- `apps/web`: Next.js + Tailwind + shadcn, dark HUD theme tokens, login page, empty `train` route.
- `docs/decisions.md`, `docs/realism-sources.md` created.
**Done when:** `pnpm dev` runs both apps; CI green; login works; `pnpm gen:schemas` regenerates Pydantic with no diff.

### Phase 1 — MVP loop
- `sim-core`: rng, clock, coords, flat/sample heightmap, contacts with waypoints, radar model (basic), tracks, events, commands, `createSim`.
- 1 terrain (a real small DEM crop is fine, or flat placeholder), 1 class (QUAD_SMALL), 1 behaviour (ATTACK_RUN), 1 effector (INTERCEPT).
- R3F scene: terrain, contacts (instanced), sky, orbit tactical camera. HUD: radar PPI scope, simple EO view (narrow camera, no shader yet), contact list, action bar (mark detected, classify, respond).
- Event batcher; `/sessions` endpoints; scoring with minimal tree (detection + classification + decision); result screen.
- 3 hand-written scripted scenarios seeded in DB.
**Done when:** a trainee can log in, play a 3-minute scenario, and see a correct score breakdown; a vitest proves determinism (same scenario + commands ⇒ same final state); pytest covers each scoring leaf.

### Phase 2 — Realism core
- `scripts/terrain/build_preset.py` + 2–3 real presets; LOS masking (terrain + buildings).
- suncalc lighting; night mode; IR shader; Johnson-criteria EO identification; visibility/fog.
- Full radar model (RCS scaling, clutter, rain), RF detector, silent links.
- Full threat library + false contacts (birds, friendly, civilian, helicopter); APP-6 affiliation colours.
- Effectors: EW_JAM, EW_SPOOF with §8 rules.
**Done when:** a night scenario where a fibre-optic FPV is invisible to RF and a bird flock creates radar tracks plays correctly; scoring penalises engaging the friendly drone; sources logged.

### Phase 3 — Generator & scenarios
- Python generator from `ScenarioRequest` with difficulty scaling (more contacts, lower altitude, more false contacts, worse weather, more silent links, less warning time).
- All behaviours + boids swarms; ROE zones; border line; protected assets.
- Scripted scenario library: 8–10 scenarios inspired by public incident patterns (cited), from easy day single-drone to night mixed swarm with decoys.
- Briefing screen (map with zones, ROE, assets, weather).
**Done when:** same request + seed ⇒ identical scenario (pytest); 50 random seeds per difficulty all generate valid, playable scenarios (schema-valid, contacts reachable, no spawn inside assets).
**Status (Part 3b, 2026-10-18):** scripted library S04–S10 and S15 built from sources with guard tests (decision 95); URBAN_GENERIC (Kaithal, 13,654 real footprints) and real footprints on PUNJAB_PLAINS / JK_MOUNTAIN (decisions 89, 93); generator siting on dense presets and `GENERATOR_VERSION` 2 (decisions 91–92); IR fog ramp, `SIM_VERSION` 4 (decision 94); exact LOS speed-ups for dense towns (decisions 88, 97); training list with filters and best score, Generate panel, briefing page with LOS coverage, legend and pinned Begin (decisions 96, 98); grouped zone labels and PPI label priority (decisions 98–99). Sweeps run on all three file presets. Evidence: CLAUDE.md §14.
**Status (Part 3a, 2026-10-16):** generator, `POST /scenarios/generate`, `SIM_VERSION` 3 (DROP / RTH, ROE class check, NO_KINETIC), `default_v3` and the sim-core validator are done. Playability is judged by the sim itself: `pnpm sweep:generator` generates 50 per difficulty (both presets) and runs the validator (schema, geometry, night flag, detectability, minimum warning, D1–D2 first track, defender wins at D1–D3); CI runs 20 per difficulty and fails above 2 % (decisions 74–76, 79). Scripted library S04–S10, URBAN_GENERIC and the select / briefing redesign are Part 3b.

### Phase 4 — AAR & instructor
- Replay: re-run sim from events with timeline scrubber, event markers, ground-truth toggle ("what was really there").
- Kill-chain stage breakdown per contact; trends (score, components, rating, latency) from **Assessment** sessions only (Practice allows pause and hints, so it is not comparable; `sessions.mode` is stored); recurring-mistake detection.
- Replay must check `sessions.sim_version`: sessions recorded before `SIM_VERSION` 3 will not replay exactly.
- Instructor: unit dashboard, assignments, scenario builder (form on top of ScenarioRequest + zone drawing on 2D map), weight editing.
- Structured contact report form + scoring.
**Done when:** an instructor can assign a scenario, 3 trainees play it, and the unit dashboard shows comparison + weakest stage; replay matches the original session exactly.

### Phase 5 — AI layer
- Elo update + recommended next difficulty.
- LLM debrief (§13.1) with template fallback; cached per session.
- Text-to-scenario (§13.2).
- AI-assist panel with pre-baked, seed-determined suggestions; accuracy degrades with conditions; over/under-trust metrics in AAR.
- Micro-Doppler spectrogram view.
**Done when:** debrief references actual mistakes with timestamps; text "night swarm of 8 from the north with 2 decoys, hard" produces a matching scenario; AI-assist metrics appear in AAR.

### Phase 6 — Polish & deploy
- Performance pass to budget (§16). Guest demo mode + guided tour + curated demo scenarios.
- Deploy (Vercel + Render + Supabase); warm-up strategy; seed production data.
- `docker-compose` offline build with local Postgres + `AUTH_MODE=local` + LLM-off fallbacks.
- Optional WebXR mode (tactical view + simplified HUD).
- Realism sources page in-app; user study (5–10 people × 3 sessions) with improvement chart for the pitch.
**Done when:** a judge with only the URL can understand and play a scenario in under 2 minutes; offline build runs on a laptop with no internet.

---

## §13. AI features

### 13.1 LLM debrief
- Input: score breakdown + per-contact metrics + top 10 key events (never raw logs, never PII).
- Output JSON: `{ summary, strengths[], mistakes[{tMs, what, whyItMatters, doInstead}], drill }`. Validate with Pydantic; one retry; else template built from leaf `feedback` strings.
- Tone: concise instructor debrief.

### 13.2 Text-to-scenario
- LLM outputs a **ScenarioRequest** (parameters), not a full scenario. The deterministic generator builds the scenario. This keeps output valid and reproducible.
- Clamp all values to schema bounds; show the parsed parameters to the instructor to confirm before generating.

### 13.3 AI-assist panel
- For a selected track, shows a suggested class + confidence. Suggestions are pre-baked into the scenario by the generator using the seed and `aiAssistAccuracy`, lower in degraded conditions. Deterministic and replayable.
- Trainee can accept / reject / ignore → events → over-trust metrics.

### 13.4 Model config
- `LLM_PROVIDER=openrouter`, `LLM_MODEL` env (default a Gemini Flash model), `LLM_ENABLED=false` for offline. Timeouts 20 s. Rate limit per user.

---

## §14. Realism data pipeline

- **Terrain:** download DEM tiles (Copernicus GLO-30 or SRTM) into `scripts/terrain/raw/` (git-ignored). `scripts/terrain` is its own uv project. `build_preset.py --dem <file>… (--centre lat,lon --size-km 14 | --bbox minlon,minlat,maxlon,maxlat) --px 512 --name PUNJAB_PLAINS --utc-offset-min 330 [--no-buildings]` → in `apps/web/public/terrain/<NAME>/`:
  - `heightmap.u16` — **the format sim-core and web load**: raw little-endian uint16, `resolution × resolution`, row 0 = south edge, column 0 = west edge; height relative to the origin elevation = `relMinM + v × (relMaxM − relMinM) / 65535`. The DEM is reprojected to a local azimuthal-equidistant grid centred on the origin (bilinear).
  - `heightmap.png` — 16-bit north-up **preview only**.
  - `meta.json` — validated by the `TerrainPresetMeta` zod schema: name, origin {lat, lon}, `utcOffsetMin`, `sizeM`, `resolution`, `metresPerPx` (= sizeM / (resolution − 1)), `originElevM`, `relMinM`, `relMaxM`, absolute `minElevM` / `maxElevM`, `buildingsStatus` (`OK` / `EMPTY` / `UNAVAILABLE`), file names, source + attribution.
  - `buildings.geojson` — footprints in **local metres `[x, z]`** (not lon/lat, so the browser needs no projection library), with `heightM` from `height`, else `building:levels` × 3 m, else 2 levels (6 m). Sources: osmnx (OSM) plus, with `--footprints <tile…>`, Microsoft Global ML Building Footprints (ODbL) — OSM wins where they overlap, tile footprints without a height are merged where closer than 2 m, simplified to 2 m, whole-metre coordinates, footprints under 40 m² dropped (decisions 89, 93). Written as compact GeoJSON, one feature per line. `--revision N` sets `meta.revision` (absent = 1) so replay can detect sessions recorded on older terrain.
  - Overpass is retried with exponential backoff (3 attempts); if it stays unavailable the preset is finished without buildings and `buildingsStatus = "UNAVAILABLE"`. Raw OSM replies are cached in `raw/` so rebuilds are offline. The build fails if a preset exceeds 10 MB.
  - Built (Phase 3b): `PUNJAB_PLAINS` (7,361 buildings, revision 2), `JK_MOUNTAIN` (67, revision 2), `URBAN_GENERIC` (Kaithal, 13,654, revision 1), plus the built-in `PROCEDURAL_HILLS` (no files). Planned: `THAR_DESERT`, `COASTAL`.
  - Sim LOS over buildings: 25 m footprint cells with a per-cell roof early-out, edge bands for footprints over 16 vertices and a 100 m obstacle-ceiling skip — results identical to testing every sample against every footprint (decisions 88, 97). The web renders buildings as per-tile indexed meshes with a 2 px LOD (decision 90).
  - `public/terrain/<NAME>/map.png` (briefing hillshade with buildings) and `thumb.png` (list thumbnail) come from `pnpm gen:maps`.
  - Original preset list: `PUNJAB_PLAINS`, `JK_MOUNTAIN`, `THAR_DESERT`, `URBAN_GENERIC`, `COASTAL`. Use generic areas — never model a real military installation (each box ≥ 50 km from the IB/LoC, no cantonments, airfields or known installations inside; vetted against OSM).
- **Sun:** suncalc with preset lat/lon + scenario date/time → sun azimuth/elevation → directional light, sky, `isNight` (sun elevation < −6°).
- **Weather:** scenario presets; optional `LIVE` → API calls Open-Meteo for preset location/time, caches result, maps to `{visibility, rain, wind, cloud}`.
- **Signatures:** `scripts/signatures/gen_spectrograms.py` → PNG templates per class in `apps/web/public/signatures/`.
- **Models:** low-poly glTF; licence + author recorded in `realism-sources.md`.

---

## §15. UI / UX

Visual and UX rules are defined in `docs/DESIGN.md` and are binding.

- **Style:** dark tactical HUD, high-contrast, monospace numerics, APP-6 affiliation colours, shadcn components, **no glassmorphism**, minimal animation. Must be readable on a 1366×768 laptop.
- **Screens:** landing (what it is + "Try demo") → guided tour → scenario select / assignments → briefing (2D map, ROE, assets, weather) → sim player → result screen → AAR → trends; instructor dashboard; scenario builder.
- **Scenario select (`/train`, Phase 3b):** a table of library scenarios (thumbnail, code + name, difficulty, Day / Dawn / Dusk / Night from the sun, conditions, tags, duration, best score) with filters and sort kept in the URL, keyboard row navigation; a Generate panel (terrain, difficulty, time, weather for staff, seed) that opens the new scenario's briefing (decision 96).
- **Briefing (`/train/scenario/[id]`, Phase 3b):** hillshade map with buildings, zones with ids, border, radar and interceptor rings, sensor sites, asset, intel axis only when the intel names one, LOS coverage shading at 15 / 50 / 150 m AGL; a legend under the map when it is width-limited (1920×1080); mission card (situation, mission, ROE callout, intel, sensors and effectors, environment, controls) that may scroll while Practice / Assessment and Begin (Enter) stay pinned in its footer (decisions 96, 98).
- **Zone labels in the player (Phase 3b):** NO_KINETIC zones with the same name within 500 m share one label ("NO KINETIC · TOWN") in 3D and on the PPI; a zone's id shows on hover, when the selected track is in, near (300 m) or heading into it (30 s), and in the disabled-intercept reason. On the PPI the asset, the selected track and threat tracks always keep their labels; zone labels move to the zone's far edge from the asset or hide (decisions 98–99).
- **Sim player layout:** centre 3D tactical view; right radar PPI; bottom-left EO/IR view (slewable, zoom); bottom-centre contact list with track state (UNKNOWN → classified, affiliation colour); bottom-right action bar + response buttons with cooldown/ammo; top bar clock, ROE state, alerts; RF panel and spectrogram as tabs; AI-assist chip on the selected track.
- **Keyboard shortcuts** for core actions (operators work fast).
- **Assessment mode:** no pause, fixed time. **Practice mode:** pause and hints allowed.

### 15.1 Keyboard shortcuts (defaults; shown in an on-screen cheat sheet with `?`)
| Key | Action |
|---|---|
| `Tab` / `Shift+Tab` | Next / previous track |
| `Space` | Slew EO/IR camera to selected track |
| `+` / `-` | Zoom EO/IR |
| `T` | Toggle day / thermal |
| `D` | Mark detected |
| `C` then `1–9` | Classify (numbered class menu) |
| `H` `F` `N` `U` | Set affiliation hostile / friendly / neutral / unknown |
| `M` `J` `S` `I` | Monitor / jam / spoof / intercept (intercept asks `Enter` to confirm) |
| `R` | Open contact report |
| `Y` / `X` | Accept / reject AI suggestion |
| `Esc` | Cancel current action |
| `P` | Pause (practice mode only) |

### 15.2 Accessibility & usability
- Affiliation is never shown by colour alone: APP-6-style shapes/letters too (colour-blind safe).
- Type sizes follow `docs/DESIGN.md` §4 (labels ≥ 11 px, other HUD text ≥ 12 px). Every critical alert has a visual cue; sound is optional, mutable and parked (DESIGN §10, decision 58).
- Every interactive control reachable by keyboard; mouse-only flows are not allowed for core actions.
- Hindi/English labels are out of scope for MVP; keep strings in one file so translation is possible later.

---

## §16. Non-functional

### Performance budget
- ≥ 30 fps on integrated graphics (Intel UHD 620 class) at 1080p; target 60 on a mid GPU.
- ≤ 60 active entities (birds included), instanced meshes, ≤ 150 draw calls, 512² terrain with LOD.
- EO/IR view rendered at ≤ 640×360; sim tick ≤ 2 ms.
- Initial load ≤ 10 MB per terrain preset; lazy-load presets.

### Testing
- **sim-core (vitest):** determinism, LOS, sensor Pd curves, track N-of-M, Johnson thresholds, effector rules, boids stability.
- **api (pytest):** every scoring leaf, plausibility checks, generator reproducibility + 50-seed validity sweep, Elo, RBAC per route, LLM output validation + fallback (mock LLM).
- **E2E (Playwright):** guest demo flow, trainee full session, instructor assign → trainee play → dashboard.
- **Manual:** FPS check on the weakest team laptop each phase.

### Security
- Supabase JWT verified server-side (JWKS — the Supabase project must use asymmetric JWT signing keys; audience `authenticated`); RBAC dependency per route; guests limited to demo scenarios.
- `ENV=prod` refuses to start unless `AUTH_MODE=supabase`; `LOCAL_JWT_SECRET` must be ≥ 32 bytes.
- CORS locked to web origin; request size limits; rate limit LLM and generate endpoints.
- Secrets only in env; service key never sent to client.
- No PII in logs or LLM prompts. No real or classified military data anywhere.

### Scalability
- Sim runs client-side, so server load is only batched events + scoring. A single small API instance handles a unit-sized load easily. `session_events` indexed; archive events of old sessions if they grow.

---

## §17. Deployment & cost

| Piece | Where | Cost |
|---|---|---|
| Web | Vercel | Free tier |
| API | Render or Railway | Free (cold starts ~30–60 s) or ~$5–7/month always-on |
| DB + Auth | Supabase | Free tier |
| LLM | OpenRouter (Gemini Flash) | Near-free at demo volume |
| Offline | docker-compose on any laptop | Free |

Before any demo or judging window: switch the API to always-on or schedule a warm-up ping.

---

## §18. Team workstreams (6 people, parallel with Claude Code)

| Stream | Owns |
|---|---|
| A | `sim-core`: kinematics, sensors, LOS, tracks, effectors |
| B | 3D scene + HUD components |
| C | API, DB, scoring engine, auth |
| D | Generator, terrain/signature scripts, threat library, scenario library |
| E | AAR, trends, instructor dashboard, scenario builder |
| F | AI layer, guided tour, docs, realism sources, pitch deck, user study |

Rules: one branch per feature; **`packages/shared` changes go through one owner (C)** and are merged first; every PR runs CI; each person keeps their Claude Code session scoped to their stream's folders.

---

## §19. Risks & things to avoid

- **Scope creep:** finish the MVP loop before any realism; finish realism before AI.
- **Non-determinism:** the most common silent bug; guard with tests from Phase 1.
- **Two generators:** never port generation logic to TS — Python generates, TS only simulates.
- **3D performance:** test on the weakest laptop every phase; cut entity counts before cutting features.
- **Photorealism:** don't chase it; clarity of sensor views beats graphics.
- **Real data:** no real system specs, no classified material, no real bases; cite all public sources.
- **LLM in the critical path:** everything must work with `LLM_ENABLED=false`.
- **VR first:** never; it is the last optional item.
- **Hosted-demo cold start:** warm the API before judging.
- **Event volume:** throttle camera-slew events and never log per-frame data.
- **Fake evidence:** demo data (§22) is always labelled as demo; only the real user study is presented as results.

---

## §20. Judge demo flow (what the hosted link must support)

A judge should get through this in about 5 minutes without help:
1. **Landing:** one-screen problem statement, the kill chain diagram, "Try demo" button.
2. **Guided tour** of the sim player (6–8 steps: tactical view, radar, EO/IR, track list, actions, report, AI assist).
3. **Pick S15 "Birds or Drone?"** in the training list, read its briefing (map, coverage, ROE), and play it in practice mode (≈ 3 min) — shows false contacts and EO identification (the spectrogram view arrives in Phase 5). S06 "Crowded Skies" is the urban follow-up (civilian drones, no-kinetic town).
4. **Result screen:** score breakdown, feedback lines, LLM debrief, recommended next difficulty.
5. **AAR replay** with the ground-truth toggle — "here is what was really there".
6. **Trends and unit dashboard** using labelled demo data (§22) to show progress over sessions.
7. **Instructor:** type a scenario in plain text → see parsed parameters → generate → preview briefing. (Phase 3b already has the form version: the Generate panel opens the generated scenario's briefing.)
8. **Realism Sources page:** every model, dataset and incident inspiration, cited.

Pitch storyline: *problem (costly, too few reps) → our loop (realistic kill chain) → realism (terrain, night, silent drones, false contacts, ROE) → measurement (decision-tree scoring, AAR, over-trust) → evidence (user study improvement) → deployability (browser, low-end PCs, offline build, near-zero cost).*

---

## §21. Glossary

| Term | Meaning |
|---|---|
| AAR | After-Action Review — structured review of what happened and why |
| AGL | Above Ground Level (altitude relative to terrain under the drone) |
| APP-6 | NATO standard military map symbology; we borrow its affiliation colours/shapes |
| C-UAS | Counter-Unmanned Aircraft Systems |
| DEM | Digital Elevation Model — grid of terrain heights (SRTM, Copernicus) |
| ENU | East-North-Up local coordinate frame in metres |
| EO/IR | Electro-Optical (visible) / Infra-Red (thermal) camera |
| EW | Electronic Warfare — here: jamming and spoofing |
| FPV | First-Person-View drone, fast and agile, often used for attack runs |
| IFOV | Instantaneous Field of View — angle covered by one camera pixel |
| Johnson criteria | Rule of thumb for how many pixels are needed to detect / recognise / identify an object |
| Kill chain | Detect → Track → Identify → Decide → Respond → Assess |
| LOS | Line of Sight — whether terrain/buildings block a sensor's view |
| Micro-Doppler | Small Doppler shifts from rotating blades/flapping wings; shown as a spectrogram |
| Pd | Probability of detection per radar scan |
| PPI | Plan Position Indicator — the circular top-down radar scope |
| RCS | Radar Cross Section — how "big" an object looks to radar (m²) |
| ROE | Rules of Engagement — when and how force may be used |
| RTH | Return To Home — typical drone behaviour on link loss |

---

## §22. Seed & demo data

- **Units:** `Demo Unit Alpha`, `Demo Unit Bravo`.
- **Users (local/offline + staging only):** `admin@demo`, `instructor@demo`, `trainee1..6@demo` (passwords from env, never hard-coded in the repo).
  - `users` has no password column. In `AUTH_MODE=local` the seed script creates DB rows (`auth_id = local:<email>`) and `POST /auth/dev-login` (disabled when `ENV=prod`) issues a token by email. In `AUTH_MODE=supabase` the demo users are created in the Supabase dashboard; their `users` row is auto-provisioned as TRAINEE on first request and roles are set in the DB, never taken from token claims.
- **Content:** full threat library (§7), all terrain presets built so far, scripted scenarios S01–S10 as they are completed, scoring tree `default_v1`.
- **Demo history:** a script generates ~40 synthetic completed sessions across demo trainees with a plausible improvement curve, so trends and the unit dashboard are not empty. These rows are flagged `is_demo = true`, shown with a "Demo data" badge, and excluded from any real study numbers.
- **Guests:** created on demand, can only run scenarios tagged `demo`, cleaned up after `GUEST_TTL_HOURS`.

---

## §23. Open questions (resolve and move answers into the relevant section)

- SIH round dates and submission format (hosted link only, or video/PPT too?) — decides how early Phase 6 deploy work starts.
- Does the evaluating body expect VR to be shown? If yes, move a minimal WebXR view earlier.
- Final project name.
- Which two terrain presets to build first (default: `PUNJAB_PLAINS`, `JK_MOUNTAIN`).
- Who owns which workstream (§18).
- Access to anyone with defence background for review and the user study.
