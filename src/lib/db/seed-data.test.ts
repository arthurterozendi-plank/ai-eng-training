import { createInsertSchema } from "drizzle-zod";
import { describe, expect, it } from "vitest";

import { extractionPayloadSchema } from "@/lib/db/extraction";
import { applicationStageTransitions } from "@/lib/db/schema/application-stage-transitions";
import { applications } from "@/lib/db/schema/applications";
import { candidates } from "@/lib/db/schema/candidates";
import { interviews } from "@/lib/db/schema/interviews";
import { jobs } from "@/lib/db/schema/jobs";
import { notes } from "@/lib/db/schema/notes";
import { PIPELINE_STAGE_SEED, type PipelineStageKey } from "@/lib/db/schema/pipeline-stages";
import { buildSeedDataset, type SeedDataset } from "@/lib/db/seed-data";
import { COVER_LETTER_ASSIGNMENTS } from "@/lib/db/seed-data-content";

const NOW = new Date("2026-08-18T12:00:00.000Z");

/** Built once per test file — `buildSeedDataset` is pure, so every `it` shares this instance. */
const dataset: SeedDataset = buildSeedDataset({ now: NOW });

/**
 * Every transition for one application, sorted earliest first. `application.id` and
 * `occurredAt` are typed as optional because both columns carry a database default — but the
 * builder always sets them explicitly, which is exactly what the FK-closure and chaining tests
 * below verify, so asserting non-null here is safe rather than circular.
 */
function transitionsFor(dataset: SeedDataset, applicationId: string | undefined) {
  return dataset.stageTransitions
    .filter((t) => t.applicationId === applicationId)
    .sort((a, b) => a.occurredAt!.getTime() - b.occurredAt!.getTime());
}

const NON_TERMINAL_STAGES_BY_POSITION = PIPELINE_STAGE_SEED.filter(
  (stage) => !stage.isTerminal,
).sort((a, b) => a.position - b.position);
const TERMINAL_STAGE_KEYS = PIPELINE_STAGE_SEED.filter((stage) => stage.isTerminal).map(
  (stage) => stage.key,
);
const VALID_STAGE_KEYS = new Set(PIPELINE_STAGE_SEED.map((stage) => stage.key));

describe("buildSeedDataset — row counts", () => {
  it("produces roughly the targets from docs/specs/ai-34-domain-model.md §5 slice 7", () => {
    expect(dataset.jobs.length).toBe(8);
    expect(dataset.candidates.length).toBe(60);
    expect(dataset.applications.length).toBe(90);
    expect(dataset.interviews.length).toBeGreaterThanOrEqual(35);
    expect(dataset.interviews.length).toBeLessThanOrEqual(45);
    expect(dataset.notes.length).toBeGreaterThanOrEqual(100);
    expect(dataset.notes.length).toBeLessThanOrEqual(140);
  });

  it("populates extraction on about twelve applications", () => {
    const withExtraction = dataset.applications.filter(
      (application) => application.extraction != null,
    );
    expect(withExtraction.length).toBe(12);
  });
});

describe("buildSeedDataset — DoD 1: FK closure", () => {
  it("every application references a job and a candidate in the dataset", () => {
    const jobIds = new Set(dataset.jobs.map((job) => job.id));
    const candidateIds = new Set(dataset.candidates.map((candidate) => candidate.id));

    for (const application of dataset.applications) {
      expect(jobIds.has(application.jobId)).toBe(true);
      expect(candidateIds.has(application.candidateId)).toBe(true);
    }
  });

  it("every stage transition references an application in the dataset", () => {
    const applicationIds = new Set(dataset.applications.map((application) => application.id));

    for (const transition of dataset.stageTransitions) {
      expect(applicationIds.has(transition.applicationId)).toBe(true);
    }
  });

  it("every interview references an application in the dataset", () => {
    const applicationIds = new Set(dataset.applications.map((application) => application.id));

    for (const interview of dataset.interviews) {
      expect(applicationIds.has(interview.applicationId)).toBe(true);
    }
  });

  it("every note references exactly one job, candidate, or application in the dataset", () => {
    const jobIds = new Set(dataset.jobs.map((job) => job.id));
    const candidateIds = new Set(dataset.candidates.map((candidate) => candidate.id));
    const applicationIds = new Set(dataset.applications.map((application) => application.id));

    for (const note of dataset.notes) {
      const parents = [note.jobId, note.candidateId, note.applicationId].filter(
        (value): value is string => value != null,
      );
      expect(parents).toHaveLength(1);

      const [parentId] = parents;
      const resolves =
        jobIds.has(parentId) || candidateIds.has(parentId) || applicationIds.has(parentId);
      expect(resolves).toBe(true);
    }
  });

  it("the (job_id, candidate_id) pair is unique across applications", () => {
    const pairs = new Set<string>();
    for (const application of dataset.applications) {
      const key = `${application.jobId}:${application.candidateId}`;
      expect(pairs.has(key)).toBe(false);
      pairs.add(key);
    }
  });
});

describe("buildSeedDataset — DoD 2: applications.stage matches the latest transition", () => {
  it("every application's stage and stage_changed_at equal its latest transition", () => {
    for (const application of dataset.applications) {
      const history = transitionsFor(dataset, application.id);
      const latest = history[history.length - 1];

      expect(VALID_STAGE_KEYS.has(application.stage)).toBe(true);
      expect(application.stage).toBe(latest.toStage);
      expect(application.stageChangedAt).toEqual(latest.occurredAt);
    }
  });
});

describe("buildSeedDataset — DoD 3: transitions chain and strictly increase in time", () => {
  it("every application's history starts from null and chains from_stage to the prior to_stage", () => {
    for (const application of dataset.applications) {
      const history = transitionsFor(dataset, application.id);
      expect(history.length).toBeGreaterThanOrEqual(1);
      expect(history[0].fromStage).toBeNull();

      for (let i = 1; i < history.length; i++) {
        expect(history[i].fromStage).toBe(history[i - 1].toStage);
      }
    }
  });

  it("every application's history strictly increases in time and never reaches into the future", () => {
    for (const application of dataset.applications) {
      const history = transitionsFor(dataset, application.id);

      for (let i = 1; i < history.length; i++) {
        expect(history[i].occurredAt!.getTime()).toBeGreaterThan(
          history[i - 1].occurredAt!.getTime(),
        );
      }
      for (const transition of history) {
        expect(transition.occurredAt!.getTime()).toBeLessThanOrEqual(NOW.getTime());
      }
    }
  });
});

describe("buildSeedDataset — DoD 4: funnel reach is non-increasing across non-terminal stages", () => {
  it("counts strictly more applications reaching each earlier non-terminal stage than each later one", () => {
    const reach = new Map<PipelineStageKey, Set<string>>();
    for (const transition of dataset.stageTransitions) {
      const set = reach.get(transition.toStage) ?? new Set<string>();
      set.add(transition.applicationId);
      reach.set(transition.toStage, set);
    }

    const counts = NON_TERMINAL_STAGES_BY_POSITION.map((stage) => reach.get(stage.key)?.size ?? 0);
    expect(counts.every((count) => count > 0)).toBe(true);

    for (let i = 1; i < counts.length; i++) {
      expect(counts[i]).toBeLessThanOrEqual(counts[i - 1]);
    }
  });

  it("does not require the same monotonicity across terminal stages (rejected can exceed hired)", () => {
    const reach = new Map<PipelineStageKey, Set<string>>();
    for (const transition of dataset.stageTransitions) {
      const set = reach.get(transition.toStage) ?? new Set<string>();
      set.add(transition.applicationId);
      reach.set(transition.toStage, set);
    }

    const hiredReach = reach.get("hired")?.size ?? 0;
    const rejectedReach = reach.get("rejected")?.size ?? 0;
    expect(rejectedReach).toBeGreaterThan(hiredReach);
  });
});

describe("buildSeedDataset — DoD 5: every stage is occupied", () => {
  it("every non-terminal stage has at least one application currently in it", () => {
    for (const stage of NON_TERMINAL_STAGES_BY_POSITION) {
      const count = dataset.applications.filter(
        (application) => application.stage === stage.key,
      ).length;
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  it("every terminal stage holds at least one application", () => {
    for (const stageKey of TERMINAL_STAGE_KEYS) {
      const count = dataset.applications.filter(
        (application) => application.stage === stageKey,
      ).length;
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("buildSeedDataset — DoD 6: extraction payloads", () => {
  /** Mirrors the database check `applications_extraction_envelope_check` in JS. */
  function satisfiesEnvelopePredicate(value: unknown): boolean {
    return (
      typeof value === "object" &&
      value !== null &&
      !Array.isArray(value) &&
      "schemaVersion" in value &&
      "fields" in value
    );
  }

  it("every non-null extraction payload parses against extractionPayloadSchema and the envelope predicate", () => {
    const withExtraction = dataset.applications.filter(
      (application) => application.extraction != null,
    );
    expect(withExtraction.length).toBeGreaterThan(0);

    for (const application of withExtraction) {
      expect(satisfiesEnvelopePredicate(application.extraction)).toBe(true);
      const result = extractionPayloadSchema.safeParse(application.extraction);
      expect(result.success).toBe(true);
    }
  });

  it("has at least one field below and one field at or above a 0.6 confidence threshold", () => {
    const confidences: number[] = [];
    for (const application of dataset.applications) {
      if (!application.extraction) continue;
      for (const field of Object.values(application.extraction.fields)) {
        confidences.push(field.confidence);
      }
    }

    expect(confidences.some((confidence) => confidence < 0.6)).toBe(true);
    expect(confidences.some((confidence) => confidence >= 0.6)).toBe(true);
  });

  it("has at least one payload where every field is high-confidence", () => {
    const allHighConfidence = dataset.applications.some(
      (application) =>
        application.extraction != null &&
        Object.values(application.extraction.fields).every((field) => field.confidence >= 0.85),
    );
    expect(allHighConfidence).toBe(true);
  });

  it("has at least one payload whose lowest field confidence is below 0.6", () => {
    const hasLowConfidencePayload = dataset.applications.some((application) => {
      if (!application.extraction) return false;
      const values = Object.values(application.extraction.fields).map((field) => field.confidence);
      return Math.min(...values) < 0.6;
    });
    expect(hasLowConfidencePayload).toBe(true);
  });
});

describe("buildSeedDataset — DoD 7: interview/stage coherence", () => {
  it("anchors phone_screen to screening and every other kind to interview", () => {
    for (const interview of dataset.interviews) {
      const history = transitionsFor(dataset, interview.applicationId).map((t) => t.toStage);
      const anchorStage: PipelineStageKey =
        interview.kind === "phone_screen" ? "screening" : "interview";

      expect(history).toContain(anchorStage);
    }
  });

  it("schedules every interview at or after the application entered its anchor stage", () => {
    for (const interview of dataset.interviews) {
      const history = transitionsFor(dataset, interview.applicationId);
      const anchorStage: PipelineStageKey =
        interview.kind === "phone_screen" ? "screening" : "interview";
      const anchorTransition = history.find((t) => t.toStage === anchorStage);

      expect(anchorTransition).toBeDefined();
      expect(interview.scheduledAt.getTime()).toBeGreaterThanOrEqual(
        anchorTransition!.occurredAt!.getTime(),
      );
    }
  });

  it("never gives an application still sitting in applied a completed onsite", () => {
    const applicationsById = new Map(
      dataset.applications.map((application) => [application.id, application]),
    );

    for (const interview of dataset.interviews) {
      if (interview.kind !== "onsite") continue;
      const application = applicationsById.get(interview.applicationId);
      expect(application?.stage).not.toBe("applied");
    }
  });

  it("never schedules an interview after its application's own terminal transition", () => {
    const applicationsById = new Map(
      dataset.applications.map((application) => [application.id, application]),
    );

    for (const interview of dataset.interviews) {
      const application = applicationsById.get(interview.applicationId);
      expect(application).toBeDefined();
      if (!TERMINAL_STAGE_KEYS.some((stage) => stage === application!.stage)) continue;

      // `stageChangedAt` is asserted elsewhere to equal the latest transition's `occurredAt` —
      // this is the terminal transition itself once `application.stage` is terminal.
      expect(interview.scheduledAt.getTime()).toBeLessThanOrEqual(
        application!.stageChangedAt!.getTime(),
      );
    }
  });
});

describe("buildSeedDataset — DoD 8: applications never predate their job", () => {
  it("every application's applied_at is at or after its job's opened_at", () => {
    const jobsById = new Map(dataset.jobs.map((job) => [job.id, job]));

    for (const application of dataset.applications) {
      const job = jobsById.get(application.jobId);
      expect(job).toBeDefined();
      expect(application.appliedAt!.getTime()).toBeGreaterThanOrEqual(job!.openedAt!.getTime());
    }
  });
});

describe("buildSeedDataset — DoD 9: closed/filled jobs close out their pipeline", () => {
  it("every transition on a closed or filled job's applications lands at or before closed_at", () => {
    const closedJobIds = new Map(
      dataset.jobs.filter((job) => job.closedAt != null).map((job) => [job.id!, job.closedAt!]),
    );
    expect(closedJobIds.size).toBeGreaterThan(0);

    const applicationsById = new Map(
      dataset.applications.map((application) => [application.id, application]),
    );

    for (const transition of dataset.stageTransitions) {
      const application = applicationsById.get(transition.applicationId);
      const closedAt = application ? closedJobIds.get(application.jobId) : undefined;
      if (!closedAt) continue;

      expect(transition.occurredAt!.getTime()).toBeLessThanOrEqual(closedAt.getTime());
    }
  });

  it("drives every application on a closed or filled job to a terminal stage", () => {
    const closedJobIds = new Set(
      dataset.jobs.filter((job) => job.closedAt != null).map((job) => job.id),
    );

    const affected = dataset.applications.filter((application) =>
      closedJobIds.has(application.jobId),
    );
    expect(affected.length).toBeGreaterThan(0);

    for (const application of affected) {
      expect(TERMINAL_STAGE_KEYS).toContain(application.stage);
    }
  });
});

describe("buildSeedDataset — DoD 10: cover letters on the intended subset only", () => {
  it("populates cover_letter on exactly the assigned (candidate, job) pairs", () => {
    expect(COVER_LETTER_ASSIGNMENTS.length).toBeGreaterThan(0);

    const candidatesById = new Map(
      dataset.candidates.map((candidate, index) => [candidate.id, index]),
    );
    const jobsById = new Map(dataset.jobs.map((job, index) => [job.id, index]));
    const assignedPairs = new Set(
      COVER_LETTER_ASSIGNMENTS.map((a) => `${a.candidateIndex}:${a.jobIndex}`),
    );

    const withCoverLetter = dataset.applications.filter(
      (application) => application.coverLetter != null,
    );
    expect(withCoverLetter.length).toBe(COVER_LETTER_ASSIGNMENTS.length);

    for (const application of dataset.applications) {
      const pairKey = `${candidatesById.get(application.candidateId)}:${jobsById.get(application.jobId)}`;
      if (assignedPairs.has(pairKey)) {
        expect(application.coverLetter).not.toBeNull();
        expect(application.coverLetter!.length).toBeGreaterThan(0);
      } else {
        expect(application.coverLetter).toBeNull();
      }
    }
  });
});

describe("buildSeedDataset — DoD 12: every row parses against createInsertSchema", () => {
  it("jobs", () => {
    const schema = createInsertSchema(jobs);
    for (const row of dataset.jobs) {
      expect(schema.safeParse(row).success).toBe(true);
    }
  });

  it("candidates", () => {
    const schema = createInsertSchema(candidates);
    for (const row of dataset.candidates) {
      expect(schema.safeParse(row).success).toBe(true);
    }
  });

  it("applications", () => {
    const schema = createInsertSchema(applications);
    for (const row of dataset.applications) {
      expect(schema.safeParse(row).success).toBe(true);
    }
  });

  it("application_stage_transitions", () => {
    const schema = createInsertSchema(applicationStageTransitions);
    for (const row of dataset.stageTransitions) {
      expect(schema.safeParse(row).success).toBe(true);
    }
  });

  it("interviews", () => {
    const schema = createInsertSchema(interviews);
    for (const row of dataset.interviews) {
      expect(schema.safeParse(row).success).toBe(true);
    }
  });

  it("notes", () => {
    const schema = createInsertSchema(notes);
    for (const row of dataset.notes) {
      expect(schema.safeParse(row).success).toBe(true);
    }
  });
});

describe("buildSeedDataset — DoD 13: candidate emails are unique and lowercase", () => {
  it("every email is its own lowercase form", () => {
    for (const candidate of dataset.candidates) {
      expect(candidate.email).toBe(candidate.email.toLowerCase());
    }
  });

  it("no two candidates share an email", () => {
    const emails = new Set<string>();
    for (const candidate of dataset.candidates) {
      expect(emails.has(candidate.email)).toBe(false);
      emails.add(candidate.email);
    }
  });
});

describe("buildSeedDataset — DoD 14: prose volume", () => {
  it("exceeds 50,000 characters across descriptions, resumes, feedback, and notes", () => {
    let characters = 0;

    for (const job of dataset.jobs) {
      characters += job.description.length + (job.requirements?.length ?? 0);
    }
    for (const candidate of dataset.candidates) {
      characters += (candidate.resumeText?.length ?? 0) + (candidate.summary?.length ?? 0);
    }
    for (const interview of dataset.interviews) {
      characters += interview.feedback?.length ?? 0;
    }
    for (const note of dataset.notes) {
      characters += note.body.length;
    }

    expect(characters).toBeGreaterThan(50_000);
  });
});

describe("buildSeedDataset — DoD 15: determinism", () => {
  it("returns a deep-equal dataset when called twice with the same now", () => {
    const again = buildSeedDataset({ now: NOW });
    expect(again).toEqual(dataset);
  });

  it("produces no I/O side channel: every date in the dataset is derived from the same now", () => {
    const otherNow = new Date("2020-01-01T00:00:00.000Z");
    const otherDataset = buildSeedDataset({ now: otherNow });

    expect(otherDataset.jobs[0].openedAt!.getTime()).toBeLessThan(
      dataset.jobs[0].openedAt!.getTime(),
    );
    expect(otherDataset.jobs.length).toBe(dataset.jobs.length);
  });
});
