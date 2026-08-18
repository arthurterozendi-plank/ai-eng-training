import { pgEnum } from "drizzle-orm/pg-core";

/**
 * Lifecycle status of a job posting. Closed by product logic — a recruiter cannot add a
 * status — so it is a pg enum rather than a lookup table (contrast `pipeline_stages`).
 */
export const jobStatus = pgEnum("job_status", ["draft", "open", "paused", "closed", "filled"]);

/** How a job is staffed. */
export const employmentType = pgEnum("employment_type", [
  "full_time",
  "part_time",
  "contract",
  "internship",
]);

/** Where an application originated. */
export const applicationSource = pgEnum("application_source", [
  "careers_site",
  "referral",
  "linkedin",
  "job_board",
  "agency",
  "email",
  "import",
]);

/** The kind of interview in a loop. */
export const interviewKind = pgEnum("interview_kind", [
  "phone_screen",
  "technical",
  "onsite",
  "final",
]);

/** Scheduling status of an interview. */
export const interviewStatus = pgEnum("interview_status", [
  "scheduled",
  "completed",
  "cancelled",
  "no_show",
]);

/** An interviewer's recommendation after a completed interview. */
export const interviewRecommendation = pgEnum("interview_recommendation", [
  "strong_no",
  "no",
  "yes",
  "strong_yes",
]);
