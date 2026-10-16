import { z } from "zod";

import {
  actorRoleSchema,
  applicationDraftIdSchema,
  applicationIdSchema,
  jobIdSchema,
  sourceSchema,
  stageSchema,
  type AnalyticsActorRole,
  type AnalyticsSource,
  type AnalyticsStage,
} from "@/lib/analytics/properties";

/**
 * The ordered catalog of every analytics event this funnel emits — the order AC 1 means by
 * "in order". Stored once: there is no second ordering constant. See
 * docs/specs/ai-45-funnel-analytics.md §3.2 and §4 (an earlier draft's `FUNNEL_ORDER` was
 * deleted in harden round 1 because it only duplicated this list).
 */
export const ANALYTICS_EVENT_NAMES = [
  "job_viewed",
  "application_started",
  "resume_uploaded",
  "application_submitted",
  "application_stage_changed",
  "offer_made",
] as const;

/** An event name from the funnel catalog. */
export type AnalyticsEventName = (typeof ANALYTICS_EVENT_NAMES)[number];

/**
 * The shape every event name must match: lowercase snake_case, at least two segments, no
 * namespace prefix. Does not by itself enforce the past-tense rule — a name's final segment
 * must additionally end in `ed` or appear in `ANALYTICS_IRREGULAR_PAST_TENSE_VERBS`. See
 * docs/specs/ai-45-funnel-analytics.md §3.1.
 */
export const ANALYTICS_EVENT_NAME_PATTERN = /^[a-z]+(?:_[a-z]+)+$/;

/**
 * Past-tense final segments that do not end in `ed`. A ratchet, not a convenience: adding a
 * verb here is a change to this document and to the README, which is the review moment a new
 * event should trigger. See docs/specs/ai-45-funnel-analytics.md §3.1.
 */
export const ANALYTICS_IRREGULAR_PAST_TENSE_VERBS = ["made"] as const;

const jobViewedPropertiesSchema = z.strictObject({
  job_id: jobIdSchema,
  source: sourceSchema.optional(),
  actor_role: actorRoleSchema,
});

const applicationStartedPropertiesSchema = z.strictObject({
  job_id: jobIdSchema,
  source: sourceSchema,
  actor_role: actorRoleSchema,
  application_draft_id: applicationDraftIdSchema,
});

const resumeUploadedPropertiesSchema = z.strictObject({
  job_id: jobIdSchema,
  source: sourceSchema,
  actor_role: actorRoleSchema,
  application_draft_id: applicationDraftIdSchema,
});

const applicationSubmittedPropertiesSchema = z.strictObject({
  job_id: jobIdSchema,
  source: sourceSchema,
  stage: stageSchema,
  actor_role: actorRoleSchema,
  application_draft_id: applicationDraftIdSchema,
  application_id: applicationIdSchema,
});

/**
 * Rule 1 (docs/specs/ai-45-funnel-analytics.md §3.2), enforced here a second time: an
 * application's entry into the pipeline (`from_stage = null`) emits no event at all, so
 * `from_stage` is required and non-nullable, and a no-op transition (`from_stage === stage`)
 * is rejected too. A hand-built entry or no-op event fails to parse rather than merely going
 * unemitted by `eventsForStageTransition`.
 */
const applicationStageChangedPropertiesSchema = z
  .strictObject({
    job_id: jobIdSchema,
    application_id: applicationIdSchema,
    source: sourceSchema,
    actor_role: actorRoleSchema,
    stage: stageSchema,
    from_stage: stageSchema,
  })
  .refine((properties) => properties.from_stage !== properties.stage, {
    message: "from_stage must differ from stage — a no-op transition emits no event",
    path: ["from_stage"],
  });

/**
 * Rule 2 (docs/specs/ai-45-funnel-analytics.md §3.2): `stage` is the literal `"offer"`, not
 * the general vocabulary. Redundant by construction — that is the point: an `offer_made` for
 * any other stage is a type error and a failed parse.
 */
const offerMadePropertiesSchema = z.strictObject({
  job_id: jobIdSchema,
  application_id: applicationIdSchema,
  source: sourceSchema,
  actor_role: actorRoleSchema,
  stage: z.literal("offer"),
});

/**
 * Every event's `properties` schema, keyed by name — the lookup `captureAnalyticsEvent` will
 * validate an incoming event against. `satisfies Record<AnalyticsEventName, …>` rather than a
 * widening type annotation, so each key keeps its own specific schema type instead of every
 * value collapsing to the general `z.ZodType` — that specificity is what lets
 * `captureAnalyticsEvent` call `.safeParse` and hand the sink a correlated result with no
 * cast (review round 1, NIT: a widened annotation forced `result.data as
 * AnalyticsEvent["properties"]`). `satisfies` still catches a missing or extra key at compile
 * time, which is the regression guard `events.test.ts` asserts at runtime too, in case this is
 * ever loosened to `Record<string, …>` to silence a compiler error.
 */
export const ANALYTICS_EVENT_PROPERTY_SCHEMAS = {
  job_viewed: jobViewedPropertiesSchema,
  application_started: applicationStartedPropertiesSchema,
  resume_uploaded: resumeUploadedPropertiesSchema,
  application_submitted: applicationSubmittedPropertiesSchema,
  application_stage_changed: applicationStageChangedPropertiesSchema,
  offer_made: offerMadePropertiesSchema,
} satisfies Record<AnalyticsEventName, z.ZodType>;

/** The full validated shape of a funnel event: its name and that name's own properties. */
export const analyticsEventSchema = z.discriminatedUnion("name", [
  z.strictObject({ name: z.literal("job_viewed"), properties: jobViewedPropertiesSchema }),
  z.strictObject({
    name: z.literal("application_started"),
    properties: applicationStartedPropertiesSchema,
  }),
  z.strictObject({
    name: z.literal("resume_uploaded"),
    properties: resumeUploadedPropertiesSchema,
  }),
  z.strictObject({
    name: z.literal("application_submitted"),
    properties: applicationSubmittedPropertiesSchema,
  }),
  z.strictObject({
    name: z.literal("application_stage_changed"),
    properties: applicationStageChangedPropertiesSchema,
  }),
  z.strictObject({ name: z.literal("offer_made"), properties: offerMadePropertiesSchema }),
]);

/** The inferred type of `analyticsEventSchema` — every event this catalog can validate. */
export type AnalyticsEvent = z.infer<typeof analyticsEventSchema>;

/** A `job_viewed` event, narrowed from `AnalyticsEvent`. */
export type JobViewedEvent = Extract<AnalyticsEvent, { name: "job_viewed" }>;

/** An `application_started` event, narrowed from `AnalyticsEvent`. */
export type ApplicationStartedEvent = Extract<AnalyticsEvent, { name: "application_started" }>;

/** A `resume_uploaded` event, narrowed from `AnalyticsEvent`. */
export type ResumeUploadedEvent = Extract<AnalyticsEvent, { name: "resume_uploaded" }>;

/** An `application_submitted` event, narrowed from `AnalyticsEvent`. */
export type ApplicationSubmittedEvent = Extract<AnalyticsEvent, { name: "application_submitted" }>;

/** An `application_stage_changed` event, narrowed from `AnalyticsEvent`. */
export type ApplicationStageChangedEvent = Extract<
  AnalyticsEvent,
  { name: "application_stage_changed" }
>;

/** An `offer_made` event, narrowed from `AnalyticsEvent`. */
export type OfferMadeEvent = Extract<AnalyticsEvent, { name: "offer_made" }>;

/** The two stage-change events `eventsForStageTransition` can return, in emission order. */
export type StageTransitionEvent = ApplicationStageChangedEvent | OfferMadeEvent;

/** One written `application_stage_transitions` row, as `eventsForStageTransition` reads it. */
export type StageTransition = {
  jobId: string;
  applicationId: string;
  source: AnalyticsSource;
  /** `null` on an application's first transition into the pipeline — see Rule 1 below. */
  fromStage: AnalyticsStage | null;
  toStage: AnalyticsStage;
  actorRole: AnalyticsActorRole;
};

/**
 * Maps one written stage-transition row to the events it emits — both rules of
 * docs/specs/ai-45-funnel-analytics.md §3.2, encoded once so no call site has to honour them
 * as prose.
 *
 * **Rule 1 is checked first, unconditionally.** A `fromStage` of `null` — an application's
 * entry into the pipeline — returns `[]` for *every* `toStage`, `"offer"` included. That
 * ordering is deliberate: if the `toStage === "offer"` fan-out below ran first, an entry
 * transition that happened to target `offer` would wrongly emit `offer_made`. `applied`, not
 * `offer`, is the pipeline's real entry stage, but this function does not lean on that fact —
 * it rules out the entry case before it ever looks at the target. A no-op transition
 * (`fromStage === toStage`) also returns `[]`.
 *
 * **Rule 2 — the offer fan-out.** A non-null, non-no-op `fromStage` into `"offer"` returns
 * `application_stage_changed` (carrying `stage: "offer"`), then `offer_made`, in that order,
 * both sharing the same `job_id` and `application_id`. Every other non-null, non-no-op
 * transition returns a single `application_stage_changed`.
 */
export function eventsForStageTransition({
  jobId,
  applicationId,
  source,
  fromStage,
  toStage,
  actorRole,
}: StageTransition): StageTransitionEvent[] {
  if (fromStage === null || fromStage === toStage) {
    return [];
  }

  const stageChanged: ApplicationStageChangedEvent = {
    name: "application_stage_changed",
    properties: {
      job_id: jobId,
      application_id: applicationId,
      source,
      actor_role: actorRole,
      stage: toStage,
      from_stage: fromStage,
    },
  };

  if (toStage !== "offer") {
    return [stageChanged];
  }

  const offerMade: OfferMadeEvent = {
    name: "offer_made",
    properties: {
      job_id: jobId,
      application_id: applicationId,
      source,
      actor_role: actorRole,
      stage: "offer",
    },
  };

  return [stageChanged, offerMade];
}
