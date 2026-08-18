import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  applicationSource,
  employmentType,
  interviewKind,
  interviewRecommendation,
  interviewStatus,
  jobStatus,
} from "@/schema/enums";

/** Concatenation of every generated migration, in the order drizzle-kit would apply them. */
function readGeneratedMigrationsSql(): string {
  // Resolved from this file's own location, not `process.cwd()` — matches
  // `scripts/db-migrate.ts`'s `MIGRATIONS_FOLDER`, and keeps working if vitest is ever invoked
  // from a directory other than the repo root.
  const migrationsDir = path.join(import.meta.dirname, "..", "..", "drizzle");
  const files = fs
    .readdirSync(migrationsDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  return files.map((file) => fs.readFileSync(path.join(migrationsDir, file), "utf-8")).join("\n");
}

/**
 * The ordered value list from a generated `CREATE TYPE "public"."<name>" AS ENUM(...)`
 * statement — the SQL drizzle-kit actually produced, independent of the `pgEnum()` call the
 * enum module exports.
 */
function parseGeneratedEnumValues(sql: string, enumName: string): string[] {
  const pattern = new RegExp(`CREATE TYPE "public"\\."${enumName}" AS ENUM\\(([^)]*)\\);`);
  const match = sql.match(pattern);

  if (!match) return [];

  return match[1].split(",").map((value) => value.trim().replace(/^'|'$/g, ""));
}

describe("enums", () => {
  const sql = readGeneratedMigrationsSql();

  it("declares job_status per §3.1", () => {
    expect(jobStatus.enumValues).toEqual(parseGeneratedEnumValues(sql, "job_status"));
  });

  it("declares employment_type per §3.1", () => {
    expect(employmentType.enumValues).toEqual(parseGeneratedEnumValues(sql, "employment_type"));
  });

  it("declares application_source per §3.1", () => {
    expect(applicationSource.enumValues).toEqual(
      parseGeneratedEnumValues(sql, "application_source"),
    );
  });

  it("declares interview_kind per §3.1", () => {
    expect(interviewKind.enumValues).toEqual(parseGeneratedEnumValues(sql, "interview_kind"));
  });

  it("declares interview_status per §3.1", () => {
    expect(interviewStatus.enumValues).toEqual(parseGeneratedEnumValues(sql, "interview_status"));
  });

  it("declares interview_recommendation per §3.1", () => {
    expect(interviewRecommendation.enumValues).toEqual(
      parseGeneratedEnumValues(sql, "interview_recommendation"),
    );
  });
});
