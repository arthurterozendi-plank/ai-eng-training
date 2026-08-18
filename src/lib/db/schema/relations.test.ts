import {
  createTableRelationsHelpers,
  extractTablesRelationalConfig,
  Many,
  One,
  type ExtractTablesWithRelations,
} from "drizzle-orm";
import { describe, expect, expectTypeOf, it } from "vitest";

import { applicationStageTransitions } from "@/lib/db/schema/application-stage-transitions";
import { applications } from "@/lib/db/schema/applications";
import { candidates } from "@/lib/db/schema/candidates";
import { interviews } from "@/lib/db/schema/interviews";
import { jobs } from "@/lib/db/schema/jobs";
import { notes } from "@/lib/db/schema/notes";
import {
  applicationsRelations,
  applicationStageTransitionsRelations,
  candidatesRelations,
  interviewsRelations,
  jobsRelations,
  notesRelations,
} from "@/lib/db/schema/relations";

/**
 * The same table-plus-relations map `drizzle(client, { schema })` would take in AI-43. Building
 * it is pure — `extractTablesRelationalConfig` below never opens a connection — so this proves
 * every relation resolves without a database, per docs/specs/ai-34-domain-model.md slice 5.
 */
const schema = {
  jobs,
  candidates,
  applications,
  interviews,
  notes,
  applicationStageTransitions,
  jobsRelations,
  candidatesRelations,
  applicationsRelations,
  interviewsRelations,
  notesRelations,
  applicationStageTransitionsRelations,
};

type Tables = ExtractTablesWithRelations<typeof schema>;
type ApplicationRelations = Tables["applications"]["relations"];
type NoteRelations = Tables["notes"]["relations"];

describe("schema relations resolve at the type level", () => {
  it("types applications.job/candidate/interviews/notes/transitions against their tables", () => {
    expectTypeOf<ApplicationRelations["job"]>().toExtend<One<"jobs", boolean>>();
    expectTypeOf<ApplicationRelations["candidate"]>().toExtend<One<"candidates", boolean>>();
    expectTypeOf<ApplicationRelations["interviews"]>().toExtend<Many<"interviews">>();
    expectTypeOf<ApplicationRelations["notes"]>().toExtend<Many<"notes">>();
    expectTypeOf<ApplicationRelations["transitions"]>().toExtend<
      Many<"application_stage_transitions">
    >();
  });

  it("types the notes relations back to job, candidate and application", () => {
    expectTypeOf<NoteRelations["job"]>().toExtend<One<"jobs", boolean>>();
    expectTypeOf<NoteRelations["candidate"]>().toExtend<One<"candidates", boolean>>();
    expectTypeOf<NoteRelations["application"]>().toExtend<One<"applications", boolean>>();
  });
});

describe("schema relations resolve at runtime, with no database connection", () => {
  const { tables } = extractTablesRelationalConfig(schema, createTableRelationsHelpers);

  it("wires applications to its job, candidate, interviews, notes and transitions", () => {
    const applicationRelations = tables.applications.relations;

    expect(applicationRelations.job).toBeInstanceOf(One);
    expect(applicationRelations.job.referencedTableName).toBe("jobs");
    expect(applicationRelations.candidate).toBeInstanceOf(One);
    expect(applicationRelations.candidate.referencedTableName).toBe("candidates");
    expect(applicationRelations.interviews).toBeInstanceOf(Many);
    expect(applicationRelations.interviews.referencedTableName).toBe("interviews");
    expect(applicationRelations.notes).toBeInstanceOf(Many);
    expect(applicationRelations.notes.referencedTableName).toBe("notes");
    expect(applicationRelations.transitions).toBeInstanceOf(Many);
    expect(applicationRelations.transitions.referencedTableName).toBe(
      "application_stage_transitions",
    );
  });

  it("wires notes back to exactly the job, candidate or application it is attached to", () => {
    const noteRelations = tables.notes.relations;

    expect(noteRelations.job).toBeInstanceOf(One);
    expect(noteRelations.job.referencedTableName).toBe("jobs");
    expect(noteRelations.candidate).toBeInstanceOf(One);
    expect(noteRelations.candidate.referencedTableName).toBe("candidates");
    expect(noteRelations.application).toBeInstanceOf(One);
    expect(noteRelations.application.referencedTableName).toBe("applications");
  });

  it("wires the reverse relations on jobs, candidates, interviews and transitions", () => {
    expect(tables.jobs.relations.applications).toBeInstanceOf(Many);
    expect(tables.candidates.relations.applications).toBeInstanceOf(Many);
    expect(tables.interviews.relations.application).toBeInstanceOf(One);
    expect(tables.applicationStageTransitions.relations.application).toBeInstanceOf(One);
  });
});
