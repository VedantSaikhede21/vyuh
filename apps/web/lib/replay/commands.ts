import type { Commands } from '@/lib/sim/commands';

const noop = (): void => undefined;

/**
 * The player's command surface for a replay: every trainee action is a no-op,
 * because a replay only shows what the trainee did (the log is never changed).
 */
export function readOnlyCommands(): Commands {
  return {
    select: noop,
    cycle: noop,
    markDetected: noop,
    classify: noop,
    acceptAi: noop,
    rejectAi: noop,
    setAffiliation: noop,
    monitor: noop,
    jam: noop,
    spoof: noop,
    armIntercept: noop,
    confirmIntercept: noop,
    cancel: noop,
    openReport: noop,
    updateReport: noop,
    submitReport: noop,
    togglePause: noop,
    slewToSelected: noop,
    slewBy: noop,
    toggleEoMode: noop,
    endSlew: noop,
    zoom: noop,
    armEnd: noop,
    abort: noop,
  };
}
