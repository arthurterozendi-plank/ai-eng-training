import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { candidates } from "./candidates";
import { jobs } from "./jobs";

/**
 * A free-text note attached to exactly one of a job, a candidate or an application. Explicit
 * nullable foreign keys rather than a polymorphic `entity_type`/`entity_id` pair, so a note can
 * never orphan and the `num_nonnulls` check makes "attached to exactly one thing"
 * schema-enforced. `CASCADE` on every FK, unlike `applications`' `RESTRICT`: a note about a
 * removed parent is noise, not lost history. See docs/specs/ai-34-domain-model.md §3.8.
 */
export const notes = pgTable(
  "notes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id"),
    candidateId: uuid("candidate_id"),
    applicationId: uuid("application_id"),
    body: text("body").notNull(),
    author: text("author").notNull(),
    pinned: boolean("pinned").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "notes_job_id_fk",
      columns: [t.jobId],
      foreignColumns: [jobs.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notes_candidate_id_fk",
      columns: [t.candidateId],
      foreignColumns: [candidates.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "notes_application_id_fk",
      columns: [t.applicationId],
      foreignColumns: [applications.id],
    }).onDelete("cascade"),
    check(
      "notes_exactly_one_parent_check",
      sql`num_nonnulls(${t.jobId}, ${t.candidateId}, ${t.applicationId}) = 1`,
    ),
    index("notes_job_id_idx").on(t.jobId),
    index("notes_candidate_id_idx").on(t.candidateId),
    index("notes_application_id_idx").on(t.applicationId),
  ],
).enableRLS();

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;
