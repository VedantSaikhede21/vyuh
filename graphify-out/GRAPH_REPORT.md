# Graph Report - vyuh  (2026-10-17)

## Corpus Check
- 309 files · ~434,114 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 24 file(s) not represented in the graph (top: (none) 6, .woff2 6, .example 2)

## Summary
- 3174 nodes · 8294 edges · 151 communities (133 shown, 18 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 367 edges (avg confidence: 0.87)
- Token cost: 386,276 input · 0 output

## Community Hubs (Navigation)
- Scoring Engine Tests
- Generated Pydantic Models
- Sim-core Public API
- API Seed & Scenario Services
- Web UI Primitives & Pages
- Session Lifecycle Service
- Generator Tests & Sweep
- Schema & Enum Decisions
- Sim Runtime & Player Hook
- Realism Sources & Terrain Data
- Generator Core & Difficulty
- Shared Fixtures & Scenario Types
- API Config & Local Auth
- HUD Derived State & Commands
- Effectors, EW & ROE Zones
- Contact Kinematics & Boids
- Session API Tests
- Player HUD Panels
- Landing Assets Manifest
- Sim Behaviour Tests
- Terrain, World & LOS
- Comms Log & Practice Hints
- API Terrain & Scoring Tree Loader
- API App Bootstrap & Rate Limit
- Python Enums
- Generator Behaviours
- Sensor Siting & Visibility
- Radar Model & Coords
- Scripted Scenario Seeding
- Shared Scenario Schema (zod)
- Sun, Time Bands & Class Profiles
- Sim Tick & Track Pipeline
- Phase 2B Plan (EW, v2 Tree)
- Event Plausibility Checks
- Affiliation Symbols & Radar Scope
- Result Screen & Feedback
- Web API Client & Errors
- Terrain Builder Tests
- API Test Fixtures
- Trainee & Sim Event Schemas
- Scenario Validator
- Phase 3a Plan (Generator, ROE)
- EW & Defender Decisions
- Threat Route Planning
- HUD Zone Overlays
- JSON Schema Export & Difficulty
- Generator Environment & RNG Streams
- Phase 3.0 Design Plan
- Playwright E2E Specs
- sim-core Package Manifest
- Web Package Deps
- Determinism & Scoring Decisions
- Generator Design Decisions
- Terrain Mesh LOD
- Event Batcher
- Heightmap Encoding
- shared Package Manifest
- Shared Enums, Reports & Threats
- RBAC & Migrations
- Supabase Auth Tests
- Generator Contacts & Static Checks
- Phase 1 MVP Plan
- Tactical 3D Scene
- 3D Meshes & IR Materials
- Sky & Environment Look
- Phase 3b Plan (Library, Urban)
- EO Track Tests
- ROE, Zones & Track Filter Decisions
- Spec Overview & Demo
- Spec Responses & Scenario Library
- Golden Rules & Architecture
- API Error Handlers
- Base TS Config
- Scenarios Router
- Sessions Router
- Phase 3 Requirements
- Generate API Tests
- shadcn Config
- Canvas & Pixel Ratio
- Web Runtime Deps
- Terrain Preset Builder
- Seeded RNG
- Action Bar & Top Bar
- Web Auth Provider
- Spec Sim-core Sensors
- FPS Benchmark Spec
- LOS & World Decisions
- Spec Events & Scoring Trees
- Root ESLint Config
- Hillshade Generator
- Landing Video Recorder
- Spec Scoring & DB
- Sources Page Markdown
- World Loader
- Web Dev Deps
- Web Scripts
- Web TS Config
- Spec API & AI Layer
- Backend Stack & Services
- HUD Design Rules
- Spec Contacts & Behaviours
- Shared Schema Tests
- Supabase User Provisioning
- API Error Tests
- Generator Sweep Script
- Design Checklist & Schema Rules
- Project Docs & Status
- Codegen & Class Profile Decisions
- SIM_VERSION & Plausibility Decisions
- Root Scripts
- OSM Fetch
- API Package Manifest
- Root Layout & Fonts
- Landing Page
- Spec AAR & Determinism
- Shared Score Schema
- Per-contact Metrics
- Generated Briefing
- Error Status Mirror Check
- Label Decluttering
- Scripted Library S04-S15
- Root Dev Deps
- Dev Login Route
- E2E Sim Hook
- FPS & Pixel Ratio Decisions
- Spec Difficulty & Weather
- Generator & Terrain Presets (Overview)
- Health Check Tests
- Auth Decisions
- shared TS Config
- Test TS Config
- Me Route
- Pydantic Codegen Script
- Building Height Rules
- Health Route
- Web ESLint Config
- Sources Copy Script
- Spec ROE & Intercept
- sim-core TS Config
- Prettier Config
- PostCSS Config
- Typography & Copy
- Early Phases
- API Project
- Terrain Project

## God Nodes (most connected - your core abstractions)
1. `createSim()` - 99 edges
2. `Decisions ADR log` - 99 edges
3. `User` - 66 edges
4. `cn()` - 55 edges
5. `generate()` - 53 edges
6. `Realism sources` - 52 edges
7. `react` - 50 edges
8. `SimRuntime` - 38 edges
9. `assert_error()` - 37 edges
10. `Scenario` - 36 edges

## Surprising Connections (you probably didn't know these)
- `window.__vyuhE2E sim-time hook` --conceptually_related_to--> `Determinism is sacred`  [INFERRED]
  apps/web/e2e/README.md → CLAUDE.md
- `Comms log panel` --semantically_similar_to--> `Event batcher (POST /sessions/{id}/events)`  [INFERRED] [semantically similar]
  docs/DESIGN.md → CLAUDE.md
- `BatcherOptions` --references--> `SimEvent`  [EXTRACTED]
  apps/web/lib/sim/event-batcher.ts → packages/shared/src/events.ts
- `Result screen` --shares_data_with--> `Decision-tree scoring engine`  [INFERRED]
  docs/DESIGN.md → CLAUDE.md
- `Scenario select / Training screen` --references--> `Seeded procedural scenario generator`  [INFERRED]
  docs/DESIGN.md → CLAUDE.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Sensor stack feeding the kill chain** — docs_spec_radar_model, docs_spec_eo_ir_camera_model, docs_spec_rf_detector, docs_spec_micro_doppler_spectrogram, docs_spec_kill_chain [INFERRED 0.85]
- **Session event -> server scoring flow** — docs_spec_event_batcher, docs_spec_post_sessions_id_events, docs_spec_plausibility_checks, docs_spec_scoring_service, docs_spec_decision_tree_scoring, docs_spec_scores_table [EXTRACTED 1.00]
- **Deterministic replay mechanism** — docs_spec_determinism_contract, docs_spec_command_dispatch, docs_spec_mulberry32_named_rng_streams, docs_spec_aar_replay, docs_spec_sim_version [INFERRED 0.85]
- **Scoring tree versions v1 to v3** — docs_decisions_default_v1_scoring_tree, docs_decisions_default_v2_scoring_tree, docs_decisions_default_v3_scoring_tree, docs_decisions_unavoidable_decision_exclusion, docs_decisions_decision_tree_scoring_format [EXTRACTED 1.00]
- **Generator, validator, defender and seed sweep loop** — docs_decisions_procedural_scenario_generator_generator_version_1, docs_decisions_scenario_validator_validate_ts, docs_decisions_ground_truth_defender_defender_ts, docs_decisions_generator_seed_sweep, docs_decisions_shared_difficulty_targets_difficulty_ts [EXTRACTED 1.00]
- **Radar sensor model chain** — docs_realism_sources_radar_range_equation_range_proportional_to_rcs_1_4, docs_realism_sources_ground_clutter_model_pd_x_0_4_below_15_m_within_2_km, docs_decisions_rain_attenuation_snr_loss_model, docs_realism_sources_m_of_n_track_confirmation_3_of_5_drop_after_4_misses, docs_decisions_2d_alpha_beta_track_filter, docs_decisions_radar_los_masking [INFERRED 0.85]
- **Shared schema single-source pipeline enforced by CI** — claude_shared_package, claude_schema_codegen_pipeline, claude_fastapi_backend, _github_workflows_ci_schemas_job, claude_shared_schemas_source_of_truth [EXTRACTED 0.95]
- **Session flow: sim emits events, batcher posts, server scores, AAR replays** — claude_sim_core, claude_event_batcher, claude_fastapi_backend, claude_scoring_decision_tree, claude_aar_dashboard [EXTRACTED 0.95]
- **UI quality verification (checklist, e2e specs, FPS budget)** — docs_design_ui_review_checklist, apps_web_e2e_readme_visual_spec, apps_web_e2e_a11y_spec, apps_web_e2e_fps_spec, claude_fps_budget [INFERRED 0.85]
- **Scenario generation and validation pipeline** — docs_plans_phase3a_plan_sha256_named_substreams, docs_plans_phase3a_plan_static_checks_bounded_retries, docs_plans_phase3a_plan_validate_cli, docs_plans_phase3a_plan_generator_seed_sweep, docs_plans_phase3_requirements_ci_2_percent_sweep_threshold, packages_sim_core_src_defender [INFERRED 0.85]
- **Immutable scoring tree versions v1 -> v2 -> v3** — docs_plans_phase_1_default_v1_tree, docs_plans_phase2b_plan_default_v2_tree, docs_plans_phase3a_plan_default_v3_tree, docs_plans_phase2b_plan_per_component_denominators, docs_plans_phase2b_plan_unavoidable_decision_only [INFERRED 0.85]
- **EW jam/spoof rules and penalties** — docs_plans_phase2b_plan_ew_jam_sector, docs_plans_phase2b_plan_ew_spoof_sector, docs_plans_phase2b_plan_ew_success_neutralised, docs_plans_phase2b_plan_ew_not_roe_gated, docs_plans_phase2b_plan_collateral_contact_ids_list, docs_plans_phase2b_plan_friendly_jammed_penalty, docs_plans_phase2b_plan_civilian_jammed_penalty [EXTRACTED 1.00]

## Communities (151 total, 18 thin omitted)

### Community 0 - "Scoring Engine Tests"
Cohesion: 0.05
Nodes (62): score_session(), able_cooldown_min_s(), classification_result(), contact_metrics(), neutralised_method(), Bands, BandsNode, Condition (+54 more)

### Community 1 - "Generated Pydantic Models"
Cohesion: 0.04
Nodes (89): AffiliationSetEvent, AffiliationSetPayload, AiSuggestion, AiSuggestionAcceptedEvent, AiSuggestionPayload, AiSuggestionRejectedEvent, AiSuggestionShownEvent, AreaZone (+81 more)

### Community 2 - "Sim-core Public API"
Cohesion: 0.06
Nodes (69): EoLevel, EoMode, SensorKind, TraineeEventType, SimEvent, ceilToTick(), createClock(), SimClock (+61 more)

### Community 3 - "API Seed & Scenario Services"
Cohesion: 0.07
Nodes (22): local_auth_id(), Base, created_at(), str_enum(), uuid_pk(), Assignment, Scenario, TerrainPreset (+14 more)

### Community 4 - "Web UI Primitives & Pages"
Cohesion: 0.09
Nodes (46): AFFS, DesignGallery(), HOVER, LINES, Row(), SIGNALS, SURFACES, SWATCH (+38 more)

### Community 5 - "Session Lifecycle Service"
Cohesion: 0.06
Nodes (22): ApiError, TrainingSession, event_to_dict(), recommend_difficulty(), generate_scenario(), get_scenario_row(), list_item(), list_scenarios() (+14 more)

### Community 6 - "Generator Tests & Sweep"
Cohesion: 0.06
Nodes (34): canonical_json(), _count_classes(), generate(), main(), sweep_seeds(), asset_xz(), contacts_by(), many() (+26 more)

### Community 7 - "Schema & Enum Decisions"
Cohesion: 0.04
Nodes (25): Client-side web auth guard, ContactOutcome enum, Decisions ADR log, DESIGN.md design guide, Deterministic visual baselines (__vyuhE2E), Dev-only routes (page.dev.tsx), In-house Tooltip primitive, JSON-lines stdlib logging with request id (+17 more)

### Community 8 - "Sim Runtime & Player Hook"
Cohesion: 0.08
Nodes (34): Hero(), HeroPage(), HeroRoute(), SCENARIOS, SimPlayer, Submit(), Window, withBirds() (+26 more)

### Community 9 - "Realism Sources & Terrain Data"
Cohesion: 0.06
Nodes (44): buildings.geojson in local metres, D4-D5 pop-down low fliers, EO/IR sensor model constants, RF detector bearing strobes, scripts/terrain build_preset.py, Test scenarios S11-S14, AWS Open Data copernicus-dem-30m bucket, Birds as radar false alarms (+36 more)

### Community 10 - "Generator Core & Difficulty"
Cohesion: 0.09
Nodes (27): _apply_popdown(), _build_threat(), _conditions(), _contact(), Ctx, _first_bearing(), _fit_approach(), GenerationError (+19 more)

### Community 11 - "Shared Fixtures & Scenario Types"
Cohesion: 0.10
Nodes (31): S01, terrain, ContactSpec, Scenario, builtIn, contacts, run(), times (+23 more)

### Community 12 - "API Config & Local Auth"
Cohesion: 0.09
Nodes (23): get_app_settings(), AuthMode, Env, Settings, create_local_token(), decode_token(), get_jwks_client(), _unauthorized() (+15 more)

### Community 13 - "HUD Derived State & Commands"
Cohesion: 0.09
Nodes (38): AFFILIATIONS, effectorSites, pickBanner(), ACQ_AFTER_MS, ACQ_REASON, ActionId, ActionState, actionStates() (+30 more)

### Community 14 - "Effectors, EW & ROE Zones"
Cohesion: 0.07
Nodes (36): Behaviour, EffectorKind, ResponseResult, ContactControl, Defender, DEFENDER_HOVER_MPS, DEFENDER_INTERCEPT_FRACTION, DEFENDER_RANGE_FRACTION (+28 more)

### Community 15 - "Contact Kinematics & Boids"
Cohesion: 0.09
Nodes (40): Asset, despawn(), driftOffset(), LAND_RATE_MPS, remainingRouteM(), RTH_ARRIVAL_M, startDrift(), stepHoverLand() (+32 more)

### Community 16 - "Session API Tests"
Cohesion: 0.17
Nodes (28): User, Scenario, assert_error(), fixture_log(), test_allowed_roles(), test_denied_role(), test_unauthenticated_is_401_not_403(), test_get_scenario_errors() (+20 more)

### Community 17 - "Player HUD Panels"
Cohesion: 0.14
Nodes (34): Section(), CommsPanel(), CHIP_HINT, CHIP_TONE, EoCueOverlay(), EoPanel, EoReadout(), EoStateChip() (+26 more)

### Community 18 - "Landing Assets Manifest"
Cohesion: 0.05
Nodes (39): chain-assess, h, w, chain-decide, h, w, chain-detect, h (+31 more)

### Community 19 - "Sim Behaviour Tests"
Cohesion: 0.09
Nodes (32): EoIrSensor, RfSensor, DRIFT_MAX_M, LINK_LOSS_HOVER_MS, BIRD_MIN_AGL_M, TICK_S, createContactState(), RF_STROBE_TTL_MS (+24 more)

### Community 20 - "Terrain, World & LOS"
Cohesion: 0.12
Nodes (31): TerrainPresetMeta, Building, BUILDING_CELL_M, BuildingFootprint, BuildingIndex, buildingTopAt(), cellOf(), cellTopAt() (+23 more)

### Community 21 - "Comms Log & Practice Hints"
Cohesion: 0.08
Nodes (26): CommsLine, CommsLog(), CommsStatus, STATUS_CLASS, usePracticeHints(), CommsBuilder, CommsContext, END_REASON (+18 more)

### Community 22 - "API Terrain & Scoring Tree Loader"
Cohesion: 0.10
Nodes (16): run_migrations_offline(), run_migrations_online(), _url(), get_settings(), available_presets(), Building, _decode_u16(), _load() (+8 more)

### Community 23 - "API App Bootstrap & Rate Limit"
Cohesion: 0.08
Nodes (11): get_db(), make_engine(), make_session_factory(), _clean_request_id(), configure_logging(), JsonFormatter, request_id_middleware(), create_app() (+3 more)

### Community 24 - "Python Enums"
Cohesion: 0.06
Nodes (35): Activity, Affiliation, AltitudeBand, AltitudeRef, AreaZoneKind, Behaviour, BuildingsStatus, ContactCategory (+27 more)

### Community 25 - "Generator Behaviours"
Cohesion: 0.17
Nodes (18): attack_run(), bird_leader(), decoy(), friendly_patrol(), helicopter_transit(), Path, path_time(), recon_loiter() (+10 more)

### Community 26 - "Sensor Siting & Visibility"
Cohesion: 0.14
Nodes (14): _box_distance(), effectors(), _flat(), pick_asset_xz(), radar_site(), _radar_site(), score(), settlement_boxes() (+6 more)

### Community 27 - "Radar Model & Coords"
Cohesion: 0.14
Nodes (28): RadarSensor, angleDiffDeg(), bearingDeg(), slantRange(), wrapDeg(), createDefender(), sectorClear(), resolveEw() (+20 more)

### Community 28 - "Scripted Scenario Seeding"
Cohesion: 0.12
Nodes (15): gameplay_content(), load_scripted(), seed_scenarios(), scenario_rule_violations(), test_generated_class_profiles_match_enums(), test_generated_models_validate_example_scenario(), test_output_is_valid_and_versioned(), _gameplay_bytes() (+7 more)

### Community 29 - "Shared Scenario Schema (zod)"
Cohesion: 0.08
Nodes (25): BuildingsStatus, trackEvent(), named(), AiSuggestion, AreaZone, BorderLineZone, duplicates(), EffectorConfig (+17 more)

### Community 30 - "Sun, Time Bands & Class Profiles"
Cohesion: 0.13
Nodes (23): TimeBand, CLASS_PROFILES, DAY_MIN_EL_DEG, GENERATOR_BAND_WINDOWS_DEG, NIGHT_SUN_EL_DEG, timeBandForElevation(), timeBandLabel, computeEnvironment() (+15 more)

### Community 31 - "Sim Tick & Track Pipeline"
Cohesion: 0.15
Nodes (29): advanceClock(), formatStrobeId(), rfBadgeFor(), createSim(), applyCommand(), applyResponse(), dropTrack(), effectorFor() (+21 more)

### Community 32 - "Phase 2B Plan (EW, v2 Tree)"
Cohesion: 0.10
Nodes (19): seed/generated/class_profiles.json, trees/default_v2.json, Phase 2 Part B Plan (Sensors, EW, Scoring), Boids Bird Flocks (Reynolds 1987), CIVILIAN_JAMMED -5 (collateral only), Contact Control Modes (PATH/HOVER_LAND/RTH/DRIFT/BOID), default_v2 Scoring Tree, EW_JAM +/-10 deg Sector (+11 more)

### Community 33 - "Event Plausibility Checks"
Cohesion: 0.16
Nodes (15): advance_state(), check_batch(), bad(), LogState, Violation, ev(), rules(), started() (+7 more)

### Community 34 - "Affiliation Symbols & Radar Scope"
Cohesion: 0.16
Nodes (21): AffiliationSymbol(), RadarScope(), frame(), FRAMES, Stalk(), stalkMaterial(), STALKS, AFFILIATION_STYLE (+13 more)

### Community 35 - "Result Screen & Feedback"
Cohesion: 0.12
Nodes (22): classLabel(), COMPONENT_LABEL, END_LABEL, pickNext(), RESPONSE_LABEL, ResultScreen(), trueAffiliation(), CLASS_TOKENS (+14 more)

### Community 36 - "Web API Client & Errors"
Cohesion: 0.10
Nodes (24): ApiError, apiFetch(), getToken(), RequestOptions, TokenGetter, ClientMeta, CompleteSessionRequest, CreateSessionRequest (+16 more)

### Community 37 - "Terrain Builder Tests"
Cohesion: 0.10
Nodes (12): build(), dem(), elevation(), fake_buildings(), local_square(), test_buildings_projected_filtered_and_heighted(), test_dem_not_covering_box_is_a_clear_error(), test_heightmap_layout_and_meta() (+4 more)

### Community 38 - "API Test Fixtures"
Cohesion: 0.14
Nodes (15): alembic_config(), app(), auth_header(), _header(), client(), db(), make_user(), _make() (+7 more)

### Community 39 - "Trainee & Sim Event Schemas"
Cohesion: 0.08
Nodes (25): AffiliationSetEvent, AiSuggestionAcceptedEvent, AiSuggestionPayload, AiSuggestionRejectedEvent, AiSuggestionShownEvent, base, CameraSlewedEvent, ClassifiedEvent (+17 more)

### Community 40 - "Scenario Validator"
Cohesion: 0.11
Nodes (24): args, clutter, json, pctAt, results, root, target, check() (+16 more)

### Community 41 - "Phase 3a Plan (Generator, ROE)"
Cohesion: 0.11
Nodes (22): seed/generated/time_bands.json, trees/default_v3.json, apps/api/Dockerfile, default_v3 Scoring Tree (drop before neutralisation = leak), Phase 3a Plan (Generator, ROE, Swarms), BLOCKED_NO_KINETIC ResponseResult, CONTACT_DROPPED System Event, default_v3 Scoring Tree (+14 more)

### Community 42 - "EW & Defender Decisions"
Cohesion: 0.11
Nodes (14): default_v1 scoring tree, default_v2 scoring tree, default_v3 scoring tree, Difficulty recommendation RULE_V1, DROP and RTH waypoints (CONTACT_DROPPED), Elo adaptive difficulty, EW_JAM and EW_SPOOF responses, Ground-truth defender (defender.ts) (+6 more)

### Community 43 - "Threat Route Planning"
Cohesion: 0.12
Nodes (8): _approach(), _deviation(), fit_bearing(), masked_route(), ok(), pick_axes(), _simplify(), CoarseGrid

### Community 44 - "HUD Zone Overlays"
Cohesion: 0.17
Nodes (19): zoneLabelNdc, ZoneLabels(), BorderLine(), LabelAnchor(), ndc, NoKineticZone(), useGround(), V3 (+11 more)

### Community 45 - "JSON Schema Export & Difficulty"
Cohesion: 0.10
Nodes (22): addDiscriminators(), bundle, defs, difficulty, difficultyFile, DISCRIMINATOR_KEYS, here, isObj() (+14 more)

### Community 46 - "Generator Environment & RNG Streams"
Cohesion: 0.13
Nodes (10): band_times(), hhmm(), pick_date(), pick_time(), sun_elevation_deg(), time_band_for_elevation(), weather_for(), stream() (+2 more)

### Community 47 - "Phase 3.0 Design Plan"
Cohesion: 0.11
Nodes (17): components/hud/primitives/, Phase 3.0 Design Foundation Plan, Design Tokens + Type Scale (DESIGN 3/4), Dev-only Routes (page.dev.tsx), EO MAN/CUE/ACQ/TRK StateChip, Ground-truth Defender (createDefender), Hide test-tagged Scenarios from Trainees, HUD Primitives + /dev/ui Gallery (+9 more)

### Community 48 - "Playwright E2E Specs"
Cohesion: 0.21
Nodes (15): comms(), lastComms(), Window, REQUEST, beginSession(), HIDE_WEBGL, login(), openBriefing() (+7 more)

### Community 49 - "sim-core Package Manifest"
Cohesion: 0.09
Nodes (22): dependencies, suncalc, @vyuh/shared, devDependencies, @types/node, @types/suncalc, vitest, exports (+14 more)

### Community 50 - "Web Package Deps"
Cohesion: 0.09
Nodes (21): eslint, eslint-config-prettier, @types/node, typescript, vitest, @vyuh/shared, zod, name (+13 more)

### Community 51 - "Determinism & Scoring Decisions"
Cohesion: 0.10
Nodes (12): Camera pointing as sim state (CAMERA_SLEWED), Decision-tree scoring format, EO_IDENTIFIABLE event, humaniseFeedback client copy, Preset meta.json (origin, utcOffsetMin), Score scale and component max, sim-core seeded RNG, Time-of-day rule (time-band.ts) (+4 more)

### Community 52 - "Generator Design Decisions"
Cohesion: 0.16
Nodes (11): Error code to HTTP status map, Generate rate limit (in-memory), Generator seed sweep, heightmap.u16 load format, POST /scenarios/generate, Procedural scenario generator (GENERATOR_VERSION 1), Real sim logs as API fixtures, Scenario validator (validate.ts) (+3 more)

### Community 53 - "Terrain Mesh LOD"
Cohesion: 0.14
Nodes (18): buildTileLevel(), CHUNKS, DAY_MATERIAL, EDGE_FADE_END, EDGE_FADE_START, edgeFadeMaterial(), FIELD_HIGH, FIELD_LOW (+10 more)

### Community 54 - "Event Batcher"
Cohesion: 0.16
Nodes (8): BatcherOptions, BatchSender, DEFAULT_BACKOFF, EventBatcher, FatalBatchError, sleep(), setup(), MAX_EVENTS_PER_BATCH

### Community 55 - "Heightmap Encoding"
Cohesion: 0.16
Nodes (7): decode_heights(), encode_heights(), EncodedHeights, _json_bytes(), png_preview_bytes(), sample_bilinear(), test_u16_round_trip_precision()

### Community 56 - "shared Package Manifest"
Cohesion: 0.10
Nodes (19): dependencies, zod, devDependencies, @types/node, vitest, exports, ./examples/*, ./schema/vyuh.schema.json (+11 more)

### Community 57 - "Shared Enums, Reports & Threats"
Cohesion: 0.14
Nodes (17): Activity, AltitudeBand, AltitudeRef, AreaZoneKind, ContactCategory, ControlLink, FalseContactDensity, KillChainStage (+9 more)

### Community 58 - "RBAC & Migrations"
Cohesion: 0.12
Nodes (6): upgrade(), upgrade(), require_role(), check(), client(), test_require_role_needs_roles()

### Community 59 - "Supabase Auth Tests"
Cohesion: 0.21
Nodes (8): client(), _get_me(), _jwks(), test_existing_user_keeps_db_role(), test_invalid_tokens_rejected(), test_local_token_rejected_in_supabase_mode(), test_valid_token_provisions_trainee(), _token()

### Community 60 - "Generator Contacts & Static Checks"
Cohesion: 0.16
Nodes (10): ai_accuracy(), ai_suggestion(), classes_for(), emissions(), has_rf_option(), profiles(), silent_options(), speed_for() (+2 more)

### Community 61 - "Phase 1 MVP Plan"
Cohesion: 0.11
Nodes (16): services/scoring/, trees/default_v1.json, S01 Scripted-Scenario Guard (45 s warning), Phase 1 MVP Loop Plan, Basic Radar Pd from Radar Equation, default_v1 Scoring Tree, Determinism Vitest (same scenario + commands => same state), Event Batcher (2 s + on end, retry with backoff) (+8 more)

### Community 62 - "Tactical 3D Scene"
Cohesion: 0.24
Nodes (17): EoScene(), renderEoFrame(), buildBuildingsGeometry(), BuildingsMesh(), Drones(), FamilyMesh(), useSimRuntime(), GroundRing() (+9 more)

### Community 63 - "3D Meshes & IR Materials"
Cohesion: 0.16
Nodes (16): DAY_MATERIAL, geometryCache, birdGeometry(), FAMILY, fixedWingGeometry(), GEOMETRY, helicopterGeometry(), normalised() (+8 more)

### Community 64 - "Sky & Environment Look"
Cohesion: 0.13
Nodes (17): Environment(), environmentLook, EnvironmentVariant, HAZE, HEMI_GROUND_DAY, HEMI_GROUND_NIGHT, HEMI_SKY_DAY, HEMI_SKY_NIGHT (+9 more)

### Community 65 - "Phase 3b Plan (Library, Urban)"
Cohesion: 0.17
Nodes (16): e2e/checkpoint-3b.spec.ts, Briefing Page (DESIGN 11.4), Training / Scenario Select Redesign (DESIGN 11.3), URBAN_GENERIC Preset, Phase 3b Plan (Library, Urban, Briefing), ScenarioListItem.bestScore, Briefing Page /train/scenario/[id] with LOS Coverage Worker, Checkpoint A (urban bbox vetting) (+8 more)

### Community 66 - "EO Track Tests"
Cohesion: 0.19
Nodes (10): Sim, run(), crossing(), EO, lockFirst(), runLocked(), tickUntil(), toTrack() (+2 more)

### Community 67 - "ROE, Zones & Track Filter Decisions"
Cohesion: 0.17
Nodes (9): 2D alpha-beta track filter, drei Html labels, EO video auto-track (MANUAL/CUE/TRACK), HUD zone rendering and labels, NO_KINETIC zone, Practice hints (usePracticeHints), Radar track association by ground truth, ROE (WEAPONS_TIGHT) (+1 more)

### Community 68 - "Spec Overview & Demo"
Cohesion: 0.11
Nodes (19): Admin Role, Demo Seed Data, DESIGN.md, Feature Priority P0-P3, Guest Demo Mode, Instructor Role, Judge Demo Flow, Keyboard Shortcuts (+11 more)

### Community 69 - "Spec Responses & Scenario Library"
Cohesion: 0.13
Nodes (19): ControlLink Enum, Copernicus GLO-30 DEM, EW_JAM, EW Sector Rules, EW_SPOOF, heightmap.u16, JK_MOUNTAIN Preset, Phase 2 Realism Core (+11 more)

### Community 70 - "Golden Rules & Architecture"
Cohesion: 0.14
Nodes (11): CI typescript job (TS lint + vitest), After-Action Review (AAR) dashboard, default_v3 scoring tree, Local ENU coordinates convention, apps/web Next.js frontend, React Three Fiber renderer, Decision-tree scoring engine, packages/sim-core (deterministic 20 Hz sim) (+3 more)

### Community 71 - "API Error Handlers"
Cohesion: 0.24
Nodes (6): _api_error(), error_response(), _http_error(), install_error_handlers(), _unhandled(), _validation_error()

### Community 72 - "Base TS Config"
Cohesion: 0.11
Nodes (17): compilerOptions, allowImportingTsExtensions, forceConsistentCasingInFileNames, isolatedModules, lib, module, moduleResolution, noEmit (+9 more)

### Community 73 - "Scenarios Router"
Cohesion: 0.14
Nodes (3): generate_scenario(), get_scenario(), list_scenarios()

### Community 74 - "Sessions Router"
Cohesion: 0.17
Nodes (4): append_events(), complete_session(), create_session(), get_session()

### Community 75 - "Phase 3 Requirements"
Cohesion: 0.14
Nodes (12): services/generator/, Phase 3 Requirements (3a/3b), CI Fails Above 2 % Sweep Failures, Entity Cap <= 60 Active Entities, Intel Integrated-GPU FPS Check (deferred), Placeholder Village Buildings for PUNJAB_PLAINS, Practice vs Assessment Mode, ROE Semantics (FREE / TIGHT / HOLD / NO_KINETIC) (+4 more)

### Community 76 - "Generate API Tests"
Cohesion: 0.26
Nodes (8): generate(), test_deterministic_and_stored_once_per_user(), test_generated_runs_stay_out_of_the_library_list(), test_rate_limited_per_user(), test_requires_auth_and_valid_input(), test_staff_may_set_every_field(), test_trainee_may_set_only_terrain_time_band_difficulty_and_seed(), test_visible_by_id_to_creator_and_staff_only()

### Community 77 - "shadcn Config"
Cohesion: 0.12
Nodes (16): aliases, components, hooks, lib, ui, utils, rsc, $schema (+8 more)

### Community 78 - "Canvas & Pixel Ratio"
Cohesion: 0.23
Nodes (12): AdaptivePixelRatio(), deviceRatio(), SimCanvas(), SimRuntimeContext, ADAPTIVE_FPS_BOUNDS, ADAPTIVE_PIXEL_RATIO_KEY, adaptivePixelRatioEnabled(), MAX_PIXEL_RATIO (+4 more)

### Community 79 - "Web Runtime Deps"
Cohesion: 0.12
Nodes (17): dependencies, class-variance-authority, clsx, lucide-react, next, @radix-ui/react-slot, react, react-dom (+9 more)

### Community 80 - "Terrain Preset Builder"
Cohesion: 0.23
Nodes (5): build_preset(), buildings_to_features(), fetch_with_retry(), Grid, reproject_dem()

### Community 81 - "Seeded RNG"
Cohesion: 0.18
Nodes (10): Flock, assertUint32(), createRng(), createStream(), deriveStreamSeed(), fmix32(), fnv1a(), mulberry32() (+2 more)

### Community 82 - "Action Bar & Top Bar"
Cohesion: 0.24
Nodes (13): Action(), ActionBar(), AFFILIATIONS, ClassifyMenu(), EffectorCell(), Group(), CooldownRing(), Kbd() (+5 more)

### Community 83 - "Web Auth Provider"
Cohesion: 0.23
Nodes (13): setTokenGetter(), AuthContext, AuthContextValue, AuthProvider(), AuthStatus, currentToken(), describe(), readLocalToken() (+5 more)

### Community 84 - "Spec Sim-core Sensors"
Cohesion: 0.17
Nodes (14): Alpha-Beta Track Filter, CAMERA_SLEWED Event, createSim API, ENU Coordinates, EO/IR Camera Model, EO Video Auto-Track, Johnson Criteria, Line of Sight Raycast (+6 more)

### Community 85 - "FPS Benchmark Spec"
Cohesion: 0.13
Nodes (9): Case, CASES, COOLDOWN_MS, FrameWindow, MODES, SCALES, VIEWPORTS, Phase 3b FPS measurement method (+1 more)

### Community 86 - "LOS & World Decisions"
Cohesion: 0.15
Nodes (9): Building LOS index (25 m cells), Generator radar visibility heuristic (visibility.py), Radar LOS masking, Scripted-scenario guard (minimum warning), Terrain LOD chunks, URBAN_GENERIC terrain preset, World object (heightmap, buildings, LOS), PROCEDURAL_HILLS terrain preset (+1 more)

### Community 87 - "Spec Events & Scoring Trees"
Cohesion: 0.15
Nodes (14): CONTACT_DROPPED Event, default_v1 Tree, default_v2 Tree, default_v3 Tree, EO_IDENTIFIABLE Event, Event Types, Minimum Warning, Per-Contact Metrics (+6 more)

### Community 88 - "Root ESLint Config"
Cohesion: 0.15
Nodes (13): engines, node, eslint, eslint-config-prettier, typescript, name, packageManager, private (+5 more)

### Community 89 - "Hillshade Generator"
Cohesion: 0.18
Nodes (9): UI, chunk(), crc32(), CRC_TABLE, encodePng(), hex(), Meta, TONES (+1 more)

### Community 90 - "Landing Video Recorder"
Cohesion: 0.20
Nodes (12): codecFor(), crop(), Encoder, ffmpeg(), HERO, heroReady(), LAUNCH, OUT (+4 more)

### Community 91 - "Spec Scoring & DB"
Cohesion: 0.16
Nodes (13): Database Schema, Decision Tree Scoring, Event Batcher, Plausibility Checks, POST /sessions/{id}/complete, POST /sessions/{id}/events, Score Schema, scores Table (+5 more)

### Community 92 - "Sources Page Markdown"
Cohesion: 0.26
Nodes (10): dynamic, metadata, SourcesPage(), cells(), inline(), ListItem, Markdown(), renderList() (+2 more)

### Community 93 - "World Loader"
Cohesion: 0.26
Nodes (10): cache, clearWorldCache(), Fetch, fetchMeta(), fetchOk(), fetchWorld(), loadPresetMeta(), metaCache (+2 more)

### Community 94 - "Web Dev Deps"
Cohesion: 0.15
Nodes (13): devDependencies, eslint, eslint-config-next, eslint-config-prettier, @playwright/test, tailwindcss, @tailwindcss/postcss, @types/node (+5 more)

### Community 95 - "Web Scripts"
Cohesion: 0.15
Nodes (13): scripts, build, dev, e2e, e2e:checkpoint, e2e:fps, e2e:fps:150, e2e:update (+5 more)

### Community 96 - "Web TS Config"
Cohesion: 0.15
Nodes (12): compilerOptions, allowJs, incremental, jsx, lib, paths, plugins, types (+4 more)

### Community 97 - "Spec API & AI Layer"
Cohesion: 0.21
Nodes (13): AI-Assist Panel, AI Over-Trust Metric, AI Service, API Error Codes, LLM Debrief, Phase 5 AI Layer, POST /scenarios/from-text, POST /scenarios/generate (+5 more)

### Community 98 - "Backend Stack & Services"
Cohesion: 0.20
Nodes (12): CI python job (ruff + pytest), AI-assist panel with over-trust metric, Elo adaptive difficulty, apps/api FastAPI backend, AI layer (Gemini Flash via OpenRouter), PostgreSQL database, Supabase Auth with AUTH_MODE=local fallback, api service (profile api, offline env) (+4 more)

### Community 99 - "HUD Design Rules"
Cohesion: 0.17
Nodes (9): Event batcher (POST /sessions/{id}/events), APP-6 affiliation colours (hostile/friendly/neutral/unknown), AffiliationSymbol APP-6 symbology, Comms log panel, Avionics magenta cue token, /dev/ui design gallery, HUD primitives (Panel, Readout, StateChip, CooldownRing...), Panel anatomy (+1 more)

### Community 100 - "Spec Contacts & Behaviours"
Cohesion: 0.17
Nodes (12): Affiliation Enum, APP-6 Symbology, ATTACK_RUN, Behaviour Enum, Boids, ContactSpec, DECOY, NonThreatClass Enum (+4 more)

### Community 101 - "Shared Schema Tests"
Cohesion: 0.17
Nodes (10): ErrorEnvelope, EventBatchRequest, SessionDetailResponse, ERROR_HTTP_STATUS, EventType, NonThreatClass, ThreatClass, GenerateRequest (+2 more)

### Community 102 - "Supabase User Provisioning"
Cohesion: 0.20
Nodes (3): _display_name(), get_current_user(), _provision_supabase_user()

### Community 103 - "API Error Tests"
Cohesion: 0.27
Nodes (6): client(), conflict(), test_api_error_envelope(), test_unhandled_error_is_internal_without_leaking(), test_unknown_route_is_not_found(), test_validation_error_envelope()

### Community 104 - "Generator Sweep Script"
Cohesion: 0.18
Nodes (4): maxFailPct, out, perDifficulty, root

### Community 105 - "Design Checklist & Schema Rules"
Cohesion: 0.22
Nodes (5): CI schemas job (gen:schemas no diff), FPS budget (30 fps on integrated graphics), gen:schemas pipeline (zod -> JSON Schema -> Pydantic), packages/shared (zod schemas, enums), Checks (lint, test, pytest, gen:schemas)

### Community 106 - "Project Docs & Status"
Cohesion: 0.20
Nodes (9): visual.spec.ts screenshot baselines, window.__vyuhE2E sim-time hook, Current status and tech debt (§14), Kill-chain loop (Detect-Track-Identify-Decide-Respond-Assess), Project phases 0-6, docs/SPEC.md, VYUH Counter-Drone Threat Simulation Trainer, Landing page guidance (+1 more)

### Community 107 - "Codegen & Class Profile Decisions"
Cohesion: 0.24
Nodes (6): CI no-diff check on generated files, CLASS_PROFILES threat library, gen:schemas codegen pipeline (zod to JSON Schema to Pydantic), zod 4 toJSONSchema, Link-loss failsafe behaviour (hover-land / return-home), Representative turn and climb rates

### Community 108 - "SIM_VERSION & Plausibility Decisions"
Cohesion: 0.22
Nodes (5): Event-log plausibility checks, Phase 4 AAR replay, Scenario seeder (seed_scenarios), session_events seq column, SIM_VERSION

### Community 109 - "Root Scripts"
Cohesion: 0.20
Nodes (10): scripts, dev, e2e, format, gen:hillshade, gen:schemas, lint, lint:ts (+2 more)

### Community 110 - "OSM Fetch"
Cohesion: 0.20
Nodes (6): EmptyReplyError, osmnx_source(), fetch(), PresetError, test_overpass_empty_reply_is_not_retried(), empty()

### Community 111 - "API Package Manifest"
Cohesion: 0.22
Nodes (8): description, name, private, scripts, dev, gen:pydantic, lint, version

### Community 112 - "Root Layout & Fonts"
Cohesion: 0.31
Nodes (6): plexCondensed, plexMono, plexSans, metadata, RootLayout(), viewport

### Community 113 - "Landing Page"
Cohesion: 0.33
Nodes (7): CHAIN, Crop(), LandingPage(), REALISM, SectionTitle(), Shot, HeroVideo()

### Community 114 - "Spec AAR & Determinism"
Cohesion: 0.22
Nodes (7): AAR Replay, Contact Report, Contact Report Scoring, Mulberry32 Named RNG Streams, Phase 4 AAR and Instructor, sessions Table, SIM_VERSION

### Community 115 - "Shared Score Schema"
Cohesion: 0.22
Nodes (8): ClassificationResult, Difficulty, RecommendationBasis, ResponseKind, Penalty, PerContactMetrics, Score, ScoreComponents

### Community 116 - "Per-contact Metrics"
Cohesion: 0.25
Nodes (5): ClassificationResult, ContactClass, ContactOutcome, ResponseKind, _per_contact()

### Community 117 - "Generated Briefing"
Cohesion: 0.32
Nodes (5): briefing(), compass(), effector_line(), sector(), Generated Briefing Markdown

### Community 118 - "Error Status Mirror Check"
Cohesion: 0.29
Nodes (5): test_status_map_matches_shared_ts(), grid_from_args(), main(), _parse_args(), test_cli_rejects_bad_name()

### Community 119 - "Label Decluttering"
Cohesion: 0.32
Nodes (5): LabelRequest, overlaps(), placeLabels(), Rect, bounds

### Community 120 - "Scripted Library S04-S15"
Cohesion: 0.25
Nodes (7): Scripted Scenarios S04-S10, S08 Fog Line (winter fog PUNJAB), S15 Birds or Drone?, Scripted Library S04-S10, S15, S02 Two Axes, test/library-scenarios.test.ts, scripts/scenarios/build_scripted.py

### Community 121 - "Root Dev Deps"
Cohesion: 0.25
Nodes (8): devDependencies, eslint, eslint-config-prettier, @eslint/js, globals, prettier, typescript, typescript-eslint

### Community 124 - "FPS & Pixel Ratio Decisions"
Cohesion: 0.29
Nodes (4): Adaptive canvas pixel ratio, EO/IR picture at 30 fps, FPS measurement method (headless Chrome, integrated GPU), Representative PTZ EO camera (30-1.5 deg, 640x360)

### Community 125 - "Spec Difficulty & Weather"
Cohesion: 0.29
Nodes (7): Analytics Service, Difficulty Scaling, Elo Adaptive Difficulty, Open-Meteo, Pop-Down Low Fliers, Radar Clutter Factor, Weather Presets

### Community 126 - "Generator & Terrain Presets (Overview)"
Cohesion: 0.33
Nodes (6): CI generator sweep job (20 per difficulty, <=2% fail), CI terrain pipeline job, Seeded procedural scenario generator, Terrain presets (PUNJAB_PLAINS, JK_MOUNTAIN), Briefing (pre-mission) screen, Scenario select / Training screen

### Community 127 - "Health Check Tests"
Cohesion: 0.53
Nodes (4): test_cors_allows_configured_origin_only(), test_health_ok(), test_request_id_is_echoed(), test_unsafe_request_id_is_replaced()

### Community 128 - "Auth Decisions"
Cohesion: 0.47
Nodes (3): Auth identity mapping and RBAC, Local auth mode (dev-login), Supabase Auth JWKS verification

### Community 129 - "shared TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 130 - "Test TS Config"
Cohesion: 0.33
Nodes (5): compilerOptions, types, extends, include, ../../tsconfig.base.json

### Community 133 - "Building Height Rules"
Cohesion: 0.40
Nodes (3): building_height_m(), _number(), test_building_height_rules()

### Community 137 - "Spec ROE & Intercept"
Cohesion: 0.50
Nodes (4): INTERCEPT, NO_KINETIC Zone, ROE, ZoneKind Enum

### Community 138 - "sim-core TS Config"
Cohesion: 0.50
Nodes (3): extends, include, ../../tsconfig.base.json

### Community 139 - "Prettier Config"
Cohesion: 0.50
Nodes (3): printWidth, singleQuote, trailingComma

## Knowledge Gaps
- **139 isolated node(s):** `vyuh-api`, `@vyuh/shared`, `@vyuh/sim-core`, `zod`, `@tailwindcss/postcss` (+134 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 975 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **18 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Phase 2 Part B Plan (Sensors, EW, Scoring)` connect `Phase 2B Plan (EW, v2 Tree)` to `Affiliation Symbols & Radar Scope`, `API Seed & Scenario Services`, `Web UI Primitives & Pages`, `Phase 3 Requirements`, `Phase 3.0 Design Plan`, `Player HUD Panels`, `Phase 1 MVP Plan`, `World Loader`?**
  _High betweenness centrality (0.222) - this node is a cross-community bridge._
- **Are the 4 inferred relationships involving `createSim()` (e.g. with `createContactState()` and `byId()`) actually correct?**
  _`createSim()` has 4 INFERRED edges - model-reasoned connections that need verification._
- **What connects `vyuh-api`, `@vyuh/shared`, `@vyuh/sim-core` to the rest of the system?**
  _139 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Scoring Engine Tests` be split into smaller, more focused modules?**
  _Cohesion score 0.05147563486616335 - nodes in this community are weakly interconnected._
- **Why does `Phase 3a Plan (Generator, ROE, Swarms)` connect `Phase 3a Plan (Generator, ROE)` to `Phase 3b Plan (Library, Urban)`, `Generator Core & Difficulty`, `Phase 3 Requirements`, `Phase 3.0 Design Plan`, `FPS Benchmark Spec`, `API Terrain & Scoring Tree Loader`, `Generated Briefing`, `Generator Behaviours`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Should `Generated Pydantic Models` be split into smaller, more focused modules?**
  _Cohesion score 0.04085045389393215 - nodes in this community are weakly interconnected._
- **Why does `react` connect `Web UI Primitives & Pages` to `Sky & Environment Look`, `Affiliation Symbols & Radar Scope`, `Result Screen & Feedback`, `Sim Runtime & Player Hook`, `HUD Zone Overlays`, `HUD Derived State & Commands`, `Canvas & Pixel Ratio`, `Root Layout & Fonts`, `Landing Page`, `Action Bar & Top Bar`, `Player HUD Panels`, `Web Auth Provider`, `Comms Log & Practice Hints`, `Terrain Mesh LOD`, `Web Package Deps`, `Sources Page Markdown`, `Tactical 3D Scene`, `3D Meshes & IR Materials`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._