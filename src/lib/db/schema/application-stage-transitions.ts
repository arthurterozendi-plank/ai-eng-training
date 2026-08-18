import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { pipelineStages, type PipelineStageKey } from "./pipeline-stages";

/**
 * One row per stage move — the history AC 3 turns on, so time-in-stage is derivable with a
 * windowed query over `occurred_at`. `applications.stage`/`stage_changed_at` project the latest
 * row here rather than compete with it; `ON DELETE CASCADE` on `application_id` is safe because
 * `applications` itself is `RESTRICT`-protected from job/candidate deletion, so no such deletion
 * can ever reach these rows. See docs/specs/ai-34-domain-model.md §3.6.
 */
export const applicationStageTransitions = pgTable(
  "application_stage_transitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    fromStage: text("from_stage").$type<PipelineStageKey>(),
    toStage: text("to_stage").notNull().$type<PipelineStageKey>(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    changedBy: text("changed_by"),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "application_stage_transitions_application_id_fk",
      columns: [t.applicationId],
      foreignColumns: [applications.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "application_stage_transitions_from_stage_fk",
      columns: [t.fromStage],
      foreignColumns: [pipelineStages.key],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    foreignKey({
      name: "application_stage_transitions_to_stage_fk",
      columns: [t.toStage],
      foreignColumns: [pipelineStages.key],
    })
      .onDelete("restrict")
      .onUpdate("cascade"),
    check(
      "application_stage_transitions_from_to_distinct_check",
      sql`${t.fromStage} IS NULL OR ${t.fromStage} <> ${t.toStage}`,
    ),
    index("application_stage_transitions_application_id_occurred_at_idx").on(
      t.applicationId,
      t.occurredAt,
    ),
  ],
).enableRLS();

export type ApplicationStageTransition = typeof applicationStageTransitions.$inferSelect;
export type NewApplicationStageTransition = typeof applicationStageTransitions.$inferInsert;
