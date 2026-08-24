import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { analyticsOptions, startAnalytics, type AnalyticsDeps } from "@/lib/analytics";

describe("analyticsOptions", () => {
  it("returns exactly the seven documented posthog.init options", () => {
    // toStrictEqual, not toEqual: under vitest@4.1.10 toEqual treats an explicitly-undefined
    // property as equal to an absent one, so it cannot catch a dropped or renamed key — which
    // is exactly how the internal_or_test_user_hostname defect entered (spec §2).
    expect(analyticsOptions("https://eu.i.posthog.com")).toStrictEqual({
      api_host: "https://eu.i.posthog.com",
      defaults: "2026-08-29",
      capture_pageview: "history_change",
      autocapture: false,
      disable_session_recording: true,
      disable_external_dependency_loading: true,
      internal_or_test_user_hostname: null,
    });
  });
});

describe("startAnalytics", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("calls init exactly once with the key and analyticsOptions(host), and resolves enabled", async () => {
    const init = vi.fn();
    const deps: AnalyticsDeps = {
      loadEnv: () =>
        Promise.resolve({
          env: {
            NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
            NEXT_PUBLIC_POSTHOG_HOST: "https://eu.i.posthog.com",
          },
        }),
      loadClient: () => Promise.resolve({ init }),
    };

    const status = await startAnalytics(deps);

    expect(init).toHaveBeenCalledTimes(1);
    expect(init).toHaveBeenCalledWith("phc_test", analyticsOptions("https://eu.i.posthog.com"));
    expect(status).toEqual({ enabled: true });
  });

  it("never calls loadClient or init, and resolves missing-key, when the key is absent", async () => {
    const init = vi.fn();
    const loadClient = vi.fn(() => Promise.resolve({ init }));
    const deps: AnalyticsDeps = {
      loadEnv: () =>
        Promise.resolve({
          env: {
            NEXT_PUBLIC_POSTHOG_KEY: undefined,
            NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
          },
        }),
      loadClient,
    };

    const status = await startAnalytics(deps);

    // The ordering assertion: loadEnv() runs first and the missing-key branch must return
    // before loadClient() is ever reached. Deleting the short-circuit in startAnalytics makes
    // loadClient run and this spy see a call — see the DoD 6 failure-injection log for the
    // demonstrated red run.
    expect(loadClient).not.toHaveBeenCalled();
    expect(init).not.toHaveBeenCalled();
    expect(status).toEqual({ enabled: false, reason: "missing-key" });
  });

  it("resolves init-failed, never rejects, when loadEnv() rejects", async () => {
    const deps: AnalyticsDeps = {
      loadEnv: () => Promise.reject(new Error("env module failed to load")),
      loadClient: () => Promise.resolve({ init: vi.fn() }),
    };

    await expect(startAnalytics(deps)).resolves.toEqual({ enabled: false, reason: "init-failed" });
  });

  it("resolves init-failed, never rejects, when loadClient() rejects", async () => {
    // Must carry a key: without one, DoD 5's ordering short-circuits to "missing-key" before
    // loadClient is ever reached, and this case would pass green without exercising the catch.
    const deps: AnalyticsDeps = {
      loadEnv: () =>
        Promise.resolve({
          env: {
            NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
            NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
          },
        }),
      loadClient: () => Promise.reject(new Error("posthog-js chunk failed to load")),
    };

    await expect(startAnalytics(deps)).resolves.toEqual({ enabled: false, reason: "init-failed" });
  });

  it("resolves init-failed, never rejects, when init() throws", async () => {
    // Same reasoning: must carry a key, or the ordering short-circuit returns before init() is
    // ever called and this case never reaches the guard it exists to test.
    const deps: AnalyticsDeps = {
      loadEnv: () =>
        Promise.resolve({
          env: {
            NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
            NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
          },
        }),
      loadClient: () =>
        Promise.resolve({
          init: () => {
            throw new Error("init blew up");
          },
        }),
    };

    await expect(startAnalytics(deps)).resolves.toEqual({ enabled: false, reason: "init-failed" });
  });

  it("warns exactly once, ungated, on the missing-key path", async () => {
    const deps: AnalyticsDeps = {
      loadEnv: () =>
        Promise.resolve({
          env: {
            NEXT_PUBLIC_POSTHOG_KEY: undefined,
            NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
          },
        }),
      loadClient: () => Promise.resolve({ init: vi.fn() }),
    };

    await startAnalytics(deps);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("missing-key");
  });

  it("warns exactly once, ungated, on the init-failed path", async () => {
    const deps: AnalyticsDeps = {
      loadEnv: () => Promise.reject(new Error("boom")),
      loadClient: () => Promise.resolve({ init: vi.fn() }),
    };

    await startAnalytics(deps);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("init-failed");
  });
});

describe("static import guard (analytics.ts)", () => {
  /**
   * AC 4's mechanical guard: neither `posthog-js` nor `@/env` may be a value-level static
   * import in analytics.ts. Both are reached only through a dynamic `import()` inside
   * `startAnalytics`'s own `try` — Next.js requires `src/instrumentation-client.ts` at module
   * scope with no `try` of its own before hydration, so a static import that throws here is
   * uncatchable and costs the whole app its hydration (spec §2, §3.3). This is the check DoD 6
   * cannot see: DoD 6 injects `deps` and never exercises the real import style.
   */
  const source = fs.readFileSync(path.join(import.meta.dirname, "analytics.ts"), "utf-8");

  function staticImportLines(moduleSpecifier: string): string[] {
    return source
      .split("\n")
      .filter((line) => new RegExp(`from ["']${moduleSpecifier}["']`).test(line))
      .map((line) => line.trim());
  }

  it("imports posthog-js only as import type", () => {
    const lines = staticImportLines("posthog-js");

    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line).toMatch(/^import type /);
    }
  });

  it("has no value-level static import of @/env", () => {
    const lines = staticImportLines("@/env");

    for (const line of lines) {
      expect(line).toMatch(/^import type /);
    }
  });
});
