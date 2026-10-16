import type { applicationSource } from "@talentscout/db/schema/enums";
import type { PipelineStageKey } from "@talentscout/db/schema/pipeline-stages";
import { z } from "zod";

/**
 * A `jobs.id` value as an analytics event property. Every event in the funnel catalog
 * carries one. See docs/specs/ai-45-funnel-analytics.md §3.3.
 */
export const jobIdSchema = z.uuid();

/**
 * An `applications.id` value as an analytics event property. Only present on events fired
 * after the row exists — `application_submitted`, `application_stage_changed` and
 * `offer_made`. See docs/specs/ai-45-funnel-analytics.md §3.3–§3.4.
 */
export const applicationIdSchema = z.uuid();

/**
 * A uuid the browser mints when an apply flow opens, before any `applications` row exists.
 * It is what lets an abandoned application still emit its earlier events (AC 5), and
 * `application_submitted` is the single event that carries both this and
 * `applicationIdSchema`. See docs/specs/ai-45-funnel-analytics.md §3.4.
 */
export const applicationDraftIdSchema = z.uuid();

/**
 * The closed vocabulary of `applications.source`, duplicated here as a type-only derivation
 * so this module makes no runtime import of `@talentscout/db/schema/enums` — a runtime
 * import would drag `drizzle-orm/pg-core` into any client bundle that reaches this file.
 * Kept in sync with the database by `properties.test.ts`'s set-equality check against a
 * runtime import, which only a test may make for free. See
 * docs/specs/ai-45-funnel-analytics.md §2 and 🟡 #16.
 */
export const ANALYTICS_SOURCE_VALUES = [
  "careers_site",
  "referral",
  "linkedin",
  "job_board",
  "agency",
  "email",
  "import",
] as const satisfies readonly (typeof applicationSource.enumValues)[number][];

/** The `source` property's schema — see `ANALYTICS_SOURCE_VALUES`. */
export const sourceSchema = z.enum(ANALYTICS_SOURCE_VALUES);

/** The inferred type of `sourceSchema`. */
export type AnalyticsSource = z.infer<typeof sourceSchema>;

/**
 * The closed vocabulary of `PIPELINE_STAGE_SEED` keys, duplicated here as a type-only
 * derivation for the same bundle-safety reason as `ANALYTICS_SOURCE_VALUES` — the module it
 * is derived from also exports a `pgTable`, so even a type-only re-export of the array itself
 * would risk a runtime import creeping back in later. Kept in sync by
 * `properties.test.ts`'s set-equality check against `PIPELINE_STAGE_SEED` at test time.
 */
export const ANALYTICS_STAGE_VALUES = [
  "applied",
  "screening",
  "interview",
  "offer",
  "hired",
  "rejected",
  "withdrawn",
] as const satisfies readonly PipelineStageKey[];

/** The `stage` and `from_stage` properties' schema — see `ANALYTICS_STAGE_VALUES`. */
export const stageSchema = z.enum(ANALYTICS_STAGE_VALUES);

/** The inferred type of `stageSchema`. */
export type AnalyticsStage = z.infer<typeof stageSchema>;

/**
 * Who performed the act an event records, established by the surface rather than by a
 * session — this repository has no authentication concept. `candidate` has no producer
 * until an authenticated candidate surface exists. See
 * docs/specs/ai-45-funnel-analytics.md §3.3.
 */
export const ANALYTICS_ACTOR_ROLES = ["visitor", "candidate", "recruiter", "system"] as const;

/** The `actor_role` property's schema — see `ANALYTICS_ACTOR_ROLES`. */
export const actorRoleSchema = z.enum(ANALYTICS_ACTOR_ROLES);

/** The inferred type of `actorRoleSchema`. */
export type AnalyticsActorRole = z.infer<typeof actorRoleSchema>;
