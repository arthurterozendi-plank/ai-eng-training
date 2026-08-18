import { z } from "zod";

/**
 * One extracted field: what a model proposed, how sure it was, and where it read it from —
 * including for fields a reviewer later rejects, which a typed domain column cannot express.
 * See docs/specs/ai-34-domain-model.md §3.5.
 */
const extractionFieldSchema = z.object({
  value: z.unknown(),
  confidence: z.number().min(0).max(1),
  source: z.string(),
});

/**
 * The envelope stored in `applications.extraction`: what AI-107 writes and AI-112 gates on.
 * `schemaVersion` is pinned to the current shape so a future prompt change becomes a version
 * bump this schema will reject, rather than a silent shape drift no reader would notice.
 */
export const extractionPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  model: z.string(),
  extractedAt: z.iso.datetime(),
  fields: z.record(z.string(), extractionFieldSchema),
});

/** The typed shape of `applications.extraction`, inferred from {@link extractionPayloadSchema}. */
export type ExtractionPayload = z.infer<typeof extractionPayloadSchema>;

/** A single field's value/confidence/source, inferred from {@link extractionPayloadSchema}. */
export type ExtractionField = z.infer<typeof extractionFieldSchema>;
