import fs from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

// `vi.hoisted` is required, not stylistic: `vi.mock`'s factory is hoisted above every `const`
// in this file, so a plainly-declared spy would still be in its temporal dead zone when it runs.
const { startAnalytics } = vi.hoisted(() => ({
  startAnalytics: vi.fn(() => Promise.resolve({ enabled: false, reason: "missing-key" as const })),
}));

vi.mock("@/lib/analytics", () => ({ startAnalytics }));

describe("instrumentation-client", () => {
  it("calls startAnalytics exactly once on import", async () => {
    await import("@/instrumentation-client");

    expect(startAnalytics).toHaveBeenCalledTimes(1);
  });
});

describe("static import guard (instrumentation-client.ts)", () => {
  /**
   * AC 4's mechanical guard, same reasoning as analytics.ts's own scan (spec §3.3, slice 2
   * DoD 7): Next requires this module at module scope with no `try`/`catch` of its own before
   * hydration begins, so a static import of `posthog-js` or `@/env` here is uncatchable and
   * would cost the whole app its hydration. The file may only import `@/lib/analytics`.
   */
  const source = fs.readFileSync(
    path.join(import.meta.dirname, "instrumentation-client.ts"),
    "utf-8",
  );

  it("imports only @/lib/analytics", () => {
    const importLines = source
      .split("\n")
      .filter((line) => /^import /.test(line.trim()))
      .map((line) => line.trim());

    expect(importLines).toEqual([`import { startAnalytics } from "@/lib/analytics";`]);
  });
});
