import { z } from 'zod';
import { named } from './registry.ts';

// All enums live here (CLAUDE.md §6). Values are UPPER_SNAKE.

export const ThreatClass = named(
  'ThreatClass',
  z.enum(['QUAD_SMALL', 'QUAD_HEAVY', 'FPV', 'FIXED_WING_SMALL', 'LOITERING_GENERIC']),
);
export type ThreatClass = z.infer<typeof ThreatClass>;

export const NonThreatClass = named(
  'NonThreatClass',
  z.enum(['BIRD_SMALL', 'BIRD_LARGE', 'FRIENDLY_QUAD', 'CIVILIAN_HOBBY', 'HELICOPTER_FRIENDLY']),
);
export type NonThreatClass = z.infer<typeof NonThreatClass>;

export const ContactClass = named(
  'ContactClass',
  z.enum([...ThreatClass.options, ...NonThreatClass.options]),
);
export type ContactClass = z.infer<typeof ContactClass>;

/** A class as reported by a trainee: any contact class, or UNKNOWN. */
export const ReportedClass = named('ReportedClass', z.enum([...ContactClass.options, 'UNKNOWN']));
export type ReportedClass = z.infer<typeof ReportedClass>;

/** APP-6 style: HOSTILE red, FRIENDLY blue, NEUTRAL green, UNKNOWN yellow. */
export const Affiliation = named(
  'Affiliation',
  z.enum(['HOSTILE', 'FRIENDLY', 'NEUTRAL', 'UNKNOWN']),
);
export type Affiliation = z.infer<typeof Affiliation>;

export const ControlLink = named(
  'ControlLink',
  z.enum(['RF_MANUAL', 'AUTONOMOUS_GNSS', 'FIBRE_OPTIC', 'NONE']),
);
export type ControlLink = z.infer<typeof ControlLink>;

/** Physical kind of a contact class (threat_types.category, SPEC §10). */
export const ContactCategory = named(
  'ContactCategory',
  z.enum(['DRONE', 'BIRD', 'MANNED_AIRCRAFT']),
);
export type ContactCategory = z.infer<typeof ContactCategory>;

export const Behaviour = named(
  'Behaviour',
  z.enum([
    'RECON_LOITER',
    'SMUGGLING_DROP',
    'ATTACK_RUN',
    'SWARM_SATURATION',
    'DECOY',
    'TRANSIT',
    'FRIENDLY_PATROL',
    'BIRD_FLOCK',
  ]),
);
export type Behaviour = z.infer<typeof Behaviour>;

/** ACOUSTIC is deliberately omitted until implemented (docs/decisions.md). */
export const SensorKind = named('SensorKind', z.enum(['RADAR', 'EO_IR', 'RF']));
export type SensorKind = z.infer<typeof SensorKind>;

export const ResponseKind = named(
  'ResponseKind',
  z.enum(['MONITOR', 'REPORT', 'EW_JAM', 'EW_SPOOF', 'INTERCEPT']),
);
export type ResponseKind = z.infer<typeof ResponseKind>;

/** Responses that are backed by a physical effector. */
export const EffectorKind = named('EffectorKind', z.enum(['EW_JAM', 'EW_SPOOF', 'INTERCEPT']));
export type EffectorKind = z.infer<typeof EffectorKind>;

export const ZoneKind = named(
  'ZoneKind',
  z.enum(['PROTECTED_ASSET', 'NO_KINETIC', 'BORDER_LINE', 'SENSOR_SITE']),
);
export type ZoneKind = z.infer<typeof ZoneKind>;

/** Zone kinds described by a polygon (everything except BORDER_LINE). */
export const AreaZoneKind = named(
  'AreaZoneKind',
  z.enum(['PROTECTED_ASSET', 'NO_KINETIC', 'SENSOR_SITE']),
);
export type AreaZoneKind = z.infer<typeof AreaZoneKind>;

export const KillChainStage = named(
  'KillChainStage',
  z.enum(['DETECT', 'TRACK', 'IDENTIFY', 'DECIDE', 'RESPOND', 'ASSESS']),
);
export type KillChainStage = z.infer<typeof KillChainStage>;

/** How the trainee did at one kill-chain stage of one contact (AAR, Phase 4a). */
export const KillChainStatus = named(
  'KillChainStatus',
  z.enum(['OK', 'LATE', 'WRONG', 'MISSED', 'NOT_APPLICABLE']),
);
export type KillChainStatus = z.infer<typeof KillChainStatus>;

export const Difficulty = named('Difficulty', z.int().min(1).max(5));
export type Difficulty = z.infer<typeof Difficulty>;

export const Roe = named('Roe', z.enum(['WEAPONS_FREE', 'WEAPONS_TIGHT', 'WEAPONS_HOLD']));
export type Roe = z.infer<typeof Roe>;

export const UserRole = named('UserRole', z.enum(['TRAINEE', 'INSTRUCTOR', 'ADMIN']));
export type UserRole = z.infer<typeof UserRole>;

export const ScenarioKind = named('ScenarioKind', z.enum(['SCRIPTED', 'GENERATED', 'AUTHORED']));
export type ScenarioKind = z.infer<typeof ScenarioKind>;

export const SessionMode = named('SessionMode', z.enum(['PRACTICE', 'ASSESSMENT']));
export type SessionMode = z.infer<typeof SessionMode>;

export const SessionStatus = named(
  'SessionStatus',
  z.enum(['CREATED', 'ACTIVE', 'COMPLETED', 'ABANDONED']),
);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const SystemEventType = named(
  'SystemEventType',
  z.enum([
    'SESSION_STARTED',
    'CONTACT_SPAWNED',
    'CONTACT_DESPAWNED',
    'CONTACT_REACHED_ASSET',
    'CONTACT_NEUTRALISED',
    'CONTACT_DROPPED',
    'SENSOR_TRACK_CREATED',
    'SENSOR_TRACK_LOST',
    'EO_IDENTIFIABLE',
    'RESPONSE_OUTCOME',
    'AI_SUGGESTION_SHOWN',
    'SESSION_ENDED',
    'REPORT_TRUTH',
  ]),
);
export type SystemEventType = z.infer<typeof SystemEventType>;

export const TraineeEventType = named(
  'TraineeEventType',
  z.enum([
    'TRACK_SELECTED',
    'CAMERA_SLEWED',
    'MARKED_DETECTED',
    'CLASSIFIED',
    'AFFILIATION_SET',
    'RESPONSE_ORDERED',
    'REPORT_SUBMITTED',
    'AI_SUGGESTION_ACCEPTED',
    'AI_SUGGESTION_REJECTED',
  ]),
);
export type TraineeEventType = z.infer<typeof TraineeEventType>;

export const EventType = named(
  'EventType',
  z.enum([...SystemEventType.options, ...TraineeEventType.options]),
);
export type EventType = z.infer<typeof EventType>;

export const ResponseResult = named(
  'ResponseResult',
  z.enum([
    'NEUTRALISED',
    'NO_EFFECT',
    'MISSED',
    'BLOCKED_BY_ROE',
    'BLOCKED_NO_KINETIC',
    'OUT_OF_RANGE',
    'COOLDOWN',
    'NO_AMMO',
  ]),
);
export type ResponseResult = z.infer<typeof ResponseResult>;

export const TrackLostReason = named('TrackLostReason', z.enum(['MISSES', 'LOS', 'OUT_OF_RANGE']));
export type TrackLostReason = z.infer<typeof TrackLostReason>;

/** Johnson-criteria level reached in the current EO/IR pointing. */
export const EoLevel = named('EoLevel', z.enum(['DETECT', 'RECOGNISE', 'IDENTIFY']));
export type EoLevel = z.infer<typeof EoLevel>;

/** LOW < 50 m, MEDIUM 50–150 m, HIGH > 150 m AGL. */
export const AltitudeBand = named('AltitudeBand', z.enum(['LOW', 'MEDIUM', 'HIGH']));
export type AltitudeBand = z.infer<typeof AltitudeBand>;

export const Activity = named(
  'Activity',
  z.enum(['APPROACHING', 'LOITERING', 'DEPARTING', 'HOVERING', 'UNKNOWN']),
);
export type Activity = z.infer<typeof Activity>;

export const WaypointAction = named('WaypointAction', z.enum(['DROP', 'DIVE', 'RTH']));
export type WaypointAction = z.infer<typeof WaypointAction>;

/** Waypoint altitude reference: above ground level (default) or above mean sea level. */
export const AltitudeRef = named('AltitudeRef', z.enum(['AGL', 'MSL']));
export type AltitudeRef = z.infer<typeof AltitudeRef>;

/** EO/IR camera mode: visible-light day camera or thermal (white-hot). */
export const EoMode = named('EoMode', z.enum(['DAY', 'IR']));
export type EoMode = z.infer<typeof EoMode>;

/** Whether a terrain preset's OSM building footprints were fetched (SPEC §14). */
export const BuildingsStatus = named('BuildingsStatus', z.enum(['OK', 'EMPTY', 'UNAVAILABLE']));
export type BuildingsStatus = z.infer<typeof BuildingsStatus>;

/** Generator time-of-day band; resolved to `HH:mm` from the sun at the preset (SPEC §7.1). */
export const TimeBand = named('TimeBand', z.enum(['DAY', 'DUSK', 'NIGHT']));
export type TimeBand = z.infer<typeof TimeBand>;

/** Generator weather preset, mapped to a `Weather` object. DUST waits for a desert preset. */
export const WeatherPreset = named(
  'WeatherPreset',
  z.enum(['CLEAR', 'HAZE', 'FOG', 'RAIN', 'DUST']),
);
export type WeatherPreset = z.infer<typeof WeatherPreset>;

export const FalseContactDensity = named('FalseContactDensity', z.enum(['LOW', 'MED', 'HIGH']));
export type FalseContactDensity = z.infer<typeof FalseContactDensity>;

export const SessionEndReason = named(
  'SessionEndReason',
  z.enum(['TIME_UP', 'ALL_RESOLVED', 'ABORTED']),
);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

/** How `Score.recommendedDifficulty` was derived: Elo rating (SPEC §9.3, decision 129). */
export const RecommendationBasis = named('RecommendationBasis', z.enum(['ELO_V1']));
export type RecommendationBasis = z.infer<typeof RecommendationBasis>;

/** Who wrote a debrief: the LLM, or the template built from leaf feedback (SPEC §13.1). */
export const DebriefSource = named('DebriefSource', z.enum(['LLM', 'TEMPLATE']));
export type DebriefSource = z.infer<typeof DebriefSource>;

/** Why a debrief fell back to the template. */
export const DebriefFallbackReason = named(
  'DebriefFallbackReason',
  z.enum(['LLM_DISABLED', 'TIMEOUT', 'INVALID_OUTPUT', 'ERROR', 'RATE_LIMITED']),
);
export type DebriefFallbackReason = z.infer<typeof DebriefFallbackReason>;

export const ClassificationResult = named(
  'ClassificationResult',
  z.enum(['EXACT', 'CATEGORY', 'WRONG']),
);
export type ClassificationResult = z.infer<typeof ClassificationResult>;

/** UNRESOLVED: a threat neither neutralised nor at the asset when the session ended. */
export const ContactOutcome = named(
  'ContactOutcome',
  z.enum([
    'NEUTRALISED',
    'LEAKED',
    'UNRESOLVED',
    'IGNORED_OK',
    'WRONGLY_ENGAGED',
    'FRATRICIDE',
    'FRIENDLY_JAMMED',
    'CIVILIAN_JAMMED',
  ]),
);
export type ContactOutcome = z.infer<typeof ContactOutcome>;

/** Representative training levels, lowest first (SPEC §9.7). Not official qualifications. */
export const TrainingLevel = named(
  'TrainingLevel',
  z.enum(['BASIC_OPERATOR', 'SENSOR_OPERATOR', 'ENGAGEMENT_CONTROLLER', 'INSTRUCTOR']),
);
export type TrainingLevel = z.infer<typeof TrainingLevel>;

/** LOCKED: the level below is not qualified. QUALIFIED: criteria met and signed off. */
export const LevelState = named('LevelState', z.enum(['LOCKED', 'IN_PROGRESS', 'QUALIFIED']));
export type LevelState = z.infer<typeof LevelState>;

/** Endorsements earned automatically from Assessment sessions (SPEC §9.7). */
export const EndorsementCode = named(
  'EndorsementCode',
  z.enum([
    'NIGHT_OPS',
    'SWARM',
    'SILENT_LINK',
    'DISCRIMINATION',
    'ROE_DISCIPLINE',
    'REPORTING',
    'CALIBRATED_TRUST',
  ]),
);
export type EndorsementCode = z.infer<typeof EndorsementCode>;

export const NoticeKind = named(
  'NoticeKind',
  z.enum(['ASSIGNMENT', 'REMARK', 'SIGNOFF', 'LIBRARY']),
);
export type NoticeKind = z.infer<typeof NoticeKind>;

/** Public status page: a component is up or down; the LLM is switched on or off. */
export const ComponentStatus = named('ComponentStatus', z.enum(['OK', 'DOWN']));
export type ComponentStatus = z.infer<typeof ComponentStatus>;

export const ErrorCode = named(
  'ErrorCode',
  z.enum([
    'VALIDATION_ERROR',
    'IMPLAUSIBLE_EVENTS',
    'UNAUTHORIZED',
    'FORBIDDEN',
    'NOT_FOUND',
    'SESSION_NOT_ACTIVE',
    'RATE_LIMITED',
    'LLM_UNAVAILABLE',
    'INTERNAL',
  ]),
);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** HTTP status for each error code (SPEC §11.2). */
export const ERROR_HTTP_STATUS = {
  VALIDATION_ERROR: 422,
  IMPLAUSIBLE_EVENTS: 422,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  SESSION_NOT_ACTIVE: 409,
  RATE_LIMITED: 429,
  LLM_UNAVAILABLE: 503,
  INTERNAL: 500,
} as const satisfies Record<ErrorCode, number>;
