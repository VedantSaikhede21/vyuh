'use client';

import type { World } from '@vyuh/sim-core';
import { cn } from '@/lib/utils';

/** The short on-map credit (terrain plan §8.2): full wording is on /sources. */
export function terrainCreditLine(hasImagery: boolean): string {
  return `${hasImagery ? 'Imagery © Copernicus Sentinel-2 · ' : ''}DEM Copernicus GLO-30 · © OpenStreetMap`;
}

/** Small credit in the corner of the tactical view. Not on the EO view: that is a camera. */
export function TerrainCredit({ world, className }: { world: World; className?: string }) {
  const meta = world.meta;
  if (!meta || meta.files.albedo === undefined) return null;
  return (
    <span
      data-testid="terrain-credit"
      className={cn(
        'pointer-events-none absolute bottom-1 right-2 z-10 bg-bg-0/70 px-1.5 text-small text-text-2',
        className,
      )}
    >
      {terrainCreditLine(true)}
    </span>
  );
}
