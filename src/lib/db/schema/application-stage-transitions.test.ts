import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { applicationStageTransitions } from "@/lib/db/schema/application-stage-transitions";

/** The literal SQL text a check constraint's SQL was built from, for assertions that don't rely on exact formatting. */
function checkSqlText(check: { value: { queryChunks: unknown[] } }): string {
  return check.value.queryChunks
    .map((chunk) => (chunk as { value?: unknown[] }).value)
    .filter((value): value is string[] => Array.isArray(value))
    .flat()
    .join("");
}

describe("applicationStageTransitions table", () => {
  it("enables row level security", () => {
    expect(getTableConfig(applicationStageTransitions).enableRLS).toBe(true);
  });

  it("requires application_id, not-null, cascades on delete", () => {
    const { foreignKeys, columns } = getTableConfig(applicationStageTransitions);
    const applicationFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === "application_id"),
    );

    expect(applicationFk).toBeDefined();
    expect(applicationFk!.onDelete).toBe("cascade");

    const applicationIdColumn = columns.find((column) => column.name === "application_id");
    expect(applicationIdColumn?.notNull).toBe(true);
  });

  it("declares from_stage nullable and to_stage not-null, both referencing pipeline_stages(key)", () => {
    const { foreignKeys, columns } = getTableConfig(applicationStageTransitions);

    const fromStageColumn = columns.find((column) => column.name === "from_stage");
    const toStageColumn = columns.find((column) => column.name === "to_stage");
    expect(fromStageColumn?.notNull).toBe(false);
    expect(toStageColumn?.notNull).toBe(true);

    const fromStageFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === "from_stage"),
    );
    const toStageFk = foreignKeys.find((fk) =>
      fk.reference().columns.some((c) => c.name === "to_stage"),
    );
    expect(fromStageFk!.reference().foreignColumns.map((c) => c.name)).toEqual(["key"]);
    expect(toStageFk!.reference().foreignColumns.map((c) => c.name)).toEqual(["key"]);
  });

  it("checks that from_stage and to_stage are never equal", () => {
    const { checks } = getTableConfig(applicationStageTransitions);
    const distinctCheck = checks.find(
      (check) => check.name === "application_stage_transitions_from_to_distinct_check",
    );

    expect(distinctCheck).toBeDefined();
    const sqlText = checkSqlText(distinctCheck!);
    expect(sqlText).toContain("IS NULL");
    expect(sqlText).toContain("<>");
  });

  it("indexes (application_id, occurred_at)", () => {
    const { indexes } = getTableConfig(applicationStageTransitions);
    const compositeIndex = indexes.find((index) => {
      const names = index.config.columns
        .map((column) => ("name" in column ? column.name : undefined))
        .filter(Boolean);
      return names.includes("application_id") && names.includes("occurred_at");
    });

    expect(compositeIndex).toBeDefined();
  });
});
