import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { interviews } from "@/schema/interviews";

/** The column names a check constraint's SQL references, for assertions that don't rely on SQL string formatting. */
function referencedColumnNames(check: { value: { queryChunks: unknown[] } }): string[] {
  return check.value.queryChunks
    .map((chunk) => (chunk as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string");
}

describe("interviews table", () => {
  it("enables row level security", () => {
    expect(getTableConfig(interviews).enableRLS).toBe(true);
  });

  it("requires application_id, not-null, cascades on delete", () => {
    const { foreignKeys, columns } = getTableConfig(interviews);
    const applicationFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === "application_id"),
    );

    expect(applicationFk).toBeDefined();
    expect(applicationFk!.onDelete).toBe("cascade");
    expect(applicationFk!.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);

    const applicationIdColumn = columns.find((column) => column.name === "application_id");
    expect(applicationIdColumn?.notNull).toBe(true);
  });

  it("checks that duration_minutes is positive", () => {
    const { checks } = getTableConfig(interviews);
    const durationPositive = checks.find(
      (check) => check.name === "interviews_duration_minutes_positive_check",
    );

    expect(durationPositive).toBeDefined();
    expect(referencedColumnNames(durationPositive!)).toEqual(
      expect.arrayContaining(["duration_minutes"]),
    );
  });

  it("indexes (application_id, scheduled_at)", () => {
    const { indexes } = getTableConfig(interviews);
    const compositeIndex = indexes.find((index) => {
      const names = index.config.columns
        .map((column) => ("name" in column ? column.name : undefined))
        .filter(Boolean);
      return names.includes("application_id") && names.includes("scheduled_at");
    });

    expect(compositeIndex).toBeDefined();
  });
});
