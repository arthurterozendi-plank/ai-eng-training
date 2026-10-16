import crypto from "node:crypto";
import { applicationSource } from "@talentscout/db/schema/enums";
import { PIPELINE_STAGE_SEED } from "@talentscout/db/schema/pipeline-stages";
import { describe, expect, it } from "vitest";

import {
  actorRoleSchema,
  ANALYTICS_ACTOR_ROLES,
  ANALYTICS_SOURCE_VALUES,
  ANALYTICS_STAGE_VALUES,
  applicationDraftIdSchema,
  applicationIdSchema,
  jobIdSchema,
  sourceSchema,
  stageSchema,
} from "@/lib/analytics/properties";

// These two set-equality checks are the only place in `apps/web` allowed a runtime import of
// `@talentscout/db/schema/enums` reachable from an analytics module — it is free here because
// a test never reaches the client bundle. `properties.ts` itself uses type-only imports; see
// docs/specs/ai-45-funnel-analytics.md §2 and 🟡 #16.
describe("database-derived vocabularies stay in sync", () => {
  it("ANALYTICS_SOURCE_VALUES is set-equal to applicationSource.enumValues", () => {
    expect(new Set(ANALYTICS_SOURCE_VALUES)).toEqual(new Set(applicationSource.enumValues));
  });

  it("ANALYTICS_STAGE_VALUES is set-equal to PIPELINE_STAGE_SEED's keys", () => {
    expect(new Set(ANALYTICS_STAGE_VALUES)).toEqual(
      new Set(PIPELINE_STAGE_SEED.map((stage) => stage.key)),
    );
  });

  it("the real ANALYTICS_SOURCE_VALUES export satisfies the database's type, at compile time", () => {
    type DatabaseSourceValue = (typeof applicationSource.enumValues)[number];

    // Checks the actual exported constant, not a value rebuilt in this file (review round 2,
    // SHOULD): a fresh array literal here would satisfy `DatabaseSourceValue` regardless of
    // whether `properties.ts`'s own `satisfies` clause still exists, which is what made the
    // previous version of this test prove a property of `tsc` rather than of `properties.ts`
    // — it stayed green after that clause was deleted entirely. This line compiles today
    // because `ANALYTICS_SOURCE_VALUES`'s current values are exactly the database's; it goes
    // red the moment a value outside `DatabaseSourceValue` is ever added to that export,
    // independent of what `properties.ts`'s own `satisfies` clause says at the time.
    const checked = ANALYTICS_SOURCE_VALUES satisfies readonly DatabaseSourceValue[];

    expect(checked).toEqual(ANALYTICS_SOURCE_VALUES);
  });
});

describe.each([
  ["jobIdSchema", jobIdSchema],
  ["applicationIdSchema", applicationIdSchema],
  ["applicationDraftIdSchema", applicationDraftIdSchema],
])("%s", (_name, schema) => {
  it.each([
    ["a personal name", "Ada Lovelace"],
    ["an email address", "ada@example.com"],
    ["an empty string", ""],
    ['the literal string "undefined"', "undefined"],
  ])("rejects %s", (_label, value) => {
    expect(schema.safeParse(value).success).toBe(false);
  });

  it("accepts a generated uuid", () => {
    expect(schema.safeParse(crypto.randomUUID()).success).toBe(true);
  });
});

describe("sourceSchema", () => {
  it("accepts every applicationSource.enumValues member", () => {
    for (const value of applicationSource.enumValues) {
      expect(sourceSchema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects a value outside the vocabulary", () => {
    expect(sourceSchema.safeParse("postcard").success).toBe(false);
  });
});

describe("stageSchema", () => {
  it("accepts every PIPELINE_STAGE_SEED key", () => {
    for (const stage of PIPELINE_STAGE_SEED) {
      expect(stageSchema.safeParse(stage.key).success).toBe(true);
    }
  });

  it("rejects a value outside the vocabulary", () => {
    expect(stageSchema.safeParse("nurturing").success).toBe(false);
  });
});

describe("actorRoleSchema", () => {
  it("accepts exactly the four roles of §3.3", () => {
    expect(ANALYTICS_ACTOR_ROLES).toEqual(["visitor", "candidate", "recruiter", "system"]);
    for (const role of ANALYTICS_ACTOR_ROLES) {
      expect(actorRoleSchema.safeParse(role).success).toBe(true);
    }
  });

  it("rejects an unlisted role", () => {
    expect(actorRoleSchema.safeParse("admin").success).toBe(false);
  });
});
