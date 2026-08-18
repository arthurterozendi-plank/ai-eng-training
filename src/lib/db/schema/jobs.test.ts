import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { jobs } from "@/lib/db/schema/jobs";

/** The column names a check constraint's SQL references, for assertions that don't rely on SQL string formatting. */
function referencedColumnNames(check: { value: { queryChunks: unknown[] } }): string[] {
  return check.value.queryChunks
    .map((chunk) => (chunk as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string");
}

describe("jobs table", () => {
  it("enables row level security", () => {
    expect(getTableConfig(jobs).enableRLS).toBe(true);
  });

  it("checks that closed_at is null or on/after opened_at", () => {
    const { checks } = getTableConfig(jobs);
    const closedAfterOpened = checks.find(
      (check) => check.name === "jobs_closed_after_opened_check",
    );

    expect(closedAfterOpened).toBeDefined();
    expect(referencedColumnNames(closedAfterOpened!)).toEqual(
      expect.arrayContaining(["closed_at", "opened_at"]),
    );
  });

  it("indexes status", () => {
    const { indexes } = getTableConfig(jobs);
    const statusIndex = indexes.find((index) =>
      index.config.columns.some((column) => "name" in column && column.name === "status"),
    );

    expect(statusIndex).toBeDefined();
  });
});
