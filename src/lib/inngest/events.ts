import { eventType } from "inngest";
import { z } from "zod";

/**
 * Event definitions.
 *
 * Zod 4 implements Standard Schema, which Inngest v4 accepts directly — so
 * these validate at runtime rather than only in the type system. Worth having:
 * events cross a network boundary and arrive from a queue, so "the sender
 * promised it was well-formed" is not a guarantee.
 */

export const ingestScheduled = eventType("signalx/ingest.scheduled", {
  schema: z.object({
    /** Restrict the run to one adapter. Omitted means every active indicator. */
    adapter: z.string().optional(),
    /** ISO date. Defaults to the standard backfill window. */
    from: z.string().optional(),
  }),
});

export const indicatorIngest = eventType("signalx/indicator.ingest", {
  schema: z.object({
    indicatorId: z.string(),
    indicatorSlug: z.string(),
    from: z.string(),
    to: z.string(),
  }),
});
