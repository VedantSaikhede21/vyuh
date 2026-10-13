import { z } from 'zod';
import { ClassificationResult, ContactClass, ContactOutcome, ResponseKind } from './enums.ts';
import { named } from './registry.ts';

// SPEC §4 Score + §9. Penalty and PerContactMetrics are PROVISIONAL until the
// Phase 1 scoring engine exists; expect fields to be added.

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
    firstDetectableTMs: z.int().min(0).optional(),
    traineeDetectedTMs: z.int().min(0).optional(),
    detectionLatencyS: z.number().min(0).optional(),
    classifiedAs: ContactClass.optional(),
    classificationCorrect: ClassificationResult.optional(),
    identifiableWhenClassified: z.boolean().optional(),
    responses: z.array(ResponseKind),
    responseAppropriate: z.boolean().optional(),
    outcome: ContactOutcome.optional(),
    aiSuggestionShown: z.boolean().optional(),
    aiSuggestionAccepted: z.boolean().optional(),
    aiSuggestionCorrect: z.boolean().optional(),
    points: z.number().optional(),
    feedback: z.array(z.string()),
  }),
);
export type PerContactMetrics = z.infer<typeof PerContactMetrics>;

export const Score = named(
  'Score',
  z.object({
    total: z.number().min(0).max(100),
    components: ScoreComponents,
    penalties: z.array(Penalty),
    perContact: z.array(PerContactMetrics),
    metrics: z.record(z.string(), z.unknown()),
    treeVersion: z.string().min(1),
  }),
);
export type Score = z.infer<typeof Score>;
