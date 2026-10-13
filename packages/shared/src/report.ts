import { z } from 'zod';
import { Activity, Affiliation, AltitudeBand, ReportedClass } from './enums.ts';
import { named } from './registry.ts';

export const ReportLocation = named(
  'ReportLocation',
  z.object({
    bearingDeg: z.number().min(0).lt(360),
    rangeM: z.number().min(0),
    fromSensorId: z.string().min(1),
  }),
);
export type ReportLocation = z.infer<typeof ReportLocation>;

/** Structured contact report (SPEC §4.3). */
export const ContactReport = named(
  'ContactReport',
  z.object({
    tMs: z.int().min(0),
    trackIds: z.array(z.string().min(1)).min(1),
    count: z.int().min(1),
    class: ReportedClass,
    affiliation: Affiliation,
    location: ReportLocation,
    headingDeg: z.number().min(0).lt(360),
    altitudeBand: AltitudeBand,
    activity: Activity,
  }),
);
export type ContactReport = z.infer<typeof ContactReport>;
