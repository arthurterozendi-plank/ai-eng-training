import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { candidates } from "@/schema/candidates";

/** The column names a check constraint's SQL references, for assertions that don't rely on SQL string formatting. */
function referencedColumnNames(check: { value: { queryChunks: unknown[] } }): string[] {
  return check.value.queryChunks
    .map((chunk) => (chunk as { name?: unknown }).name)
    .filter((name): name is string => typeof name === "string");
}

describe("candidates table", () => {
  it("enables row level security", () => {
    expect(getTableConfig(candidates).enableRLS).toBe(true);
  });

  it("declares email as unique", () => {
    const { columns } = getTableConfig(candidates);
    const emailColumn = columns.find((column) => column.name === "email");

    expect(emailColumn?.isUnique).toBe(true);
  });

  it("checks that email is stored lowercase", () => {
    const { checks } = getTableConfig(candidates);
    const emailLowercase = checks.find(
      (check) => check.name === "candidates_email_lowercase_check",
    );

    expect(emailLowercase).toBeDefined();
    expect(referencedColumnNames(emailLowercase!)).toEqual(expect.arrayContaining(["email"]));
  });

  it("checks that years_experience is null or within 0-60", () => {
    const { checks } = getTableConfig(candidates);
    const yearsRange = checks.find(
      (check) => check.name === "candidates_years_experience_range_check",
    );

    expect(yearsRange).toBeDefined();
    expect(referencedColumnNames(yearsRange!)).toEqual(
      expect.arrayContaining(["years_experience"]),
    );
  });
});
