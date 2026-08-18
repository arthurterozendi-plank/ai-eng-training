import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { employmentType, jobStatus } from "./enums";

/**
 * A job posting a candidate can apply to. `description`/`requirements` are long-form
 * prose that doubles as part of the RAG corpus (Day 13).
 */
export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    department: text("department"),
    location: text("location").notNull(),
    employmentType: employmentType("employment_type").notNull().default("full_time"),
    status: jobStatus("status").notNull().default("open"),
    description: text("description").notNull(),
    requirements: text("requirements"),
    openedAt: timestamp("opened_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check(
      "jobs_closed_after_opened_check",
      sql`${t.closedAt} IS NULL OR ${t.closedAt} >= ${t.openedAt}`,
    ),
    index("jobs_status_idx").on(t.status),
  ],
).enableRLS();

/** A job row as read from the database. */
export type Job = typeof jobs.$inferSelect;
/**
 * The insert shape for a new job; only `title`, `location`, and `description` are
 * required — every other column has a default or is nullable.
 */
export type NewJob = typeof jobs.$inferInsert;
