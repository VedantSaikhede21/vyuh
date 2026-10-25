import { z } from 'zod';
import {
  Affiliation,
  ContactClass,
  ContactOutcome,
  KillChainStage,
  KillChainStatus,
} from './enums.ts';
import { named } from './registry.ts';

// After-action review (SPEC §12 Phase 4, decision 105): the kill chain per contact,
// computed on the server from the scenario truth and the stored event log.

/** One stage of one contact's kill chain. Times are sim ms. */
export const KillChainStep = named(
  'KillChainStep',
  z.object({
    stage: KillChainStage,
    /** When the stage first became possible (e.g. first track, first EO identification). */
    availableTMs: z.int().min(0).optional(),
    /** When the trainee acted at this stage. */
    actionTMs: z.int().min(0).optional(),
    /** actionTMs − availableTMs, seconds. */
    latencyS: z.number().min(0).optional(),
    /** What the trainee did, worded ("Classified QUAD_SMALL", "Intercept · NEUTRALISED"). */
    action: z.string().optional(),
    /** What was really there or right ("QUAD_HEAVY", "HOSTILE", "Jam (RF link)"). */
    truth: z.string().optional(),
    status: KillChainStatus,
    feedback: z.string(),
    /** Where the replay jumps when this stage is chosen. */
    jumpTMs: z.int().min(0),
  }),
);
export type KillChainStep = z.infer<typeof KillChainStep>;

export const ContactKillChain = named(
  'ContactKillChain',
  z.object({
    contactId: z.string().min(1),
    isThreat: z.boolean(),
    trueClass: ContactClass,
    trueAffiliation: Affiliation,
    /** Every track the sensors made of this contact, in creation order. */
    trackIds: z.array(z.string().min(1)),
    outcome: ContactOutcome.optional(),
    /** Always six, in kill-chain order. */
    stages: z.array(KillChainStep).length(6),
  }),
);
export type ContactKillChain = z.infer<typeof ContactKillChain>;

/** An instructor's remark on a completed session, shown in its AAR and as a notice. */
export const SessionRemark = named(
  'SessionRemark',
  z.object({
    id: z.uuid(),
    authorName: z.string(),
    body: z.string().min(1).max(500),
    createdAt: z.iso.datetime({ offset: true }),
  }),
);
export type SessionRemark = z.infer<typeof SessionRemark>;

/** POST /aar/sessions/{id}/remarks (instructor, admin) → SessionRemark */
export const CreateRemarkRequest = named(
  'CreateRemarkRequest',
  z.object({ body: z.string().trim().min(1).max(500) }),
);
export type CreateRemarkRequest = z.infer<typeof CreateRemarkRequest>;
