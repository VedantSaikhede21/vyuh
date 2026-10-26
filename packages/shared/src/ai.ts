import { z } from 'zod';
import { DebriefFallbackReason, DebriefSource } from './enums.ts';
import { named } from './registry.ts';
import { GenerateRequest } from './scenario.ts';

// Phase 5 AI layer (SPEC §13): debrief, text-to-scenario, AI-assist trust metrics.

// ---- Debrief (§13.1) ------------------------------------------------------------

export const DebriefMistake = named(
  'DebriefMistake',
  z.object({
    /** Sim time of the mistake; the UI links it to the replay. */
    tMs: z.int().min(0),
    what: z.string().min(1).max(300),
    whyItMatters: z.string().min(1).max(300),
    doInstead: z.string().min(1).max(300),
  }),
);
export type DebriefMistake = z.infer<typeof DebriefMistake>;

export const DebriefContent = named(
  'DebriefContent',
  z.object({
    summary: z.string().min(1).max(800),
    strengths: z.array(z.string().min(1).max(300)).max(5),
    mistakes: z.array(DebriefMistake).max(6),
    drill: z.string().min(1).max(400),
  }),
);
export type DebriefContent = z.infer<typeof DebriefContent>;

/** POST /aar/sessions/{id}/debrief — generated once, then cached per session. */
export const DebriefResponse = named(
  'DebriefResponse',
  z.object({
    sessionId: z.uuid(),
    source: DebriefSource,
    /** The LLM model id, or "template". */
    model: z.string(),
    /** Set when the template was used instead of the LLM. */
    fallbackReason: DebriefFallbackReason.optional(),
    content: DebriefContent,
    createdAt: z.iso.datetime({ offset: true }),
  }),
);
export type DebriefResponse = z.infer<typeof DebriefResponse>;

// ---- AI status --------------------------------------------------------------------

/** GET /ai/status — whether LLM features are on, so the UI can word disabled controls. */
export const AiStatusResponse = named(
  'AiStatusResponse',
  z.object({ llmEnabled: z.boolean(), model: z.string().nullable() }),
);
export type AiStatusResponse = z.infer<typeof AiStatusResponse>;

// ---- Text-to-scenario (§13.2) ---------------------------------------------------

/**
 * The one text a guest may turn into a scenario (Phase 6E, SPEC §20 step 7). The API
 * accepts it from guests only in this wording (case and spacing ignored) and has a
 * fixed parse of it for when the LLM is off.
 */
export const DEMO_FROM_TEXT = 'Night swarm of 8 from the north with 2 decoys, hard';

export const FromTextRequest = named(
  'FromTextRequest',
  z.object({ text: z.string().trim().min(3).max(600) }),
);
export type FromTextRequest = z.infer<typeof FromTextRequest>;

/**
 * POST /scenarios/from-text (instructor): the parsed parameters only. The instructor
 * confirms them, then the client calls POST /scenarios/generate with `request`.
 */
export const FromTextResponse = named(
  'FromTextResponse',
  z.object({
    request: GenerateRequest,
    /** What was clamped, defaulted or ignored, in plain words. */
    notes: z.array(z.string()),
    model: z.string(),
    /** TEMPLATE: the guest preset's fixed parse, used when the LLM is off or failed. */
    source: DebriefSource.optional(),
  }),
);
export type FromTextResponse = z.infer<typeof FromTextResponse>;

// ---- AI-assist trust (§9.4) -------------------------------------------------------

/**
 * Over- and under-trust of the AI-assist suggestions (an insight, not part of the score).
 * Counted per contact whose suggestion was shown; the trainee's response is the last
 * accept / reject on any of its tracks (none = ignored).
 */
export const AiTrustMetrics = named(
  'AiTrustMetrics',
  z.object({
    shown: z.int().min(0),
    shownCorrect: z.int().min(0),
    shownWrong: z.int().min(0),
    acceptedCorrect: z.int().min(0),
    acceptedWrong: z.int().min(0),
    rejectedCorrect: z.int().min(0),
    rejectedWrong: z.int().min(0),
    /** acceptedWrong / shownWrong; null when no wrong suggestion was shown. */
    overTrust: z.number().min(0).max(1).nullable(),
    /** rejectedCorrect / shownCorrect; null when no correct suggestion was shown. */
    underTrust: z.number().min(0).max(1).nullable(),
  }),
);
export type AiTrustMetrics = z.infer<typeof AiTrustMetrics>;
