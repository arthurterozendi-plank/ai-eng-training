import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DATABASE_TIMEOUT_MS } from "@/lib/database-timeout";
import { GET } from "@/app/api/candidates/[id]/route";
import type { CandidateResponse, ErrorResponse } from "@/app/api/candidates/[id]/schema";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

// The route imports `db` from `@talentscout/db/client`, which throws `EnvValidationError` at
// module load when `DATABASE_URL` is unset (as it is under Vitest). Mocking the module — with
// `vi.hoisted` so the factory does not close over a `const` before `vi.mock` is hoisted above
// it — is the only way to import the route statically.
vi.mock("@talentscout/db/client", () => ({
  db: { query: { candidates: { findFirst } } },
}));

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const JOB_ID = "22222222-2222-4222-8222-222222222222";
const APPLICATION_ID = "33333333-3333-4333-8333-333333333333";
const TRANSITION_ID_1 = "44444444-4444-4444-8444-444444444444";
const TRANSITION_ID_2 = "55555555-5555-4555-8555-555555555555";

// Deliberately carries `resumeText` and `changedBy` — fields the real query projection never
// returns — so the no-leak assertions have teeth against a future `...row` spread.
function buildCandidateRow(applications: unknown[] = [defaultApplication()]) {
  return {
    id: CANDIDATE_ID,
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+1-555-0100",
    location: "London, UK",
    headline: "Senior Backend Engineer",
    summary: "Builds distributed systems.",
    resumeText: "Full extracted resume body that must never reach the client.",
    yearsExperience: 12,
    linkedinUrl: "https://linkedin.com/in/ada",
    resumeUrl: "https://example.com/resume.pdf",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-05T00:00:00.000Z"),
    applications,
  };
}

function defaultApplication() {
  return {
    id: APPLICATION_ID,
    jobId: JOB_ID,
    stage: "screening",
    appliedAt: new Date("2026-01-02T00:00:00.000Z"),
    stageChangedAt: new Date("2026-01-03T00:00:00.000Z"),
    job: { id: JOB_ID, title: "Staff Engineer" },
    transitions: [
      {
        id: TRANSITION_ID_1,
        fromStage: null,
        toStage: "applied",
        occurredAt: new Date("2026-01-02T00:00:00.000Z"),
        reason: null,
        changedBy: "recruiter-1",
      },
      {
        id: TRANSITION_ID_2,
        fromStage: "applied",
        toStage: "screening",
        occurredAt: new Date("2026-01-03T00:00:00.000Z"),
        reason: "Recruiter screen passed",
        changedBy: "recruiter-1",
      },
    ],
  };
}

function candidateRequest(id: string) {
  return GET(new Request(`http://localhost/api/candidates/${id}`), {
    params: Promise.resolve({ id }),
  });
}

beforeEach(() => {
  findFirst.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("GET /api/candidates/[id]", () => {
  it("returns the candidate mapped to the wire shape with no-store caching", async () => {
    findFirst.mockResolvedValue(buildCandidateRow());

    const response = await candidateRequest(CANDIDATE_ID);

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as CandidateResponse;

    expect(body.candidate.id).toBe(CANDIDATE_ID);
    expect(body.candidate.fullName).toBe("Ada Lovelace");
    expect(typeof body.candidate.createdAt).toBe("string");
    expect(new Date(body.candidate.createdAt).toISOString()).toBe(body.candidate.createdAt);
    expect(new Date(body.candidate.updatedAt).toISOString()).toBe(body.candidate.updatedAt);

    const [application] = body.applications;
    expect(application.jobTitle).toBe("Staff Engineer");
    expect(new Date(application.appliedAt).toISOString()).toBe(application.appliedAt);
    expect(new Date(application.stageChangedAt).toISOString()).toBe(application.stageChangedAt);

    // Transitions come back in the order the mocked query returned them — the route maps,
    // it does not reorder.
    expect(application.transitions.map((t) => t.id)).toEqual([TRANSITION_ID_1, TRANSITION_ID_2]);
    for (const transition of application.transitions) {
      expect(new Date(transition.occurredAt).toISOString()).toBe(transition.occurredAt);
    }
  });

  it("returns an empty applications array for a candidate with no applications", async () => {
    findFirst.mockResolvedValue(buildCandidateRow([]));

    const response = await candidateRequest(CANDIDATE_ID);

    expect(response.status).toBe(200);

    const body = (await response.json()) as CandidateResponse;

    expect(body.applications).toEqual([]);
  });

  it("rejects a malformed id with 400 and never queries the database", async () => {
    const response = await candidateRequest("not-a-uuid");

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;

    expect(body.error).toBe("Invalid candidate id");
    expect(findFirst).not.toHaveBeenCalled();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns 404 for a well-formed id with no matching row", async () => {
    findFirst.mockResolvedValue(undefined);

    const response = await candidateRequest(CANDIDATE_ID);

    expect(response.status).toBe(404);

    const body = (await response.json()) as ErrorResponse;

    expect(body).toEqual({ error: "Candidate not found" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns a generic, uncached 500 whose correlation id matches the logged detail", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    findFirst.mockRejectedValue(new Error("connection terminated unexpectedly"));

    const response = await candidateRequest(CANDIDATE_ID);

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const rawBody = await response.text();
    const body = JSON.parse(rawBody) as ErrorResponse;

    expect(rawBody).not.toContain("connection terminated unexpectedly");
    expect(body).toEqual({ error: "Internal server error", correlationId: expect.any(String) });
    expect(body.correlationId).toMatch(UUID);

    expect(consoleError).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(consoleError.mock.calls[0][0] as string);

    expect(logged).toMatchObject({
      message: "GET /api/candidates/[id] failed",
      correlationId: body.correlationId,
      candidateId: CANDIDATE_ID,
      error: { message: "connection terminated unexpectedly" },
    });

    consoleError.mockRestore();
  });

  it("answers a slow database with a timeout instead of hanging", async () => {
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    findFirst.mockReturnValue(new Promise(() => {}));

    const pending = candidateRequest(CANDIDATE_ID);
    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS);
    const response = await pending;

    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as ErrorResponse;

    expect(body).toEqual({
      error: "Timed out loading candidate",
      correlationId: expect.any(String),
    });
    expect(JSON.parse(consoleError.mock.calls[0][0] as string)).toMatchObject({
      correlationId: body.correlationId,
      error: { name: "DatabaseTimeoutError" },
    });

    consoleError.mockRestore();
  });

  it("never includes resumeText or changedBy in a successful response", async () => {
    findFirst.mockResolvedValue(buildCandidateRow());

    const response = await candidateRequest(CANDIDATE_ID);
    const body = (await response.json()) as CandidateResponse;

    expect(body.candidate).not.toHaveProperty("resumeText");
    for (const application of body.applications) {
      for (const transition of application.transitions) {
        expect(transition).not.toHaveProperty("changedBy");
      }
    }
  });
});
