// The atmosphere phase's old-look switch (docs/plans/atmosphere-plan.md §4): add
// `?atmos=0` to the URL to draw today's linear fog and sky instead of the
// physical fog, so before / after stills come from the same build. Without the
// parameter, localStorage `vyuh.atmos` = `0` does the same (the FPS spec sets it,
// because its sessions open through client-side navigation). Read once per page
// load: materials are wrapped when their modules load. Remove when the user
// approves the new look for good.

export const ATMOS_STORAGE_KEY = 'vyuh.atmos';

let enabled: boolean | null = null;

function readSwitch(): string | null {
  const param = new URLSearchParams(window.location.search).get('atmos');
  if (param !== null) return param;
  try {
    return window.localStorage.getItem(ATMOS_STORAGE_KEY);
  } catch {
    return null;
  }
}

/** True unless the page was opened with `?atmos=0` (or the storage key says 0). */
export function atmosEnabled(): boolean {
  if (enabled !== null) return enabled;
  try {
    enabled = readSwitch() !== '0';
  } catch {
    // No window (server render): the default look.
    enabled = true;
  }
  return enabled;
}
