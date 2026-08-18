import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

import type { ExtractionPayload } from "@/lib/db/extraction";

import { candidates } from "./candidates";
import { applicationSource } from "./enums";
import { jobs } from "./jobs";
import { pipelineStages, type PipelineStageKey } from "./pipeline-stages";

/**
 * A candidate's pipeline record for one job. AC 2's "exactly one job and one candidate,
 * enforced by the schema" is the two `NOT NULL` scalar foreign keys below, not a nullable pair
 * or a polymorphic `entity_type`/`entity_id`. `stage` mirrors the latest row in
 * `application_stage_transitions` rather than competing with it — see
 * docs/specs/ai-34-domain-model.md §3.5 and §3.6.
 */
export const applications = pgTable(
  "applications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").notNull(),
    candidateId: uuid("candidate_id").notNull(),
    stage: text("stage").notNull().$type<PipelineStageKey>(),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    source: applicationSource("source").notNull().default("careers_site"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).notNull().defaultNow(),
    coverLetter: text("cover_letter"),
    extraction: jsonb("extraction").$type<ExtractionPayload>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "applications_job_id_fk",
      columns: [t.jobId],
      foreignColumns: [jobs.id],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    foreignKey({
      name: "applications_candidate_id_fk",
      columns: [t.candidateId],
      foreignColumns: [candidates.id],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    foreignKey({
      name: "applications_stage_fk",
      columns: [t.stage],
      foreignColumns: [pipelineStages.key],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    unique("applications_job_id_candidate_id_key").on(t.jobId, t.candidateId),
    check(
      "applications_extraction_envelope_check",
      sql`${t.extraction} IS NULL OR (jsonb_typeof(${t.extraction}) = 'object' AND jsonb_exists(${t.extraction}, 'schemaVersion') AND jsonb_exists(${t.extraction}, 'fields'))`,
    ),
    index("applications_candidate_id_idx").on(t.candidateId),
    index("applications_stage_idx").on(t.stage),
    index("applications_applied_at_idx").on(t.appliedAt),
    index("applications_extraction_gin_idx").using("gin", t.extraction),
  ],
).enableRLS();

/** An application row as read from the database. */
export type Application = typeof applications.$inferSelect;
/**
 * The insert shape for a new application; only `jobId`, `candidateId`, and `stage` are
 * required — every other column has a default or is nullable.
 */
export type NewApplication = typeof applications.$inferInsert;
