// Bumped whenever sim behaviour changes (a replay of the same scenario + commands
// would differ). Sessions store it; Phase 4 replay must check it (decision 48).
// 1 = Phase 2 Part A; 2 = radar clutter + rain, alpha-beta track filter;
// 3 = DROP / RTH waypoint actions, WEAPONS_TIGHT class check, NO_KINETIC gate;
// 4 = IR range cap ramps from 1 × visibility in fog to 1.5 × in haze (decision 94).
export const SIM_VERSION = 4;
