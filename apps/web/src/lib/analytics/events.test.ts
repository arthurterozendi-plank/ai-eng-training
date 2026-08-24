import crypto from "node:crypto";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { captureAnalyticsEvent } from "@/lib/analytics/capture";
import {
  ANALYTICS_EVENT_NAME_PATTERN,
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENT_PROPERTY_SCHEMAS,
  ANALYTICS_IRREGULAR_PAST_TENSE_VERBS,
  analyticsEventSchema,
  eventsForStageTransition,
  type AnalyticsEvent,
  type AnalyticsEventName,
} from "@/lib/analytics/events";
import {
  actorRoleSchema,
  ANALYTICS_ACTOR_ROLES,
  ANALYTICS_SOURCE_VALUES,
  ANALYTICS_STAGE_VALUES,
  jobIdSchema,
  sourceSchema,
  stageSchema,
} from "@/lib/analytics/properties";

/** Returns a shallow copy of `value` with `key` removed. */
function omit<T extends Record<string, unknown>>(value: T, key: keyof T): Record<string, unknown> {
  const clone: Record<string, unknown> = { ...value };
  delete clone[key as string];
  return clone;
}

const A_JOB_ID = crypto.randomUUID();
const AN_APPLICATION_ID = crypto.randomUUID();
const A_DRAFT_ID = crypto.randomUUID();
const A_SOURCE = sourceSchema.options[0];
const AN_ACTOR_ROLE = actorRoleSchema.options[0];

/**
 * One minimal, valid `properties` payload per catalog event — the fixtures every DoD
 * assertion below tampers with. Each fixture's own key set is itself the positive half of
 * §3.3's per-event table; the AC 3 tests below assert the negative half by adding or removing
 * keys from these.
 */
const VALID_PROPERTIES: Record<AnalyticsEventName, Record<string, unknown>> = {
  job_viewed: {
    job_id: A_JOB_ID,
    actor_role: AN_ACTOR_ROLE,
  },
  application_started: {
    job_id: A_JOB_ID,
    source: A_SOURCE,
    actor_role: AN_ACTOR_ROLE,
    application_draft_id: A_DRAFT_ID,
  },
  resume_uploaded: {
    job_id: A_JOB_ID,
    source: A_SOURCE,
    actor_role: AN_ACTOR_ROLE,
    application_draft_id: A_DRAFT_ID,
  },
  application_submitted: {
    job_id: A_JOB_ID,
    source: A_SOURCE,
    stage: stageSchema.options[0],
    actor_role: AN_ACTOR_ROLE,
    application_draft_id: A_DRAFT_ID,
    application_id: AN_APPLICATION_ID,
  },
  application_stage_changed: {
    job_id: A_JOB_ID,
    application_id: AN_APPLICATION_ID,
    source: A_SOURCE,
    actor_role: AN_ACTOR_ROLE,
    stage: stageSchema.options[1],
    from_stage: stageSchema.options[0],
  },
  offer_made: {
    job_id: A_JOB_ID,
    application_id: AN_APPLICATION_ID,
    source: A_SOURCE,
    actor_role: AN_ACTOR_ROLE,
    stage: "offer",
  },
};

describe("fixtures", () => {
  it.each(ANALYTICS_EVENT_NAMES)("VALID_PROPERTIES.%s parses", (name) => {
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(VALID_PROPERTIES[name]).success).toBe(
      true,
    );
  });
});

describe("analyticsEventSchema — the name/properties pairing itself", () => {
  it.each(ANALYTICS_EVENT_NAMES)("accepts a well-formed %s event", (name) => {
    expect(
      analyticsEventSchema.safeParse({ name, properties: VALID_PROPERTIES[name] }).success,
    ).toBe(true);
  });

  // The per-name property schemas are exercised exhaustively elsewhere; this block exists
  // only to prove the *pairing* `analyticsEventSchema` performs is itself asserted, not just
  // inferred through `z.infer` with no runtime check behind it (review round 1, NIT).
  it("rejects a valid properties payload paired with the wrong event name", () => {
    const mismatched = {
      name: "application_submitted",
      properties: VALID_PROPERTIES.job_viewed,
    };

    expect(analyticsEventSchema.safeParse(mismatched).success).toBe(false);
  });

  it("rejects a name outside the catalog", () => {
    const unknown = { name: "resume_deleted", properties: VALID_PROPERTIES.job_viewed };

    expect(analyticsEventSchema.safeParse(unknown).success).toBe(false);
  });
});

describe("AC 2 — naming convention", () => {
  it("has exactly six event names", () => {
    expect(ANALYTICS_EVENT_NAMES).toHaveLength(6);
  });

  it("has no duplicate names", () => {
    expect(new Set(ANALYTICS_EVENT_NAMES).size).toBe(ANALYTICS_EVENT_NAMES.length);
  });

  it.each(ANALYTICS_EVENT_NAMES)("%s matches the object_action pattern", (name) => {
    expect(name).toMatch(ANALYTICS_EVENT_NAME_PATTERN);
  });

  it.each(ANALYTICS_EVENT_NAMES)("%s has at least two segments", (name) => {
    expect(name.split("_").length).toBeGreaterThanOrEqual(2);
  });

  it.each(ANALYTICS_EVENT_NAMES)("%s's final segment is past tense", (name) => {
    const finalSegment = name.split("_").at(-1) ?? "";
    const isRegularPastTense = /ed$/.test(finalSegment);
    const isIrregular = (ANALYTICS_IRREGULAR_PAST_TENSE_VERBS as readonly string[]).includes(
      finalSegment,
    );

    expect(isRegularPastTense || isIrregular).toBe(true);
  });
});

describe("ANALYTICS_EVENT_NAME_PATTERN rejects malformed shapes", () => {
  it.each(["jobViewed", "job-viewed", "jobviewed", "Job_Viewed", "job_viewed_", "_job_viewed"])(
    "rejects %s",
    (malformed) => {
      expect(malformed).not.toMatch(ANALYTICS_EVENT_NAME_PATTERN);
    },
  );
});

describe("AC 3 — job_id and actor_role are required on all six events", () => {
  it.each(ANALYTICS_EVENT_NAMES)("%s rejects a payload missing job_id", (name) => {
    const tampered = omit(VALID_PROPERTIES[name], "job_id");
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });

  it.each(ANALYTICS_EVENT_NAMES)("%s rejects a payload missing actor_role", (name) => {
    const tampered = omit(VALID_PROPERTIES[name], "actor_role");
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });
});

describe("AC 3 — source is required on the five other than job_viewed, optional there", () => {
  const EVENTS_REQUIRING_SOURCE = ANALYTICS_EVENT_NAMES.filter((name) => name !== "job_viewed");

  it.each(EVENTS_REQUIRING_SOURCE)("%s rejects a payload missing source", (name) => {
    const tampered = omit(VALID_PROPERTIES[name], "source");
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });

  it("job_viewed accepts a payload with no source", () => {
    expect(
      ANALYTICS_EVENT_PROPERTY_SCHEMAS.job_viewed.safeParse(VALID_PROPERTIES.job_viewed).success,
    ).toBe(true);
  });

  it("job_viewed accepts a payload that carries source", () => {
    const withSource = { ...VALID_PROPERTIES.job_viewed, source: A_SOURCE };
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS.job_viewed.safeParse(withSource).success).toBe(true);
  });
});

describe("AC 3 — stage is required on exactly application_submitted, application_stage_changed, offer_made", () => {
  const EVENTS_WITH_STAGE = [
    "application_submitted",
    "application_stage_changed",
    "offer_made",
  ] as const;
  const EVENTS_WITHOUT_STAGE = ["job_viewed", "application_started", "resume_uploaded"] as const;

  it.each(EVENTS_WITH_STAGE)("%s rejects a payload missing stage", (name) => {
    const tampered = omit(VALID_PROPERTIES[name], "stage");
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });

  it.each(EVENTS_WITHOUT_STAGE)("%s rejects a payload that adds stage", (name) => {
    const tampered = { ...VALID_PROPERTIES[name], stage: stageSchema.options[0] };
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });
});

describe("AC 3 — application_draft_id required on exactly the three pre-submit events, rejected on the other three", () => {
  const EVENTS_WITH_DRAFT_ID = [
    "application_started",
    "resume_uploaded",
    "application_submitted",
  ] as const;
  const EVENTS_WITHOUT_DRAFT_ID = [
    "job_viewed",
    "application_stage_changed",
    "offer_made",
  ] as const;

  it.each(EVENTS_WITH_DRAFT_ID)("%s rejects a payload missing application_draft_id", (name) => {
    const tampered = omit(VALID_PROPERTIES[name], "application_draft_id");
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });

  it.each(EVENTS_WITHOUT_DRAFT_ID)(
    "%s rejects a payload that adds application_draft_id",
    (name) => {
      const tampered = { ...VALID_PROPERTIES[name], application_draft_id: A_DRAFT_ID };
      expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
    },
  );
});

describe("AC 3 — application_id required on exactly the three post-write events, rejected on the other three", () => {
  const EVENTS_WITH_APPLICATION_ID = [
    "application_submitted",
    "application_stage_changed",
    "offer_made",
  ] as const;
  const EVENTS_WITHOUT_APPLICATION_ID = [
    "job_viewed",
    "application_started",
    "resume_uploaded",
  ] as const;

  it.each(EVENTS_WITH_APPLICATION_ID)("%s rejects a payload missing application_id", (name) => {
    const tampered = omit(VALID_PROPERTIES[name], "application_id");
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });

  it.each(EVENTS_WITHOUT_APPLICATION_ID)(
    "%s rejects a payload that adds application_id",
    (name) => {
      const tampered = { ...VALID_PROPERTIES[name], application_id: AN_APPLICATION_ID };
      expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
    },
  );
});

describe("AC 5 — application_started and resume_uploaded are satisfiable pre-submit", () => {
  const PRE_SUBMIT_EVENTS = ["application_started", "resume_uploaded"] as const;

  it.each(PRE_SUBMIT_EVENTS)(
    "%s parses from job id, source, actor role and draft id alone",
    (name) => {
      expect(Object.keys(VALID_PROPERTIES[name]).sort()).toEqual(
        ["job_id", "source", "actor_role", "application_draft_id"].sort(),
      );
      expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(VALID_PROPERTIES[name]).success).toBe(
        true,
      );
    },
  );

  it.each(PRE_SUBMIT_EVENTS)("%s rejects the same payload plus application_id", (name) => {
    const tampered = { ...VALID_PROPERTIES[name], application_id: AN_APPLICATION_ID };
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });
});

describe("Rule 1 — application_stage_changed rejects a null from_stage and a no-op transition", () => {
  it("rejects a null from_stage", () => {
    const tampered = { ...VALID_PROPERTIES.application_stage_changed, from_stage: null };
    expect(
      ANALYTICS_EVENT_PROPERTY_SCHEMAS.application_stage_changed.safeParse(tampered).success,
    ).toBe(false);
  });

  it("rejects from_stage equal to stage", () => {
    const tampered = {
      ...VALID_PROPERTIES.application_stage_changed,
      from_stage: VALID_PROPERTIES.application_stage_changed.stage,
    };
    expect(
      ANALYTICS_EVENT_PROPERTY_SCHEMAS.application_stage_changed.safeParse(tampered).success,
    ).toBe(false);
  });

  it("accepts a non-null from_stage that differs from stage", () => {
    expect(
      ANALYTICS_EVENT_PROPERTY_SCHEMAS.application_stage_changed.safeParse(
        VALID_PROPERTIES.application_stage_changed,
      ).success,
    ).toBe(true);
  });
});

describe('Rule 2 — offer_made rejects any stage other than the literal "offer"', () => {
  const nonOfferStages = stageSchema.options.filter((stage) => stage !== "offer");

  it.each(nonOfferStages)("rejects stage %s", (stage) => {
    const tampered = { ...VALID_PROPERTIES.offer_made, stage };
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS.offer_made.safeParse(tampered).success).toBe(false);
  });

  it('accepts stage "offer"', () => {
    expect(
      ANALYTICS_EVENT_PROPERTY_SCHEMAS.offer_made.safeParse(VALID_PROPERTIES.offer_made).success,
    ).toBe(true);
  });
});

describe("AC 4 — every property rejects a personal name or an email address as its value", () => {
  // Driven off each schema's own `shape`, not `VALID_PROPERTIES`' keys (review round 2, NIT):
  // `job_viewed.source` is optional, so it is absent from `VALID_PROPERTIES.job_viewed` and
  // would silently skip this matrix if the matrix were built from the fixture instead of the
  // schema — the catalog's one optional property is exactly the one case a fixture-driven
  // list cannot be trusted to include.
  const eventPropertyPairs = ANALYTICS_EVENT_NAMES.flatMap((name) => {
    const schema = ANALYTICS_EVENT_PROPERTY_SCHEMAS[name] as z.ZodObject<z.ZodRawShape>;

    return Object.keys(schema.shape).map((property) => [name, property] as const);
  });

  it.each(eventPropertyPairs)("%s.%s rejects a personal name", (name, property) => {
    const tampered = { ...VALID_PROPERTIES[name], [property]: "Ada Lovelace" };
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });

  it.each(eventPropertyPairs)("%s.%s rejects an email address", (name, property) => {
    const tampered = { ...VALID_PROPERTIES[name], [property]: "ada@example.com" };
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });
});

describe("AC 4 — every schema rejects an unknown key", () => {
  it.each(ANALYTICS_EVENT_NAMES)("%s rejects a valid payload plus candidate_email", (name) => {
    const tampered = { ...VALID_PROPERTIES[name], candidate_email: "ada@example.com" };
    expect(ANALYTICS_EVENT_PROPERTY_SCHEMAS[name].safeParse(tampered).success).toBe(false);
  });
});

describe("AC 4 — no property name leaks PII by its name alone", () => {
  // Catches the specific trap named in docs/specs/ai-45-funnel-analytics.md §5 slice 2:
  // `file_name` on a résumé property, because a résumé filename usually *is* the candidate's
  // name. Introspects the real schemas' `.shape` rather than a hand-maintained list, so a
  // property added to any event schema without updating this deny-list still gets caught.
  const PII_PROPERTY_NAME_PATTERN =
    /(name|email|phone|resume|letter|address|body|summary|text|file|url)/;

  it.each(ANALYTICS_EVENT_NAMES)("%s's property names all clear the deny-list", (name) => {
    const schema = ANALYTICS_EVENT_PROPERTY_SCHEMAS[name] as z.ZodObject<z.ZodRawShape>;

    for (const propertyName of Object.keys(schema.shape)) {
      expect(propertyName).not.toMatch(PII_PROPERTY_NAME_PATTERN);
    }
  });
});

describe("regression guard — the property-schema map's key set never drifts from the catalog", () => {
  // Green by construction: `ANALYTICS_EVENT_PROPERTY_SCHEMAS` is typed
  // `Record<AnalyticsEventName, z.ZodType>`, so TypeScript itself rejects a missing or extra
  // key at compile time. This runtime check exists for the day that type is widened to a
  // plain `string` key to silence a compiler error — the realistic way a name and its schema
  // drift apart — which this would still catch.
  it("has exactly the six catalog names as keys, and no others", () => {
    expect(Object.keys(ANALYTICS_EVENT_PROPERTY_SCHEMAS).sort()).toEqual(
      [...ANALYTICS_EVENT_NAMES].sort(),
    );
  });
});

describe("eventsForStageTransition", () => {
  const BASE_PARAMS = {
    jobId: A_JOB_ID,
    applicationId: AN_APPLICATION_ID,
    source: A_SOURCE,
    actorRole: AN_ACTOR_ROLE,
  };

  describe("Rule 1 — a null fromStage emits nothing, for every target stage", () => {
    const NON_OFFER_STAGES = stageSchema.options.filter((stage) => stage !== "offer");

    it.each(NON_OFFER_STAGES)("returns [] when fromStage is null and toStage is %s", (toStage) => {
      expect(eventsForStageTransition({ ...BASE_PARAMS, fromStage: null, toStage })).toEqual([]);
    });

    // Called out separately from the loop above: this is the one target where Rule 2's
    // fan-out and Rule 1's null check could be implemented in the wrong order. If Rule 2 ran
    // first, an entry transition that happened to target "offer" would wrongly emit
    // offer_made.
    it("returns [] when fromStage is null and toStage is offer", () => {
      expect(
        eventsForStageTransition({ ...BASE_PARAMS, fromStage: null, toStage: "offer" }),
      ).toEqual([]);
    });
  });

  it("returns [] for a no-op transition (fromStage === toStage)", () => {
    expect(
      eventsForStageTransition({ ...BASE_PARAMS, fromStage: "screening", toStage: "screening" }),
    ).toEqual([]);
  });

  describe("Rule 2 — a non-null fromStage into offer fans out to two events, in order", () => {
    const result = eventsForStageTransition({
      ...BASE_PARAMS,
      fromStage: "interview",
      toStage: "offer",
    });

    it("returns exactly two events, application_stage_changed then offer_made", () => {
      expect(result.map((event) => event.name)).toEqual([
        "application_stage_changed",
        "offer_made",
      ]);
    });

    it("both events share one job_id and one application_id", () => {
      for (const event of result) {
        expect(event.properties.job_id).toBe(A_JOB_ID);
        expect(event.properties.application_id).toBe(AN_APPLICATION_ID);
      }
    });

    it('the second event carries stage: "offer"', () => {
      expect(result[1].properties.stage).toBe("offer");
    });

    it("both events parse against their own catalog schema", () => {
      for (const event of result) {
        expect(
          ANALYTICS_EVENT_PROPERTY_SCHEMAS[event.name].safeParse(event.properties).success,
        ).toBe(true);
      }
    });
  });

  describe("every other non-null, non-no-op transition returns exactly one application_stage_changed", () => {
    const otherTargets = stageSchema.options.filter(
      (stage) => stage !== "offer" && stage !== "applied",
    );

    it.each(otherTargets)("fromStage applied, toStage %s", (toStage) => {
      const result = eventsForStageTransition({ ...BASE_PARAMS, fromStage: "applied", toStage });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("application_stage_changed");
    });
  });
});

/** True for a uuid string or a member of one of the three closed vocabularies of §3.3. */
function isUuidOrClosedVocabularyMember(value: unknown): boolean {
  if (typeof value !== "string") return false;

  const isUuid = jobIdSchema.safeParse(value).success;
  const isKnownVocabularyValue =
    (ANALYTICS_SOURCE_VALUES as readonly string[]).includes(value) ||
    (ANALYTICS_STAGE_VALUES as readonly string[]).includes(value) ||
    (ANALYTICS_ACTOR_ROLES as readonly string[]).includes(value);

  return isUuid || isKnownVocabularyValue;
}

type RecordedEvent = { name: AnalyticsEventName; properties: Record<string, unknown> };

describe("funnel walk — AC 1 (emission half) and AC 5 (partial funnels)", () => {
  it("a full walk through captureAnalyticsEvent records all six names, in order, with only uuid or closed-vocabulary property values (AC 1, AC 4 end to end)", () => {
    const recorded: RecordedEvent[] = [];
    const sink = (name: AnalyticsEventName, properties: unknown) => {
      recorded.push({ name, properties: properties as Record<string, unknown> });
    };

    captureAnalyticsEvent(
      { name: "job_viewed", properties: VALID_PROPERTIES.job_viewed } as unknown as AnalyticsEvent,
      sink,
    );
    captureAnalyticsEvent(
      {
        name: "application_started",
        properties: VALID_PROPERTIES.application_started,
      } as unknown as AnalyticsEvent,
      sink,
    );
    captureAnalyticsEvent(
      {
        name: "resume_uploaded",
        properties: VALID_PROPERTIES.resume_uploaded,
      } as unknown as AnalyticsEvent,
      sink,
    );
    captureAnalyticsEvent(
      {
        name: "application_submitted",
        properties: VALID_PROPERTIES.application_submitted,
      } as unknown as AnalyticsEvent,
      sink,
    );

    // A non-entry transition targeting "offer" specifically: Rule 2 is what makes this one
    // call yield both remaining catalog events. Any other target would produce five recorded
    // names against the six-name assertion below, which could never go green.
    const stageEvents = eventsForStageTransition({
      jobId: A_JOB_ID,
      applicationId: AN_APPLICATION_ID,
      source: A_SOURCE,
      fromStage: stageSchema.options[0],
      toStage: "offer",
      actorRole: AN_ACTOR_ROLE,
    });
    for (const event of stageEvents) {
      captureAnalyticsEvent(event, sink);
    }

    expect(recorded.map((event) => event.name)).toEqual([...ANALYTICS_EVENT_NAMES]);

    for (const event of recorded) {
      for (const value of Object.values(event.properties)) {
        expect(isUuidOrClosedVocabularyMember(value)).toBe(true);
      }
    }
  });

  it("a walk abandoned after resume_uploaded records exactly the first three names, valid, sharing one draft id, job_viewed carrying none (AC 5)", () => {
    const recorded: RecordedEvent[] = [];
    const sink = (name: AnalyticsEventName, properties: unknown) => {
      recorded.push({ name, properties: properties as Record<string, unknown> });
    };

    captureAnalyticsEvent(
      { name: "job_viewed", properties: VALID_PROPERTIES.job_viewed } as unknown as AnalyticsEvent,
      sink,
    );
    captureAnalyticsEvent(
      {
        name: "application_started",
        properties: VALID_PROPERTIES.application_started,
      } as unknown as AnalyticsEvent,
      sink,
    );
    captureAnalyticsEvent(
      {
        name: "resume_uploaded",
        properties: VALID_PROPERTIES.resume_uploaded,
      } as unknown as AnalyticsEvent,
      sink,
    );

    expect(recorded.map((event) => event.name)).toEqual(ANALYTICS_EVENT_NAMES.slice(0, 3));

    const [jobViewed, applicationStarted, resumeUploaded] = recorded;
    expect(jobViewed.properties.application_draft_id).toBeUndefined();
    expect(applicationStarted.properties.application_draft_id).toBe(
      resumeUploaded.properties.application_draft_id,
    );
    expect(applicationStarted.properties.application_draft_id).toBe(A_DRAFT_ID);
  });
});
