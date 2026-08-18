import fs from "node:fs";
import path from "node:path";
import { getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";

import { applicationStageTransitions } from "@/lib/db/schema/application-stage-transitions";
import { applications } from "@/lib/db/schema/applications";
import { candidates } from "@/lib/db/schema/candidates";
import { interviews } from "@/lib/db/schema/interviews";
import { jobs } from "@/lib/db/schema/jobs";
import { notes } from "@/lib/db/schema/notes";
import { PIPELINE_STAGE_SEED, pipelineStages } from "@/lib/db/schema/pipeline-stages";

/**
 * Every table in the schema, read from the same modules the migrations were generated from —
 * so this test's table list can never drift from what `drizzle-kit generate` actually saw.
 */
const ALL_TABLES: PgTable[] = [
  applicationStageTransitions,
  applications,
  candidates,
  interviews,
  jobs,
  notes,
  pipelineStages,
];

/** Concatenation of every generated migration, in the order drizzle-kit would apply them. */
function readGeneratedMigrationsSql(): string {
  const migrationsDir = path.join(process.cwd(), "drizzle");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  return files.map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf-8")).join("\n");
}

/**
 * One row per `pipeline_stages` insert value tuple, keyed by `key`. A regex over the exact
 * `('key', 'label', position, boolean)` shape rather than substring `toContain` checks: a
 * substring check on a number or a boolean cannot tell a correct value from a wrong one that
 * happens to share digits, which defeats the point of this test.
 */
function parseSeededPipelineStageRows(
  sql: string,
): Map<string, { label: string; position: number; isTerminal: boolean }> {
  const rowPattern = /\(\s*'([a-z_]+)',\s*'([^']*)',\s*(\d+),\s*(true|false)\s*\)/g;
  const rows = new Map<string, { label: string; position: number; isTerminal: boolean }>();

  for (const [, key, label, position, isTerminal] of sql.matchAll(rowPattern)) {
    rows.set(key, { label, position: Number(position), isTerminal: isTerminal === "true" });
  }

  return rows;
}

describe("generated migrations (drizzle/)", () => {
  const sql = readGeneratedMigrationsSql();

  it("enables row level security on every table", () => {
    for (const table of ALL_TABLES) {
      const { name } = getTableConfig(table);
      expect(sql).toMatch(new RegExp(`ALTER TABLE "${name}" ENABLE ROW LEVEL SECURITY;`));
    }
  });

  it("creates a BEFORE UPDATE trigger for every table carrying updated_at, and no other table", () => {
    for (const table of ALL_TABLES) {
      const { name, columns } = getTableConfig(table);
      const carriesUpdatedAt = columns.some((column) => column.name === "updated_at");
      const triggerPattern = new RegExp(`CREATE TRIGGER "[^"]+" BEFORE UPDATE ON "${name}" `);

      if (carriesUpdatedAt) {
        expect(sql, `expected a BEFORE UPDATE trigger on "${name}"`).toMatch(triggerPattern);
      } else {
        expect(sql, `did not expect a BEFORE UPDATE trigger on "${name}"`).not.toMatch(
          triggerPattern,
        );
      }
    }
  });

  it("declares pipeline_stages.position UNIQUE and DEFERRABLE INITIALLY IMMEDIATE", () => {
    expect(sql).toMatch(
      /ALTER TABLE "pipeline_stages" ADD CONSTRAINT "[^"]+" UNIQUE \("position"\) DEFERRABLE INITIALLY IMMEDIATE;/,
    );
  });

  it("seeds every field of every PIPELINE_STAGE_SEED row", () => {
    const seededRows = parseSeededPipelineStageRows(sql);

    for (const stage of PIPELINE_STAGE_SEED) {
      const row = seededRows.get(stage.key);

      expect(row, `expected an insert row for pipeline stage "${stage.key}"`).toBeDefined();
      expect(row).toEqual({
        label: stage.label,
        position: stage.position,
        isTerminal: stage.isTerminal,
      });
    }
  });
});
