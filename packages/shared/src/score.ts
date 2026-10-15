import { z } from 'zod';
import {
  ClassificationResult,
  ContactClass,
  ContactOutcome,
  Difficulty,
  RecommendationBasis,
  ResponseKind,
} from './enums.ts';
import { named } from './registry.ts';

// SPEC §4 Score + §9. Component points are raw (e.g. detection out of 25);
// `componentMax` says what each component is out of for the scoring tree used.

export const ScoreComponents = named(
  'ScoreComponents',
  z.object({
    detection: z.number(),
    classification: z.number(),
    decision: z.number(),
    report: z.number(),
    efficiency: z.number(),
  }),
);
export type ScoreComponents = z.infer<typeof ScoreComponents>;

export const Penalty = named(
  'Penalty',
  z.object({
    code: z.string().min(1),
    points: z.number(),
    tMs: z.int().min(0).optional(),
    contactId: z.string().optional(),
    feedback: z.string(),
    /** SPEC §9.6: flagged penalties are shown but excluded from the total. */
    unavoidable: z.boolean().optional(),
  }),
);
export type Penalty = z.infer<typeof Penalty>;

export const PerContactMetrics = named(
  'PerContactMetrics',
  z.object({
    contactId: z.string().min(1),
    isThreat: z.boolean(),
    /** Sensor tracks that were mapped to this contact (via SENSOR_TRACK_CREATED). */
    trackIds: z.array(z.string().min(1)),
    firstDetectableTMs: z.int().min(0).optional(),
    traineeDetectedTMs: z.int().min(0).optional(),
    detectionLatencyS: z.number().min(0).optional(),
    /** Ground-truth class, added by the API to completed sessions only (decision 64). */
    trueClass: ContactClass.optional(),
    classifiedAs: ContactClass.optional(),
    classificationCorrect: ClassificationResult.optional(),
    identifiableWhenClassified: z.boolean().optional(),
    responses: z.array(ResponseKind),
    responseAppropriate: z.boolean().optional(),
    outcome: ContactOutcome.optional(),
    aiSuggestionShown: z.boolean().optional(),
    aiSuggestionAccepted: z.boolean().optional(),
    aiSuggestionCorrect: z.boolean().optional(),
    /** When the contact released its payload (CONTACT_DROPPED, default_v3), if it did. */
    droppedTMs: z.int().min(0).optional(),
    points: z.number().optional(),
    /** Decision-tree leaf ids reached for this contact, in evaluation order. */
    leaves: z.array(z.string().min(1)),
    feedback: z.array(z.string()),
  }),
);
export type PerContactMetrics = z.infer<typeof PerContactMetrics>;

export const Score = named(
  'Score',
  z.object({
    total: z.number().min(0).max(100),
    components: ScoreComponents,
    /** Maximum points per component in this tree; 0 = not scored by this tree. */
    componentMax: ScoreComponents,
    penalties: z.array(Penalty),
    perContact: z.array(PerContactMetrics),
    metrics: z.record(z.string(), z.unknown()),
    treeVersion: z.string().min(1),
    /** Next difficulty to train at; added by the API, not the scoring tree (decision 64). */
    recommendedDifficulty: Difficulty.optional(),
    recommendationBasis: RecommendationBasis.optional(),
  }),
);
export type Score = z.infer<typeof Score>;
