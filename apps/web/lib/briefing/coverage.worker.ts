import { coverageGrid, GRID, type SensorSite } from './coverage';
import { loadWorld } from '../terrain/load-world';

// Computes briefing LOS coverage off the main thread (plan Step 12). Messages:
// in  { id, preset, sites, aglM }
// out { id, progress } while running, then { id, grids } or { id, error }.

export interface CoverageRequest {
  id: number;
  preset: string;
  sites: SensorSite[];
  aglM: number;
}

/** The worker global, typed locally (the app's lib is DOM, not WebWorker). */
interface WorkerScope {
  onmessage: ((e: MessageEvent<CoverageRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
}

const scope = self as unknown as WorkerScope;

scope.onmessage = (e: MessageEvent<CoverageRequest>) => {
  const { id, preset, sites, aglM } = e.data;
  loadWorld(preset)
    .then((world) => {
      const grids: Uint8Array[] = [];
      const total = sites.length * GRID;
      sites.forEach((site, i) => {
        grids.push(
          coverageGrid(world, site, aglM, GRID, (row) => {
            if (row % 8 === 7) scope.postMessage({ id, progress: (i * GRID + row + 1) / total });
          }),
        );
      });
      scope.postMessage(
        { id, grids },
        grids.map((g) => g.buffer),
      );
    })
    .catch((err: unknown) => {
      scope.postMessage({ id, error: err instanceof Error ? err.message : 'Coverage failed' });
    });
};
