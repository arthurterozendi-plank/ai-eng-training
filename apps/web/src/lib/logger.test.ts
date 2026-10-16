import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { createCorrelationId, logServerError } from "@/lib/logger";

let consoleError: MockInstance<typeof console.error>;

beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  consoleError.mockRestore();
});

/** The single argument of the single `console.error` call, parsed. */
function loggedLine(): Record<string, unknown> {
  expect(consoleError).toHaveBeenCalledTimes(1);
  const [line, ...rest] = consoleError.mock.calls[0];

  expect(rest).toEqual([]);
  expect(typeof line).toBe("string");

  return JSON.parse(line as string) as Record<string, unknown>;
}

describe("createCorrelationId", () => {
  it("returns a fresh uuid each call", () => {
    const first = createCorrelationId();
    const second = createCorrelationId();

    expect(first).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(second).not.toBe(first);
  });
});

describe("logServerError", () => {
  it("writes one JSON line carrying the correlation id, the error detail and the context", () => {
    const error = Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:54322"), {
      code: "ECONNREFUSED",
    });

    logServerError("GET /api/widgets failed", {
      correlationId: "ref-1",
      error,
      widgetId: "w-1",
    });

    const line = loggedLine();

    expect(line).toMatchObject({
      level: "error",
      message: "GET /api/widgets failed",
      correlationId: "ref-1",
      widgetId: "w-1",
      error: {
        name: "Error",
        message: "connect ECONNREFUSED 127.0.0.1:54322",
        code: "ECONNREFUSED",
      },
    });
    expect((line.error as { stack?: unknown }).stack).toEqual(expect.any(String));
    expect(new Date(line.time as string).toISOString()).toBe(line.time);
  });

  it("never lets a context key overwrite the id or the message", () => {
    logServerError("GET /api/widgets failed", {
      correlationId: "ref-4",
      error: new Error("boom"),
      message: "spoofed",
      level: "info",
    });

    expect(loggedLine()).toMatchObject({
      level: "error",
      message: "GET /api/widgets failed",
      correlationId: "ref-4",
    });
  });

  it("logs a thrown non-Error value instead of dropping it", () => {
    logServerError("GET /api/widgets failed", { correlationId: "ref-2", error: "socket hang up" });

    expect(loggedLine()).toMatchObject({
      correlationId: "ref-2",
      error: { message: "socket hang up" },
    });
  });

  it("omits a code that is not a string, rather than logging a misleading one", () => {
    logServerError("GET /api/widgets failed", {
      correlationId: "ref-3",
      error: Object.assign(new Error("boom"), { code: 42 }),
    });

    expect(loggedLine().error).not.toHaveProperty("code");
  });
});
