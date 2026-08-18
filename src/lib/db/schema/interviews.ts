import { sql } from "drizzle-orm";
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { applications } from "./applications";
import { interviewKind, interviewRecommendation, interviewStatus } from "./enums";

/**
 * One round of an application's interview loop. Hangs off the application rather than the
 * candidate — the same person interviewing for two roles has two independent loops. See
 * docs/specs/ai-34-domain-model.md §3.7.
 */
export const interviews = pgTable(
  "interviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    applicationId: uuid("application_id").notNull(),
    kind: interviewKind("kind").notNull(),
    status: interviewStatus("status").notNull().default("scheduled"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull().default(45),
    interviewerName: text("interviewer_name").notNull(),
    location: text("location"),
    recommendation: interviewRecommendation("recommendation"),
    feedback: text("feedback"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      name: "interviews_application_id_fk",
      columns: [t.applicationId],
      foreignColumns: [applications.id],
    }).onDelete("cascade"),
    check("interviews_duration_minutes_positive_check", sql`${t.durationMinutes} > 0`),
    index("interviews_application_id_scheduled_at_idx").on(t.applicationId, t.scheduledAt),
  ],
).enableRLS();

export type Interview = typeof interviews.$inferSelect;
export type NewInterview = typeof interviews.$inferInsert;
