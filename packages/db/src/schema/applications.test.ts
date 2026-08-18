import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { applications } from "@/schema/applications";

/** The literal SQL text a check constraint's SQL was built from, for assertions that don't rely on exact formatting. */
function checkSqlText(check: { value: { queryChunks: unknown[] } }): string {
  return check.value.queryChunks
    .map((chunk) => (chunk as { value?: unknown[] }).value)
    .filter((value): value is string[] => Array.isArray(value))
    .flat()
    .join("");
}

describe("applications table", () => {
  it("enables row level security", () => {
    expect(getTableConfig(applications).enableRLS).toBe(true);
  });

  it("requires job_id, not-null, restricted on delete", () => {
    const { foreignKeys } = getTableConfig(applications);
    const jobFk = foreignKeys.find((fk) => fk.reference().columns.some((c) => c.name === "job_id"));

    expect(jobFk).toBeDefined();
    expect(jobFk!.onDelete).toBe("restrict");
    expect(jobFk!.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);

    const { columns } = getTableConfig(applications);
    const jobIdColumn = columns.find((column) => column.name === "job_id");
    expect(jobIdColumn?.notNull).toBe(true);
  });

  it("requires candidate_id, not-null, restricted on delete", () => {
    const { foreignKeys } = getTableConfig(applications);
    const candidateFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === "candidate_id"),
    );

    expect(candidateFk).toBeDefined();
    expect(candidateFk!.onDelete).toBe("restrict");
    expect(candidateFk!.reference().foreignColumns.map((c) => c.name)).toEqual(["id"]);

    const { columns } = getTableConfig(applications);
    const candidateIdColumn = columns.find((column) => column.name === "candidate_id");
    expect(candidateIdColumn?.notNull).toBe(true);
  });

  it("references pipeline_stages(key) for stage, not-null, restricted on delete", () => {
    const { foreignKeys, columns } = getTableConfig(applications);
    const stageFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === "stage"),
    );

    expect(stageFk).toBeDefined();
    expect(stageFk!.onDelete).toBe("restrict");
    expect(stageFk!.reference().foreignColumns.map((c) => c.name)).toEqual(["key"]);

    const stageColumn = columns.find((column) => column.name === "stage");
    expect(stageColumn?.notNull).toBe(true);
  });

  it("declares a unique constraint on exactly (job_id, candidate_id)", () => {
    const { uniqueConstraints } = getTableConfig(applications);
    const pairUnique = uniqueConstraints.find(
      (constraint) =>
        constraint.columns
          .map((c) => c.name)
          .sort()
          .join(",") === "candidate_id,job_id",
    );

    expect(pairUnique).toBeDefined();
    expect(pairUnique!.columns).toHaveLength(2);
  });

  it("checks the extraction envelope with jsonb_exists, not the ? operator", () => {
    const { checks } = getTableConfig(applications);
    const envelopeCheck = checks.find(
      (check) => check.name === "applications_extraction_envelope_check",
    );

    expect(envelopeCheck).toBeDefined();
    const sqlText = checkSqlText(envelopeCheck!);
    expect(sqlText).toContain("jsonb_exists(");
    expect(sqlText).toContain("schemaVersion");
    expect(sqlText).toContain("fields");
    expect(sqlText).not.toContain("?");
  });

  it("indexes candidate_id, stage, applied_at and extraction (gin)", () => {
    const { indexes } = getTableConfig(applications);

    const hasColumnIndex = (columnName: string) =>
      indexes.some((index) =>
        index.config.columns.some((column) => "name" in column && column.name === columnName),
      );

    expect(hasColumnIndex("candidate_id")).toBe(true);
    expect(hasColumnIndex("stage")).toBe(true);
    expect(hasColumnIndex("applied_at")).toBe(true);

    const ginIndex = indexes.find((index) => index.config.method === "gin");
    expect(ginIndex).toBeDefined();
    expect(
      ginIndex!.config.columns.some((column) => "name" in column && column.name === "extraction"),
    ).toBe(true);
  });
});
