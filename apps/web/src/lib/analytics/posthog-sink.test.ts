import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AnalyticsEvent } from "@/lib/analytics/events";

const VALID_EVENT: AnalyticsEvent = {
  name: "job_viewed",
  properties: { job_id: crypto.randomUUID(), actor_role: "recruiter" },
};

const KEYED_ENV = {
  env: {
    NEXT_PUBLIC_POSTHOG_KEY: "phc_test",
    NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
  },
};

/** Lets every pending promise callback and the sink's own `await` run to completion. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

// `client.ts` holds which client `startAnalytics` started in module state, so each test loads
// fresh copies of both modules rather than inheriting the previous test's client.
async function loadModules() {
  vi.resetModules();
  const client = await import("@/lib/analytics/client");
  const { posthogSink } = await import("@/lib/analytics/posthog-sink");
  const { captureAnalyticsEvent } = await import("@/lib/analytics/capture");
  return { ...client, posthogSink, captureAnalyticsEvent };
}

describe("posthogSink", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    error = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    error.mockRestore();
  });

  it("captures a validated catalog event with its name and properties once analytics started", async () => {
    const { startAnalytics, posthogSink, captureAnalyticsEvent } = await loadModules();
    const capture = vi.fn();
    await startAnalytics({
      loadEnv: () => Promise.resolve(KEYED_ENV),
      loadClient: () => Promise.resolve({ init: vi.fn(), capture }),
    });

    captureAnalyticsEvent(VALID_EVENT, posthogSink);
    await settle();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(VALID_EVENT.name, VALID_EVENT.properties);
  });

  it("delivers an event fired before startAnalytics settles instead of dropping it", async () => {
    const { startAnalytics, posthogSink, captureAnalyticsEvent } = await loadModules();
    const capture = vi.fn();
    let releaseClient: () => void = () => undefined;
    const started = startAnalytics({
      loadEnv: () => Promise.resolve(KEYED_ENV),
      loadClient: () =>
        new Promise((resolve) => {
          releaseClient = () => resolve({ init: vi.fn(), capture });
        }),
    });

    captureAnalyticsEvent(VALID_EVENT, posthogSink);
    await settle();
    expect(capture).not.toHaveBeenCalled();

    releaseClient();
    await started;
    await settle();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(capture).toHaveBeenCalledWith(VALID_EVENT.name, VALID_EVENT.properties);
  });

  it("captures nothing and logs nothing per event when the key is missing", async () => {
    const { startAnalytics, posthogSink, captureAnalyticsEvent } = await loadModules();
    const loadClient = vi.fn();
    await startAnalytics({
      loadEnv: () =>
        Promise.resolve({ env: { NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com" } }),
      loadClient,
    });
    warn.mockClear();

    captureAnalyticsEvent(VALID_EVENT, posthogSink);
    captureAnalyticsEvent(VALID_EVENT, posthogSink);
    await settle();

    expect(loadClient).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("captures nothing when init threw", async () => {
    const { startAnalytics, posthogSink, captureAnalyticsEvent } = await loadModules();
    const capture = vi.fn();
    await startAnalytics({
      loadEnv: () => Promise.resolve(KEYED_ENV),
      loadClient: () =>
        Promise.resolve({
          init: () => {
            throw new Error("init blew up");
          },
          capture,
        }),
    });

    captureAnalyticsEvent(VALID_EVENT, posthogSink);
    await settle();

    expect(capture).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("neither throws nor rejects when startAnalytics was never called", async () => {
    const { posthogSink, captureAnalyticsEvent } = await loadModules();

    captureAnalyticsEvent(VALID_EVENT, posthogSink);
    await settle();

    expect(error).not.toHaveBeenCalled();
  });
});
