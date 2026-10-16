import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { DATABASE_TIMEOUT_MS } from "@/lib/database-timeout";
import CandidatePage from "@/app/candidates/[id]/page";

const { findFirst } = vi.hoisted(() => ({ findFirst: vi.fn() }));

// `@talentscout/db/client` throws at module load without `DATABASE_URL`, so the page can only be
// imported with the client mocked — see `api/CLAUDE.md` §C.
vi.mock("@talentscout/db/client", () => ({
  db: { query: { candidates: { findFirst } } },
}));

const CANDIDATE_ID = "11111111-1111-4111-8111-111111111111";
const CONNECTION_DETAIL = "connect ECONNREFUSED 10.0.0.7:6543";

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  findFirst.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  vi.useRealTimers();
});

function loadPage(id = CANDIDATE_ID) {
  return CandidatePage({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({}),
  });
}

function loggedLines() {
  return consoleError.mock.calls.map(
    ([line]) => JSON.parse(line as string) as { correlationId: string; error: { message: string } },
  );
}

describe("CandidatePage", () => {
  it("renders the candidate when the database answers", async () => {
    findFirst.mockResolvedValue({
      id: CANDIDATE_ID,
      fullName: "Ada Lovelace",
      email: "ada@example.com",
      phone: null,
      location: null,
      headline: null,
      summary: null,
      yearsExperience: null,
      linkedinUrl: null,
      resumeUrl: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
      updatedAt: new Date("2026-01-01T00:00:00.000Z"),
      applications: [],
    });

    render(await loadPage());

    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("explains an unreachable database and offers a retry instead of a blank screen", async () => {
    findFirst.mockRejectedValue(
      Object.assign(new Error(CONNECTION_DETAIL), { code: "ECONNREFUSED" }),
    );

    render(await loadPage());

    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("We could not load this candidate just now");
    expect(alert).toHaveTextContent("Nothing was lost");
    expect(screen.getByRole("link", { name: "Try again" })).toHaveAttribute(
      "href",
      `/candidates/${CANDIDATE_ID}`,
    );
    expect(document.body).not.toHaveTextContent(CONNECTION_DETAIL);
  });

  it("shows the recruiter the same reference the server logged with the detail", async () => {
    findFirst.mockRejectedValue(new Error(CONNECTION_DETAIL));

    render(await loadPage());

    const [line] = loggedLines();

    expect(loggedLines()).toHaveLength(1);
    expect(line.error.message).toBe(CONNECTION_DETAIL);
    expect(screen.getByRole("alert")).toHaveTextContent(`Reference: ${line.correlationId}`);
  });

  it("stops waiting on a slow database and says so", async () => {
    vi.useFakeTimers();
    findFirst.mockReturnValue(new Promise(() => {}));

    const page = loadPage();
    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS);
    render(await page);

    expect(screen.getByRole("alert")).toHaveTextContent("took too long");
    expect(screen.getByRole("link", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      `Reference: ${loggedLines()[0].correlationId}`,
    );
  });

  it("still 404s an unknown candidate rather than calling it a load failure", async () => {
    findFirst.mockResolvedValue(undefined);

    await expect(loadPage()).rejects.toMatchObject({ digest: "NEXT_HTTP_ERROR_FALLBACK;404" });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("404s a malformed id without touching the database", async () => {
    await expect(loadPage("not-a-uuid")).rejects.toMatchObject({
      digest: "NEXT_HTTP_ERROR_FALLBACK;404",
    });
    expect(findFirst).not.toHaveBeenCalled();
  });
});
