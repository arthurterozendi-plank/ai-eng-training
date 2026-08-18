import { relations } from "drizzle-orm";

import { applicationStageTransitions } from "./application-stage-transitions";
import { applications } from "./applications";
import { candidates } from "./candidates";
import { interviews } from "./interviews";
import { jobs } from "./jobs";
import { notes } from "./notes";

/**
 * `relations()` declarations for every association named in
 * docs/specs/ai-34-domain-model.md §3.9 — `jobs ↔ applications`, `candidates ↔ applications`,
 * `applications ↔ interviews / notes / transitions`, and `notes → job | candidate |
 * application`. Declarative only: no runtime cost, no extra tables, no query runs here. They
 * exist so AI-43 and AI-63 can write `db.query.<table>.findMany({ with: … })` instead of
 * hand-rolled joins.
 *
 * Collected in one module rather than beside each table: a `relations()` call needs the
 * referenced table as a *value* at import time, and the FK graph here is not a DAG —
 * `applications` is referenced by `jobs`/`candidates`/`interviews`/`notes`/
 * `applicationStageTransitions` and references them back. Splitting these across the table
 * files would put each pair in a two-way value-import cycle; this module is the only thing that
 * depends on all six table modules, so none of them import it back.
 */
export const jobsRelations = relations(jobs, ({ many }) => ({
  applications: many(applications),
}));

export const candidatesRelations = relations(candidates, ({ many }) => ({
  applications: many(applications),
}));

export const applicationsRelations = relations(applications, ({ one, many }) => ({
  job: one(jobs, { fields: [applications.jobId], references: [jobs.id] }),
  candidate: one(candidates, {
    fields: [applications.candidateId],
    references: [candidates.id],
  }),
  interviews: many(interviews),
  notes: many(notes),
  transitions: many(applicationStageTransitions),
}));

export const interviewsRelations = relations(interviews, ({ one }) => ({
  application: one(applications, {
    fields: [interviews.applicationId],
    references: [applications.id],
  }),
}));

export const notesRelations = relations(notes, ({ one }) => ({
  job: one(jobs, { fields: [notes.jobId], references: [jobs.id] }),
  candidate: one(candidates, { fields: [notes.candidateId], references: [candidates.id] }),
  application: one(applications, {
    fields: [notes.applicationId],
    references: [applications.id],
  }),
}));

export const applicationStageTransitionsRelations = relations(
  applicationStageTransitions,
  ({ one }) => ({
    application: one(applications, {
      fields: [applicationStageTransitions.applicationId],
      references: [applications.id],
    }),
  }),
);
