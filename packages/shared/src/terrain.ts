import { z } from 'zod';
import { BuildingsStatus } from './enums.ts';
import { named } from './registry.ts';
import { LatLon } from './scenario.ts';

// Terrain preset contract (SPEC §14): apps/web/public/terrain/<NAME>/meta.json,
// written by scripts/terrain/build_preset.py. The preset meta is authoritative
// for the origin and UTC offset (docs/decisions.md 33).

export const TerrainPresetFiles = named(
  'TerrainPresetFiles',
  z.object({
    /** Raw little-endian uint16, resolution², row 0 = south, column 0 = west. */
    heightmap: z.string().min(1),
    /** 16-bit north-up PNG, human preview only. */
    preview: z.string().min(1).optional(),
    /** GeoJSON FeatureCollection of Polygons in local metres [x, z]. */
    buildings: z.string().min(1),
  }),
);
export type TerrainPresetFiles = z.infer<typeof TerrainPresetFiles>;

export const TerrainPresetMeta = named(
  'TerrainPresetMeta',
  z
    .object({
      name: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
      origin: LatLon,
      /** Local time = UTC + utcOffsetMin (IST = 330). */
      utcOffsetMin: z.int().min(-720).max(840),
      /** Side of the square map, metres, centred on the origin. */
      sizeM: z.number().positive(),
      /** Samples per side. */
      resolution: z.int().min(2).max(4097),
      /** sizeM / (resolution − 1). */
      metresPerPx: z.number().positive(),
      /** Absolute elevation of the origin, m above sea level. */
      originElevM: z.number(),
      /** u16 0 ↦ relMinM, 65535 ↦ relMaxM (metres relative to originElevM). */
      relMinM: z.number(),
      relMaxM: z.number(),
      minElevM: z.number(),
      maxElevM: z.number(),
      buildingsStatus: BuildingsStatus,
      buildingCount: z.int().min(0),
      files: TerrainPresetFiles,
      source: z.string().min(1),
      attribution: z.array(z.string().min(1)).min(1),
    })
    .superRefine((m, ctx) => {
      if (m.relMaxM < m.relMinM) {
        ctx.addIssue({ code: 'custom', path: ['relMaxM'], message: 'relMaxM < relMinM' });
      }
      if (Math.abs(m.metresPerPx - m.sizeM / (m.resolution - 1)) > 1e-6 * m.sizeM) {
        ctx.addIssue({
          code: 'custom',
          path: ['metresPerPx'],
          message: 'metresPerPx must equal sizeM / (resolution − 1)',
        });
      }
    }),
);
export type TerrainPresetMeta = z.infer<typeof TerrainPresetMeta>;

/** Building footprint properties in buildings.geojson. */
export const BuildingProperties = named(
  'BuildingProperties',
  z.object({ heightM: z.number().positive() }),
);
export type BuildingProperties = z.infer<typeof BuildingProperties>;
