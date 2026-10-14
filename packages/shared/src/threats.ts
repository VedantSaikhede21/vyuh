import type { ContactCategory, ContactClass, ControlLink } from './enums.ts';

// Representative physical parameters per contact class (SPEC §7 table).
// Public commercial-drone and textbook figures only; sources in
// docs/realism-sources.md. Turn and climb rates are not in the spec table and
// are representative values chosen for plausible flight paths.

export interface ClassProfile {
  /** Largest dimension, metres (used for EO/IR Johnson criteria). */
  readonly sizeM: number;
  /** Radar cross-section, m². */
  readonly rcsM2: number;
  readonly maxSpeedMps: number;
  /** Maximum horizontal turn rate, degrees per second. */
  readonly maxTurnRateDegS: number;
  /** Maximum climb / descent rate outside a terminal dive, m/s. */
  readonly maxClimbMps: number;
  /**
   * Thermal contrast against the background, 0..1 (representative). Scales the
   * Johnson cycles in IR mode: small electric drones are cool and hard to see.
   */
  readonly thermalContrast: number;
  /** Control links this class typically uses (SPEC §7 table). */
  readonly typicalLinks: readonly ControlLink[];
  readonly category: ContactCategory;
}

export const CLASS_PROFILES: Readonly<Record<ContactClass, ClassProfile>> = {
  QUAD_SMALL: {
    sizeM: 0.35,
    rcsM2: 0.01,
    maxSpeedMps: 18,
    maxTurnRateDegS: 120,
    maxClimbMps: 5,
    thermalContrast: 0.45,
    typicalLinks: ['RF_MANUAL', 'AUTONOMOUS_GNSS'],
    category: 'DRONE',
  },
  QUAD_HEAVY: {
    sizeM: 1.0,
    rcsM2: 0.05,
    maxSpeedMps: 15,
    maxTurnRateDegS: 60,
    maxClimbMps: 4,
    thermalContrast: 0.6,
    typicalLinks: ['RF_MANUAL', 'AUTONOMOUS_GNSS'],
    category: 'DRONE',
  },
  FPV: {
    sizeM: 0.25,
    rcsM2: 0.005,
    maxSpeedMps: 40,
    maxTurnRateDegS: 200,
    maxClimbMps: 15,
    thermalContrast: 0.4,
    typicalLinks: ['RF_MANUAL', 'FIBRE_OPTIC'],
    category: 'DRONE',
  },
  FIXED_WING_SMALL: {
    sizeM: 2.0,
    rcsM2: 0.08,
    maxSpeedMps: 28,
    maxTurnRateDegS: 25,
    maxClimbMps: 5,
    thermalContrast: 0.7,
    typicalLinks: ['AUTONOMOUS_GNSS', 'RF_MANUAL'],
    category: 'DRONE',
  },
  LOITERING_GENERIC: {
    sizeM: 2.5,
    rcsM2: 0.1,
    maxSpeedMps: 45,
    maxTurnRateDegS: 20,
    maxClimbMps: 8,
    thermalContrast: 0.8,
    typicalLinks: ['AUTONOMOUS_GNSS'],
    category: 'DRONE',
  },
  BIRD_SMALL: {
    sizeM: 0.3,
    rcsM2: 0.005,
    maxSpeedMps: 15,
    maxTurnRateDegS: 180,
    maxClimbMps: 3,
    thermalContrast: 0.7,
    typicalLinks: ['NONE'],
    category: 'BIRD',
  },
  BIRD_LARGE: {
    sizeM: 1.5,
    rcsM2: 0.02,
    maxSpeedMps: 15,
    maxTurnRateDegS: 60,
    maxClimbMps: 2,
    thermalContrast: 0.8,
    typicalLinks: ['NONE'],
    category: 'BIRD',
  },
  FRIENDLY_QUAD: {
    sizeM: 0.5,
    rcsM2: 0.02,
    maxSpeedMps: 18,
    maxTurnRateDegS: 90,
    maxClimbMps: 5,
    thermalContrast: 0.5,
    typicalLinks: ['RF_MANUAL'],
    category: 'DRONE',
  },
  CIVILIAN_HOBBY: {
    sizeM: 0.35,
    rcsM2: 0.01,
    maxSpeedMps: 15,
    maxTurnRateDegS: 90,
    maxClimbMps: 4,
    thermalContrast: 0.45,
    typicalLinks: ['RF_MANUAL'],
    category: 'DRONE',
  },
  HELICOPTER_FRIENDLY: {
    sizeM: 12,
    rcsM2: 5,
    maxSpeedMps: 70,
    maxTurnRateDegS: 15,
    maxClimbMps: 8,
    thermalContrast: 1.0,
    typicalLinks: ['NONE'],
    category: 'MANNED_AIRCRAFT',
  },
};
