// Bumped whenever sim behaviour changes (a replay of the same scenario + commands
// would differ). Sessions store it; Phase 4 replay must check it (decision 48).
// 1 = Phase 2 Part A; 2 = radar clutter + rain, alpha-beta track filter;
// 3 = DROP / RTH waypoint actions, WEAPONS_TIGHT class check, NO_KINETIC gate.
export const SIM_VERSION = 3;
