import { beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "@/app/api/jobs/route";
import type { JobsResponseBody } from "@/app/api/jobs/schema";

// `vi.hoisted` is required, not stylistic: `vi.mock`'s factory is hoisted above every `const` in
// this file, so a plainly-declared spy would still be in its temporal dead zone when it runs.
const { findManyJobs, findManyPipelineStages } = vi.hoisted(() => ({
  findManyJobs: vi.fn(),
  findManyPipelineStages: vi.fn(),
}));

vi.mock("@talentscout/db/client", () => ({
  db: {
    query: {
      jobs: { findMany: findManyJobs },
      pipelineStages: { findMany: findManyPipelineStages },
    },
  },
}));

const STAGES = [
  { key: "applied", label: "Applied", isTerminal: false },
  { key: "screening", label: "Screening", isTerminal: false },
  { key: "hired", label: "Hired", isTerminal: true },
];

const BACKEND_ROLE = {
  id: "0f8c1f2e-0f5f-4a6d-9a5f-8f4f4b1f0001",
  title: "Senior Backend Engineer",
  location: "Remote (US)",
  department: "Engineering",
  applications: [{ stage: "applied" }, { stage: "applied" }, { stage: "hired" }],
};

function request(search = ""): Request {
  return new Request(`http://localhost:3000/api/jobs${search}`);
}

/** The options object the handler passed to `db.query.jobs.findMany`. */
function jobsQuery(): {
  limit: number;
  where: (fields: unknown, operators: unknown) => unknown;
  orderBy: (fields: unknown, operators: unknown) => unknown;
} {
  return findManyJobs.mock.calls[0][0];
}

describe("GET /api/jobs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    findManyPipelineStages.mockResolvedValue(STAGES);
    findManyJobs.mockResolvedValue([BACKEND_ROLE]);
  });

  it("returns each open role with a count for every pipeline stage", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as JobsResponseBody;

    expect(body.jobs).toHaveLength(1);
    expect(body.jobs[0]).toMatchObject({
      title: "Senior Backend Engineer",
      location: "Remote (US)",
      department: "Engineering",
    });
    expect(body.jobs[0].stageCounts).toEqual([
      { key: "applied", label: "Applied", isTerminal: false, count: 2 },
      { key: "screening", label: "Screening", isTerminal: false, count: 0 },
      { key: "hired", label: "Hired", isTerminal: true, count: 1 },
    ]);
  });

  it("asks the database for open roles only", async () => {
    await GET(request());

    const where = jobsQuery().where(
      { status: "status column" },
      { eq: (...args: unknown[]) => args },
    );

    expect(where).toEqual(["status column", "open"]);
  });

  it("asks for the most recently opened role first", async () => {
    await GET(request());

    const orderBy = jobsQuery().orderBy(
      { openedAt: "openedAt column" },
      { desc: (column: unknown) => ["desc", column] },
    );

    expect(orderBy).toEqual([["desc", "openedAt column"]]);
  });

  it("counts only non-terminal stages as still in play", async () => {
    const body = (await (await GET(request())).json()) as JobsResponseBody;

    expect(body.jobs[0].activeCandidates).toBe(2);
  });

  it("reports zero for a role nobody has applied to", async () => {
    findManyJobs.mockResolvedValue([{ ...BACKEND_ROLE, applications: [] }]);

    const body = (await (await GET(request())).json()) as JobsResponseBody;

    expect(body.jobs[0].activeCandidates).toBe(0);
    expect(body.jobs[0].stageCounts.map((stage) => stage.count)).toEqual([0, 0, 0]);
  });

  it("returns an empty list rather than an error when no role is open", async () => {
    findManyJobs.mockResolvedValue([]);

    const response = await GET(request());
    const body = (await response.json()) as JobsResponseBody;

    expect(response.status).toBe(200);
    expect(body.jobs).toEqual([]);
  });

  it("fails loudly rather than reporting empty pipelines when the stage table is empty", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    findManyPipelineStages.mockResolvedValue([]);

    const response = await GET(request());

    expect(response.status).toBe(500);

    consoleError.mockRestore();
  });

  it("applies the caller's limit", async () => {
    await GET(request("?limit=5"));

    expect(jobsQuery().limit).toBe(5);
  });

  it("defaults the limit when the caller omits it", async () => {
    await GET(request());

    expect(jobsQuery().limit).toBe(20);
  });

  it.each(["?limit=0", "?limit=101", "?limit=abc", "?limit=1.5"])(
    "rejects %s with 400 and never queries",
    async (search) => {
      const response = await GET(request(search));

      expect(response.status).toBe(400);
      expect(findManyJobs).not.toHaveBeenCalled();
    },
  );

  it("hides the cause of a query failure from the caller", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    findManyJobs.mockRejectedValue(new Error("connection to postgres://user:pw@host failed"));

    const response = await GET(request());
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(500);
    expect(body.error).not.toMatch(/postgres/);
    expect(consoleError).toHaveBeenCalled();

    consoleError.mockRestore();
  });
});
