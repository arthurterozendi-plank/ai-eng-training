import fs from "node:fs";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { env, EnvValidationError } from "@/env";

describe("env", () => {
  it("reads NODE_ENV with the database connection strings unset", () => {
    delete process.env.DATABASE_URL;
    delete process.env.DIRECT_DATABASE_URL;

    expect(env.NODE_ENV).toBe("test");
  });

  it("falls back to the default NEXT_PUBLIC_APP_URL", () => {
    expect(env.NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");
  });

  it("leaves NEXT_PUBLIC_POSTHOG_KEY unset and defaults NEXT_PUBLIC_POSTHOG_HOST when neither is set", () => {
    expect(env.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(env.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://us.i.posthog.com");
  });
});

describe("env (module re-evaluated with stubbed variables)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("normalizes an empty NEXT_PUBLIC_POSTHOG_KEY and NEXT_PUBLIC_POSTHOG_HOST to absent, rather than throwing", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "");
    vi.resetModules();

    const { env: reloadedEnv } = await import("@/env");

    expect(reloadedEnv.NEXT_PUBLIC_POSTHOG_KEY).toBeUndefined();
    expect(reloadedEnv.NEXT_PUBLIC_POSTHOG_HOST).toBe("https://us.i.posthog.com");
  });

  it("trims surrounding whitespace from NEXT_PUBLIC_POSTHOG_KEY", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "  phc_x  ");
    vi.resetModules();

    const { env: reloadedEnv } = await import("@/env");

    expect(reloadedEnv.NEXT_PUBLIC_POSTHOG_KEY).toBe("phc_x");
  });

  it("throws EnvValidationError when NEXT_PUBLIC_POSTHOG_HOST has no scheme", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "eu.i.posthog.com");
    vi.resetModules();

    // `vi.resetModules()` re-evaluates "@/env" in a fresh module registry, so the `EnvValidationError`
    // class it throws is a different class object than the one that module registry's earlier
    // evaluation would have produced — an `instanceof` check would need that same reference, which
    // this test never imports. Matching by `.name` is what works across the reset instead.
    await expect(import("@/env")).rejects.toMatchObject({ name: "EnvValidationError" });
  });
});

describe("env server PostHog keys (read at access time)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("leaves POSTHOG_PROJECT_KEY unset and defaults POSTHOG_INGEST_HOST when neither is set", () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", undefined);
    vi.stubEnv("POSTHOG_INGEST_HOST", undefined);

    expect(env.POSTHOG_PROJECT_KEY).toBeUndefined();
    expect(env.POSTHOG_INGEST_HOST).toBe("https://us.i.posthog.com");
  });

  it("normalizes an empty POSTHOG_PROJECT_KEY and POSTHOG_INGEST_HOST to absent, rather than throwing", () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", "");
    vi.stubEnv("POSTHOG_INGEST_HOST", "");

    expect(env.POSTHOG_PROJECT_KEY).toBeUndefined();
    expect(env.POSTHOG_INGEST_HOST).toBe("https://us.i.posthog.com");
  });

  it("trims POSTHOG_PROJECT_KEY and reads a set POSTHOG_INGEST_HOST", () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", "  phc_server  ");
    vi.stubEnv("POSTHOG_INGEST_HOST", "https://eu.i.posthog.com");

    expect(env.POSTHOG_PROJECT_KEY).toBe("phc_server");
    expect(env.POSTHOG_INGEST_HOST).toBe("https://eu.i.posthog.com");
  });

  it("throws EnvValidationError on access when POSTHOG_INGEST_HOST has no scheme", () => {
    vi.stubEnv("POSTHOG_INGEST_HOST", "eu.i.posthog.com");

    expect(() => env.POSTHOG_INGEST_HOST).toThrow(EnvValidationError);
  });
});

describe("process.env convention", () => {
  /**
   * Every file under apps/web/src, test files excluded, walked recursively. AC 2 requires
   * `@/env` to be the single place that reads `process.env` — a source scan is the only check
   * that can catch a future module reaching around the convention instead of importing the
   * validated value.
   */
  function collectSourceFiles(dir: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const entryPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        files.push(...collectSourceFiles(entryPath));
        continue;
      }

      if (/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) continue;
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;

      files.push(entryPath);
    }

    return files;
  }

  it("only src/env.ts reads process.env", () => {
    const srcDir = import.meta.dirname;
    const offenders = collectSourceFiles(srcDir).filter((file) => {
      if (path.relative(srcDir, file) === "env.ts") return false;
      return fs.readFileSync(file, "utf-8").includes("process.env");
    });

    expect(offenders).toEqual([]);
  });
});
