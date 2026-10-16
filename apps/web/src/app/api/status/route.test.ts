import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { DATABASE_TIMEOUT_MS } from "@/lib/database-timeout";
import { GET, type StatusPayload } from "@/app/api/status/route";

const { ping } = vi.hoisted(() => ({ ping: vi.fn() }));

// `db.$client` is the raw postgres.js tagged template, so the route's `select 1` lands here.
// Mocked for the same module-load reason as every other database route test.
vi.mock("@talentscout/db/client", () => ({ db: { $client: ping } }));

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  ping.mockReset();
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
  vi.useRealTimers();
});

async function readStatus(response: Response) {
  expect(response.headers.get("Cache-Control")).toBe("no-store");

  return (await response.json()) as StatusPayload;
}

describe("GET /api/status", () => {
  it("reports healthy with liveness details when the database answers", async () => {
    ping.mockResolvedValue([{ "?column?": 1 }]);

    const response = await GET();

    expect(response.status).toBe(200);

    const body = await readStatus(response);

    expect(body).toMatchObject({ status: "ok", database: "ok", environment: "test" });
    expect(body).not.toHaveProperty("correlationId");
    expect(body.uptimeSeconds).toBeGreaterThanOrEqual(0);
    expect(new Date(body.timestamp).toString()).not.toBe("Invalid Date");
    expect(ping.mock.calls[0][0]).toEqual(["select 1"]);
  });

  it("reports unhealthy with 503 when the database is unreachable, logging the detail", async () => {
    ping.mockRejectedValue(new Error("connect ECONNREFUSED 10.0.0.7:6543"));

    const response = await GET();

    expect(response.status).toBe(503);

    const raw = await response.clone().text();
    const body = await readStatus(response);

    expect(body).toMatchObject({ status: "unhealthy", database: "unreachable" });
    expect(raw).not.toContain("ECONNREFUSED");
    expect(JSON.parse(consoleError.mock.calls[0][0] as string)).toMatchObject({
      message: "GET /api/status database check failed",
      correlationId: body.correlationId,
      error: { message: "connect ECONNREFUSED 10.0.0.7:6543" },
    });
  });

  it("reports unhealthy with 503 once a slow database outlives the deadline", async () => {
    vi.useFakeTimers();
    ping.mockReturnValue(new Promise(() => {}));

    const pending = GET();
    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS);
    const response = await pending;

    expect(response.status).toBe(503);
    expect(await readStatus(response)).toMatchObject({ status: "unhealthy", database: "timeout" });
  });
});
