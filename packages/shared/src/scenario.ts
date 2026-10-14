import { z } from 'zod';
import {
  AreaZoneKind,
  Affiliation,
  AltitudeRef,
  Behaviour,
  ContactClass,
  ControlLink,
  Difficulty,
  EffectorKind,
  FalseContactDensity,
  NonThreatClass,
  Roe,
  ThreatClass,
  WaypointAction,
} from './enums.ts';
import { named } from './registry.ts';

// Coordinates (SPEC §4): x = east (m), z = north (m), y = metres above ground level.
// 2D points are [x, z]. The Three.js flip happens only in sim-core/src/coords.ts.

export const SCENARIO_SCHEMA_VERSION = 1;

/** "HH:mm", 24-hour local time at the terrain preset. */
export const TimeOfDay = named(
  'TimeOfDay',
  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm'),
);

/** Seeds are uint32 (mulberry32). */
export const Seed = named('Seed', z.int().min(0).max(0xffffffff));

export const Weather = named(
  'Weather',
  z.object({
    visibilityM: z.number().min(0),
    rainMmph: z.number().min(0),
    windMps: z.number().min(0),
    windDirDeg: z.number().min(0).lt(360),
    cloudPct: z.number().min(0).max(100),
  }),
);
export type Weather = z.infer<typeof Weather>;

export const ThreatMix = named(
  'ThreatMix',
  z.partialRecord(ThreatClass, z.int().min(0).max(50)),
  'Number of threat contacts per class.',
);
export type ThreatMix = z.infer<typeof ThreatMix>;

export const ScenarioRequest = named(
  'ScenarioRequest',
  z.object({
    terrainPreset: z.string().min(1),
    timeOfDay: TimeOfDay,
    date: z.iso.date().optional(),
    weather: z.union([Weather, z.literal('LIVE')]),
    difficulty: Difficulty,
    seed: Seed,
    threatMix: ThreatMix.optional(),
    swarmSize: z.int().min(1).max(50).optional(),
    falseContactDensity: FalseContactDensity.optional(),
    aiAssistAccuracy: z.number().min(0).max(1).optional(),
    durationS: z.int().min(30).max(3600),
    roe: Roe,
  }),
);
export type ScenarioRequest = z.infer<typeof ScenarioRequest>;

export const LatLon = named(
  'LatLon',
  z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
);
export type LatLon = z.infer<typeof LatLon>;

export const TerrainRef = named(
  'TerrainRef',
  z.object({ preset: z.string().min(1), origin: LatLon }),
);
export type TerrainRef = z.infer<typeof TerrainRef>;

export const SunAzEl = named('SunAzEl', z.object({ azDeg: z.number(), elDeg: z.number() }));
export type SunAzEl = z.infer<typeof SunAzEl>;

export const Environment = named(
  'Environment',
  z.object({
    date: z.iso.date(),
    time: TimeOfDay,
    isNight: z.boolean(),
    weather: Weather,
    sunAzEl: SunAzEl.optional(),
  }),
);
export type Environment = z.infer<typeof Environment>;

/** [x, z] in metres. */
export const Point2 = named('Point2', z.tuple([z.number(), z.number()]));
export type Point2 = z.infer<typeof Point2>;

export const BorderLineZone = named(
  'BorderLineZone',
  z.object({
    id: z.string().min(1),
    kind: z.literal('BORDER_LINE'),
    polyline: z.array(Point2).min(2),
  }),
);
export type BorderLineZone = z.infer<typeof BorderLineZone>;

export const AreaZone = named(
  'AreaZone',
  z.object({
    id: z.string().min(1),
    kind: AreaZoneKind,
    polygon: z.array(Point2).min(3),
  }),
);
export type AreaZone = z.infer<typeof AreaZone>;

export const Zone = named('Zone', z.discriminatedUnion('kind', [BorderLineZone, AreaZone]));
export type Zone = z.infer<typeof Zone>;

export const Asset = named(
  'Asset',
  z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    x: z.number(),
    z: z.number(),
    radiusM: z.number().positive(),
  }),
);
export type Asset = z.infer<typeof Asset>;

const sensorPosition = {
  id: z.string().min(1),
  x: z.number(),
  y: z.number().min(0),
  z: z.number(),
};

export const RadarSensor = named(
  'RadarSensor',
  z.object({
    ...sensorPosition,
    kind: z.literal('RADAR'),
    /** Range at which a 0.01 m² target has Pd = 0.5. */
    refRangeM: z.number().positive(),
    scanPeriodS: z.number().positive(),
  }),
);
export type RadarSensor = z.infer<typeof RadarSensor>;

export const EoIrSensor = named(
  'EoIrSensor',
  z.object({
    ...sensorPosition,
    kind: z.literal('EO_IR'),
    fovDegMin: z.number().positive(),
    fovDegMax: z.number().positive(),
    resolution: z.tuple([z.int().positive(), z.int().positive()]),
    /** Thermal detector resolution; defaults to `resolution`. */
    irResolution: z.tuple([z.int().positive(), z.int().positive()]).optional(),
  }),
);
export type EoIrSensor = z.infer<typeof EoIrSensor>;

export const RfSensor = named(
  'RfSensor',
  z.object({
    ...sensorPosition,
    kind: z.literal('RF'),
    rangeM: z.number().positive(),
    bearingErrDeg: z.number().min(0),
  }),
);
export type RfSensor = z.infer<typeof RfSensor>;

export const SensorConfig = named(
  'SensorConfig',
  z.discriminatedUnion('kind', [RadarSensor, EoIrSensor, RfSensor]),
);
export type SensorConfig = z.infer<typeof SensorConfig>;

export const EffectorConfig = named(
  'EffectorConfig',
  z.object({
    id: z.string().min(1),
    kind: EffectorKind,
    x: z.number(),
    y: z.number().min(0).optional(),
    z: z.number(),
    rangeM: z.number().positive(),
    cooldownS: z.number().min(0),
    ammo: z.int().min(0).optional(),
  }),
);
export type EffectorConfig = z.infer<typeof EffectorConfig>;

export const Waypoint = named(
  'Waypoint',
  z.object({
    x: z.number(),
    y: z.number().min(0),
    z: z.number(),
    speedMps: z.number().min(0),
    holdS: z.number().min(0).optional(),
    action: WaypointAction.optional(),
    /** `y` reference; default AGL. MSL is converted with the preset's originElevM. */
    altRef: AltitudeRef.optional(),
  }),
);
export type Waypoint = z.infer<typeof Waypoint>;

export const Emissions = named(
  'Emissions',
  z.object({
    rfActive: z.boolean(),
    rfBand: z.string().optional(),
    friendlyIdCode: z.string().optional(),
  }),
);
export type Emissions = z.infer<typeof Emissions>;

export const AiSuggestion = named(
  'AiSuggestion',
  z.object({ suggestedClass: ContactClass, confidence: z.number().min(0).max(1) }),
);
export type AiSuggestion = z.infer<typeof AiSuggestion>;

export const ContactSpec = named(
  'ContactSpec',
  z.object({
    id: z.string().min(1).max(16),
    class: ContactClass,
    isThreat: z.boolean(),
    affiliation: Affiliation,
    controlLink: ControlLink,
    behaviour: Behaviour,
    spawnTMs: z.int().min(0),
    despawnTMs: z.int().min(0).optional(),
    groupId: z.string().min(1).optional(),
    path: z.array(Waypoint).min(1),
    emissions: Emissions,
    aiSuggestion: AiSuggestion.optional(),
  }),
);
export type ContactSpec = z.infer<typeof ContactSpec>;

const THREAT_CLASSES: ReadonlySet<string> = new Set(ThreatClass.options);
const NON_THREAT_CLASSES: ReadonlySet<string> = new Set(NonThreatClass.options);

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const dup = new Set<string>();
  for (const id of ids) (seen.has(id) ? dup : seen).add(id);
  return [...dup];
}

export const Scenario = named(
  'Scenario',
  z
    .object({
      id: z.string().min(1),
      schemaVersion: z.literal(SCENARIO_SCHEMA_VERSION),
      name: z.string().min(1),
      briefing: z.string(),
      seed: Seed,
      difficulty: Difficulty,
      request: ScenarioRequest.optional(),
      terrain: TerrainRef,
      environment: Environment,
      roe: Roe,
      zones: z.array(Zone),
      assets: z.array(Asset),
      sensors: z.array(SensorConfig).min(1),
      effectors: z.array(EffectorConfig),
      contacts: z.array(ContactSpec).min(1),
      durationS: z.int().min(30).max(3600),
      scoringTreeId: z.string().min(1),
    })
    // Cross-field rules. These are not expressible in JSON Schema, so the API
    // re-checks them in Python (see apps/api) when it accepts scenarios.
    .superRefine((s, ctx) => {
      const lists = {
        zones: s.zones,
        assets: s.assets,
        sensors: s.sensors,
        effectors: s.effectors,
        contacts: s.contacts,
      };
      for (const [key, items] of Object.entries(lists)) {
        for (const id of duplicates(items.map((i) => i.id))) {
          ctx.addIssue({ code: 'custom', path: [key], message: `Duplicate id "${id}"` });
        }
      }
      const durationMs = s.durationS * 1000;
      s.contacts.forEach((c, i) => {
        const expectedThreat = THREAT_CLASSES.has(c.class);
        if (
          c.isThreat !== expectedThreat ||
          (!expectedThreat && !NON_THREAT_CLASSES.has(c.class))
        ) {
          ctx.addIssue({
            code: 'custom',
            path: ['contacts', i, 'isThreat'],
            message: `isThreat must be ${expectedThreat} for class ${c.class}`,
          });
        }
        if (c.spawnTMs > durationMs) {
          ctx.addIssue({
            code: 'custom',
            path: ['contacts', i, 'spawnTMs'],
            message: 'Spawns after scenario ends',
          });
        }
        if (c.despawnTMs !== undefined && c.despawnTMs <= c.spawnTMs) {
          ctx.addIssue({
            code: 'custom',
            path: ['contacts', i, 'despawnTMs'],
            message: 'Must be after spawnTMs',
          });
        }
      });
      s.sensors.forEach((sensor, i) => {
        if (sensor.kind === 'EO_IR' && sensor.fovDegMin > sensor.fovDegMax) {
          ctx.addIssue({
            code: 'custom',
            path: ['sensors', i, 'fovDegMin'],
            message: 'fovDegMin > fovDegMax',
          });
        }
      });
    }),
);
export type Scenario = z.infer<typeof Scenario>;
