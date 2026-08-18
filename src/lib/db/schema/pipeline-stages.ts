import { boolean, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The ordered set of pipeline stages, seeded by the custom migration (slice 6) and the
 * single source of truth `PipelineStageKey` is derived from. Reordering this list has no
 * effect on the database — it only exists once as SQL, written by hand from these values.
 */
export const PIPELINE_STAGE_SEED = [
  { key: "applied", label: "Applied", position: 1, isTerminal: false },
  { key: "screening", label: "Screening", position: 2, isTerminal: false },
  { key: "interview", label: "Interview", position: 3, isTerminal: false },
  { key: "offer", label: "Offer", position: 4, isTerminal: false },
  { key: "hired", label: "Hired", position: 5, isTerminal: true },
  { key: "rejected", label: "Rejected", position: 6, isTerminal: true },
  { key: "withdrawn", label: "Withdrawn", position: 7, isTerminal: true },
] as const;

/** A pipeline stage's stable machine identifier, derived from `PIPELINE_STAGE_SEED`. */
export type PipelineStageKey = (typeof PIPELINE_STAGE_SEED)[number]["key"];

/**
 * The ordered, recruiter-renameable lookup table an application's `stage` references. A
 * table rather than a pg enum because `position` and `label` must be queryable data (Day
 * 9's funnel chart) and because reordering or renaming a stage must not require an
 * `ALTER TYPE`, which cannot run inside a transaction. See
 * docs/specs/ai-34-domain-model.md §3.2.
 *
 * `position` uniqueness is deliberately not declared here: a plain unique constraint
 * cannot be deferred, so swapping two stages' positions in one `UPDATE` would fail
 * mid-statement. That constraint is instead written by hand, as `DEFERRABLE INITIALLY
 * IMMEDIATE`, in slice 6's custom migration.
 */
export const pipelineStages = pgTable("pipeline_stages", {
  key: text("key").primaryKey(),
  label: text("label").notNull(),
  position: integer("position").notNull(),
  isTerminal: boolean("is_terminal").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}).enableRLS();

export type PipelineStage = typeof pipelineStages.$inferSelect;
export type NewPipelineStage = typeof pipelineStages.$inferInsert;
