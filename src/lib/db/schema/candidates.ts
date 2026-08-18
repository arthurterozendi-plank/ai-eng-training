import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * A candidate who may apply to one or more jobs. `resume_text` is the extracted resume
 * body — the bulk of the RAG corpus (Day 13) and AI-107's write target. The lowercase
 * check plus the plain unique constraint on `email` give case-insensitive uniqueness
 * without the `citext` extension, and a stable upsert target for AI-107.
 */
export const candidates = pgTable(
  "candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fullName: text("full_name").notNull(),
    email: text("email").notNull().unique(),
    phone: text("phone"),
    location: text("location"),
    headline: text("headline"),
    summary: text("summary"),
    resumeText: text("resume_text"),
    resumeUrl: text("resume_url"),
    linkedinUrl: text("linkedin_url"),
    yearsExperience: integer("years_experience"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("candidates_email_lowercase_check", sql`${t.email} = lower(${t.email})`),
    check(
      "candidates_years_experience_range_check",
      sql`${t.yearsExperience} IS NULL OR (${t.yearsExperience} BETWEEN 0 AND 60)`,
    ),
  ],
).enableRLS();

export type Candidate = typeof candidates.$inferSelect;
export type NewCandidate = typeof candidates.$inferInsert;
