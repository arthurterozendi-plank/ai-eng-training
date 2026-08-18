import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { pipelineStages } from "@/lib/db/schema/pipeline-stages";

describe("pipelineStages table", () => {
  it("enables row level security", () => {
    expect(getTableConfig(pipelineStages).enableRLS).toBe(true);
  });

  it("declares no unique constraint on position, deferrable uniqueness is added by the custom migration", () => {
    const { uniqueConstraints } = getTableConfig(pipelineStages);
    const positionUnique = uniqueConstraints.find((constraint) =>
      constraint.columns.some((column) => column.name === "position"),
    );

    expect(positionUnique).toBeUndefined();
  });

  it("uses key as the primary key", () => {
    const { columns } = getTableConfig(pipelineStages);
    const keyColumn = columns.find((column) => column.name === "key");

    expect(keyColumn?.primary).toBe(true);
    expect(keyColumn?.notNull).toBe(true);
  });
});
