import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsEvent } from "@/lib/analytics/events";

const posthogNode = vi.hoisted(() => ({
  constructed: [] as { key: string; options: unknown }[],
  captureImmediate: vi.fn<(message: unknown) => Promise<void>>(),
}));

vi.mock("server-only", () => ({}));
vi.mock("posthog-node", () => ({
  PostHog: class {
    constructor(key: string, options: unknown) {
      posthogNode.constructed.push({ key, options });
    }
    captureImmediate = posthogNode.captureImmediate;
  },
}));

const VALID_EVENT: AnalyticsEvent = {
  name: "job_viewed",
  properties: { job_id: crypto.randomUUID(), actor_role: "recruiter" },
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// The sink caches its `posthog-node` client in module state, so each test loads a fresh copy.
async function loadModules() {
  vi.resetModules();
  const { posthogServerSink } = await import("@/lib/analytics/posthog-server-sink");
  const { captureAnalyticsEvent } = await import("@/lib/analytics/capture");
  return { posthogServerSink, captureAnalyticsEvent };
}

describe("posthogServerSink", () => {
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    posthogNode.constructed.length = 0;
    posthogNode.captureImmediate.mockReset();
    posthogNode.captureImmediate.mockResolvedValue(undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    error.mockRestore();
    vi.unstubAllEnvs();
  });

  it("captures a validated catalog event with its name and properties, and no distinctId", async () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", "phc_server");
    vi.stubEnv("POSTHOG_INGEST_HOST", "https://eu.i.posthog.com");
    const { posthogServerSink, captureAnalyticsEvent } = await loadModules();

    captureAnalyticsEvent(VALID_EVENT, posthogServerSink);
    await settle();

    expect(posthogNode.constructed).toEqual([
      { key: "phc_server", options: { host: "https://eu.i.posthog.com" } },
    ]);
    expect(posthogNode.captureImmediate).toHaveBeenCalledTimes(1);
    expect(posthogNode.captureImmediate).toHaveBeenCalledWith({
      event: VALID_EVENT.name,
      properties: VALID_EVENT.properties,
    });
  });

  it("settles only after PostHog has received the event, so a caller can keep the function alive", async () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", "phc_server");
    let delivered: () => void = () => undefined;
    posthogNode.captureImmediate.mockReturnValue(
      new Promise<void>((resolve) => {
        delivered = resolve;
      }),
    );
    const { posthogServerSink } = await loadModules();
    let settled = false;

    const sending = Promise.resolve(posthogServerSink("job_viewed", VALID_EVENT.properties)).then(
      () => {
        settled = true;
      },
    );
    await settle();
    expect(settled).toBe(false);

    delivered();
    await sending;
    expect(settled).toBe(true);
  });

  it("reuses one posthog-node client across events", async () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", "phc_server");
    const { posthogServerSink, captureAnalyticsEvent } = await loadModules();

    captureAnalyticsEvent(VALID_EVENT, posthogServerSink);
    captureAnalyticsEvent(VALID_EVENT, posthogServerSink);
    await settle();

    expect(posthogNode.constructed).toHaveLength(1);
    expect(posthogNode.captureImmediate).toHaveBeenCalledTimes(2);
  });

  it("creates no client, captures nothing and logs nothing when POSTHOG_PROJECT_KEY is unset", async () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", "");
    const { posthogServerSink, captureAnalyticsEvent } = await loadModules();

    captureAnalyticsEvent(VALID_EVENT, posthogServerSink);
    await settle();

    expect(posthogNode.constructed).toHaveLength(0);
    expect(posthogNode.captureImmediate).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("turns a failed send into one logged error rather than an unhandled rejection", async () => {
    vi.stubEnv("POSTHOG_PROJECT_KEY", "phc_server");
    posthogNode.captureImmediate.mockRejectedValue(new Error("network down"));
    const { posthogServerSink, captureAnalyticsEvent } = await loadModules();

    captureAnalyticsEvent(VALID_EVENT, posthogServerSink);
    await settle();

    expect(error).toHaveBeenCalledTimes(1);
    expect(String(error.mock.calls[0]?.[0])).toContain("sink rejected");
  });
});
