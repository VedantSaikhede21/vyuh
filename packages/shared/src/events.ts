import { z } from 'zod';
import {
  Affiliation,
  ContactClass,
  EoLevel,
  ResponseKind,
  ResponseResult,
  SensorKind,
  SessionEndReason,
  SessionMode,
  TrackLostReason,
} from './enums.ts';
import { named } from './registry.ts';
import { ContactReport } from './report.ts';
import { Seed } from './scenario.ts';

// SPEC §4.1/§4.2. trackId / contactId live only at the top level of an event,
// never inside the payload (docs/decisions.md).

const ID = z.string().min(1).max(64);
const base = { seq: z.int().min(0), tMs: z.int().min(0) };
const Empty = named('EmptyPayload', z.strictObject({}));

const AiSuggestionPayload = named(
  'AiSuggestionPayload',
  z.object({ suggestedClass: ContactClass, confidence: z.number().min(0).max(1) }),
);

// ---- System events -------------------------------------------------------

export const SessionStartedEvent = named(
  'SessionStartedEvent',
  z.object({
    ...base,
    type: z.literal('SESSION_STARTED'),
    payload: named(
      'SessionStartedPayload',
      z.object({ mode: SessionMode, scenarioId: ID, seed: Seed }),
    ),
  }),
);

export const ContactSpawnedEvent = named(
  'ContactSpawnedEvent',
  z.object({ ...base, type: z.literal('CONTACT_SPAWNED'), contactId: ID, payload: Empty }),
);

export const ContactDespawnedEvent = named(
  'ContactDespawnedEvent',
  z.object({ ...base, type: z.literal('CONTACT_DESPAWNED'), contactId: ID, payload: Empty }),
);

export const ContactReachedAssetEvent = named(
  'ContactReachedAssetEvent',
  z.object({
    ...base,
    type: z.literal('CONTACT_REACHED_ASSET'),
    contactId: ID,
    payload: named('ContactReachedAssetPayload', z.object({ assetId: ID })),
  }),
);

export const ContactNeutralisedEvent = named(
  'ContactNeutralisedEvent',
  z.object({
    ...base,
    type: z.literal('CONTACT_NEUTRALISED'),
    contactId: ID,
    payload: named('ContactNeutralisedPayload', z.object({ by: ResponseKind })),
  }),
);

export const SensorTrackCreatedEvent = named(
  'SensorTrackCreatedEvent',
  z.object({
    ...base,
    type: z.literal('SENSOR_TRACK_CREATED'),
    contactId: ID,
    trackId: ID,
    payload: named(
      'SensorTrackCreatedPayload',
      z.object({
        sensorId: ID,
        sensorKind: SensorKind,
        /** Absent for RF (bearing only). */
        rangeM: z.number().min(0).optional(),
        bearingDeg: z.number().min(0).lt(360),
      }),
    ),
  }),
);

export const SensorTrackLostEvent = named(
  'SensorTrackLostEvent',
  z.object({
    ...base,
    type: z.literal('SENSOR_TRACK_LOST'),
    trackId: ID,
    contactId: ID.optional(),
    payload: named('SensorTrackLostPayload', z.object({ reason: TrackLostReason })),
  }),
);

export const EoIdentifiableEvent = named(
  'EoIdentifiableEvent',
  z.object({
    ...base,
    type: z.literal('EO_IDENTIFIABLE'),
    contactId: ID,
    trackId: ID.optional(),
    payload: named(
      'EoIdentifiablePayload',
      z.object({ level: EoLevel, rangeM: z.number().min(0) }),
    ),
  }),
);

export const ResponseOutcomeEvent = named(
  'ResponseOutcomeEvent',
  z.object({
    ...base,
    type: z.literal('RESPONSE_OUTCOME'),
    trackId: ID,
    contactId: ID,
    payload: named(
      'ResponseOutcomePayload',
      z.object({
        response: ResponseKind,
        result: ResponseResult,
        collateral: named('Collateral', z.object({ contactId: ID })).optional(),
      }),
    ),
  }),
);

export const AiSuggestionShownEvent = named(
  'AiSuggestionShownEvent',
  z.object({
    ...base,
    type: z.literal('AI_SUGGESTION_SHOWN'),
    trackId: ID,
    payload: AiSuggestionPayload,
  }),
);

export const SessionEndedEvent = named(
  'SessionEndedEvent',
  z.object({
    ...base,
    type: z.literal('SESSION_ENDED'),
    payload: named('SessionEndedPayload', z.object({ reason: SessionEndReason })),
  }),
);

// ---- Trainee events ------------------------------------------------------

function trackEvent<T extends string, P extends z.ZodType>(id: string, type: T, payload: P) {
  return named(id, z.object({ ...base, type: z.literal(type), trackId: ID, payload }));
}

export const TrackSelectedEvent = trackEvent('TrackSelectedEvent', 'TRACK_SELECTED', Empty);
export const MarkedDetectedEvent = trackEvent('MarkedDetectedEvent', 'MARKED_DETECTED', Empty);
export const ClassifiedEvent = trackEvent(
  'ClassifiedEvent',
  'CLASSIFIED',
  named('ClassifiedPayload', z.object({ class: ContactClass })),
);
export const AffiliationSetEvent = trackEvent(
  'AffiliationSetEvent',
  'AFFILIATION_SET',
  named('AffiliationSetPayload', z.object({ affiliation: Affiliation })),
);
export const ResponseOrderedEvent = trackEvent(
  'ResponseOrderedEvent',
  'RESPONSE_ORDERED',
  named('ResponseOrderedPayload', z.object({ response: ResponseKind, effectorId: ID.optional() })),
);
export const AiSuggestionAcceptedEvent = trackEvent(
  'AiSuggestionAcceptedEvent',
  'AI_SUGGESTION_ACCEPTED',
  AiSuggestionPayload,
);
export const AiSuggestionRejectedEvent = trackEvent(
  'AiSuggestionRejectedEvent',
  'AI_SUGGESTION_REJECTED',
  AiSuggestionPayload,
);

export const CameraSlewedEvent = named(
  'CameraSlewedEvent',
  z.object({
    ...base,
    type: z.literal('CAMERA_SLEWED'),
    payload: named(
      'CameraSlewedPayload',
      z.object({
        azDeg: z.number().min(0).lt(360),
        elDeg: z.number().min(-90).max(90),
        zoom: z.number().positive(),
      }),
    ),
  }),
);

export const ReportSubmittedEvent = named(
  'ReportSubmittedEvent',
  z.object({ ...base, type: z.literal('REPORT_SUBMITTED'), payload: ContactReport }),
);

export const SimEvent = named(
  'SimEvent',
  z.discriminatedUnion('type', [
    SessionStartedEvent,
    ContactSpawnedEvent,
    ContactDespawnedEvent,
    ContactReachedAssetEvent,
    ContactNeutralisedEvent,
    SensorTrackCreatedEvent,
    SensorTrackLostEvent,
    EoIdentifiableEvent,
    ResponseOutcomeEvent,
    AiSuggestionShownEvent,
    SessionEndedEvent,
    TrackSelectedEvent,
    CameraSlewedEvent,
    MarkedDetectedEvent,
    ClassifiedEvent,
    AffiliationSetEvent,
    ResponseOrderedEvent,
    ReportSubmittedEvent,
    AiSuggestionAcceptedEvent,
    AiSuggestionRejectedEvent,
  ]),
);
export type SimEvent = z.infer<typeof SimEvent>;
