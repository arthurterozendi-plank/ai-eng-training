import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DATABASE_TIMEOUT_MS,
  DatabaseTimeoutError,
  withDatabaseTimeout,
} from "@/lib/database-timeout";

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("withDatabaseTimeout", () => {
  it("gives up after five seconds", () => {
    expect(DATABASE_TIMEOUT_MS).toBe(5_000);
  });

  it("settles with the operation's value when it finishes in time", async () => {
    await expect(withDatabaseTimeout(Promise.resolve("row"))).resolves.toBe("row");
  });

  it("is still waiting one millisecond before the deadline", async () => {
    const settled = vi.fn();
    withDatabaseTimeout(new Promise(() => {})).then(settled, settled);

    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS - 1);

    expect(settled).not.toHaveBeenCalled();
  });

  it("rejects with DatabaseTimeoutError once a read outlives the deadline", async () => {
    const pending = withDatabaseTimeout(new Promise(() => {}));
    const assertion = expect(pending).rejects.toBeInstanceOf(DatabaseTimeoutError);

    await vi.advanceTimersByTimeAsync(DATABASE_TIMEOUT_MS);

    await assertion;
  });

  it("passes the operation's own failure through rather than calling it a timeout", async () => {
    const failure = new Error("connect ECONNREFUSED 127.0.0.1:54322");

    await expect(withDatabaseTimeout(Promise.reject(failure))).rejects.toBe(failure);
  });

  it("leaves no timer behind once the operation settles", async () => {
    await withDatabaseTimeout(Promise.resolve("row"));
    await withDatabaseTimeout(Promise.reject(new Error("refused"))).catch(() => undefined);

    expect(vi.getTimerCount()).toBe(0);
  });
});
