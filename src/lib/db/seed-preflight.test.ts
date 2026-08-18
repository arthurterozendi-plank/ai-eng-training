import { describe, expect, it } from "vitest";

import { assertSeedTargetsEmpty, SeedTargetsNotEmptyError } from "./seed-preflight";

describe("assertSeedTargetsEmpty", () => {
  it("does not throw when every target table has zero rows", () => {
    expect(() =>
      assertSeedTargetsEmpty({
        jobs: 0,
        candidates: 0,
        applications: 0,
        application_stage_transitions: 0,
        interviews: 0,
        notes: 0,
      }),
    ).not.toThrow();
  });

  it("does not throw on an empty counts object", () => {
    expect(() => assertSeedTargetsEmpty({})).not.toThrow();
  });

  it("throws a SeedTargetsNotEmptyError naming exactly the populated tables", () => {
    expect.assertions(2);

    try {
      assertSeedTargetsEmpty({
        jobs: 3,
        candidates: 0,
        applications: 0,
        application_stage_transitions: 0,
        interviews: 5,
        notes: 0,
      });
    } catch (error) {
      expect(error).toBeInstanceOf(SeedTargetsNotEmptyError);
      expect((error as SeedTargetsNotEmptyError).populatedTables).toEqual(["jobs", "interviews"]);
    }
  });

  it("omits empty tables from the error entirely", () => {
    expect.assertions(2);

    try {
      assertSeedTargetsEmpty({ jobs: 1, candidates: 0 });
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("jobs");
      expect(message).not.toContain("candidates");
    }
  });

  it("throws when a single table has a single row", () => {
    expect(() => assertSeedTargetsEmpty({ notes: 1 })).toThrowError(SeedTargetsNotEmptyError);
  });
});
