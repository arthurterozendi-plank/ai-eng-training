import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { notes } from "@/lib/db/schema/notes";

/** The literal SQL text a check constraint's SQL was built from, for assertions that don't rely on exact formatting. */
function checkSqlText(check: { value: { queryChunks: unknown[] } }): string {
  return check.value.queryChunks
    .map((chunk) => (chunk as { value?: unknown[] }).value)
    .filter((value): value is string[] => Array.isArray(value))
    .flat()
    .join("");
}

describe("notes table", () => {
  it("enables row level security", () => {
    expect(getTableConfig(notes).enableRLS).toBe(true);
  });

  it("declares job_id, candidate_id and application_id as nullable foreign keys that cascade on delete", () => {
    const { foreignKeys, columns } = getTableConfig(notes);

    for (const [columnName, foreignTable] of [
      ["job_id", "id"],
      ["candidate_id", "id"],
      ["application_id", "id"],
    ] as const) {
      const fk = foreignKeys.find((fk) =>
        fk.reference().columns.some((c) => c.name === columnName),
      );
      expect(fk, `expected a foreign key on ${columnName}`).toBeDefined();
      expect(fk!.onDelete).toBe("cascade");
      expect(fk!.reference().foreignColumns.map((c) => c.name)).toEqual([foreignTable]);

      const column = columns.find((column) => column.name === columnName);
      expect(column?.notNull, `expected ${columnName} to be nullable`).toBe(false);
    }
  });

  it("checks that exactly one of job_id, candidate_id, application_id is set", () => {
    const { checks } = getTableConfig(notes);
    const singleParentCheck = checks.find(
      (check) => check.name === "notes_exactly_one_parent_check",
    );

    expect(singleParentCheck).toBeDefined();
    const sqlText = checkSqlText(singleParentCheck!);
    expect(sqlText).toContain("num_nonnulls(");
    expect(sqlText).toContain("= 1");
  });

  it("indexes job_id, candidate_id and application_id", () => {
    const { indexes } = getTableConfig(notes);
    const hasColumnIndex = (columnName: string) =>
      indexes.some((index) =>
        index.config.columns.some((column) => "name" in column && column.name === columnName),
      );

    expect(hasColumnIndex("job_id")).toBe(true);
    expect(hasColumnIndex("candidate_id")).toBe(true);
    expect(hasColumnIndex("application_id")).toBe(true);
  });
});
