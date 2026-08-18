import { getTableConfig } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { PIPELINE_STAGE_SEED, pipelineStages } from "@/lib/db/schema/pipeline-stages";

describe("PIPELINE_STAGE_SEED", () => {
  it("matches the seeded rows in §3.2, in position order", () => {
    expect(PIPELINE_STAGE_SEED.map((stage) => stage.key)).toEqual([
      "applied",
      "screening",
      "interview",
      "offer",
      "hired",
      "rejected",
      "withdrawn",
    ]);
  });

  it("marks only the last three stages terminal", () => {
    expect(PIPELINE_STAGE_SEED.map((stage) => stage.isTerminal)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
      true,
    ]);
  });

  it("assigns strictly increasing, contiguous positions starting at 1", () => {
    expect(PIPELINE_STAGE_SEED.map((stage) => stage.position)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

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
