import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";

import { captureAnalyticsEvent, type AnalyticsSink } from "@/lib/analytics/capture";
import type { AnalyticsEvent } from "@/lib/analytics/events";
import { actorRoleSchema } from "@/lib/analytics/properties";

const A_JOB_ID = crypto.randomUUID();

/** A minimal, genuinely valid `job_viewed` event — the baseline every test tampers with. */
const VALID_EVENT: AnalyticsEvent = {
  name: "job_viewed",
  properties: { job_id: A_JOB_ID, actor_role: actorRoleSchema.options[0] },
};

describe("captureAnalyticsEvent", () => {
  it("calls the sink exactly once with the event's name and parsed properties", () => {
    const sink = vi.fn();

    captureAnalyticsEvent(VALID_EVENT, sink);

    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith(VALID_EVENT.name, VALID_EVENT.properties);
  });

  it("drops an event whose properties were cast past the type system to carry a non-uuid job_id, and logs once", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sink = vi.fn();
    const tamperedEvent = {
      name: "job_viewed",
      properties: { job_id: "not-a-uuid", actor_role: actorRoleSchema.options[0] },
    } as unknown as AnalyticsEvent;

    captureAnalyticsEvent(tamperedEvent, sink);

    expect(sink).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("does not propagate a synchronously throwing sink", () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const throwingSink: AnalyticsSink = () => {
      throw new Error("sink boom");
    };

    expect(() => captureAnalyticsEvent(VALID_EVENT, throwingSink)).not.toThrow();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });

  it("does not produce an unhandled rejection when an async sink's promise rejects", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onUnhandledRejection = vi.fn();
    process.on("unhandledRejection", onUnhandledRejection);

    const rejectingSink: AnalyticsSink = async () => {
      throw new Error("async sink boom");
    };

    captureAnalyticsEvent(VALID_EVENT, rejectingSink);

    // Node detects an unhandled rejection on the tick after a promise settles unhandled, not
    // synchronously — give the event loop room to run that detection before asserting on it.
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onUnhandledRejection).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    process.off("unhandledRejection", onUnhandledRejection);
    consoleErrorSpy.mockRestore();
  });

  it("does not produce an unhandled rejection when the sink returns a non-native thenable (not instanceof Promise)", async () => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const onUnhandledRejection = vi.fn();
    process.on("unhandledRejection", onUnhandledRejection);

    // A duck-typed PromiseLike, not a native Promise — `posthog-node`-style wrappers and test
    // doubles both take this shape. `instanceof Promise` would miss it (review round 1,
    // SHOULD).
    const rejected = Promise.reject(new Error("thenable boom"));
    const thenable: PromiseLike<void> = {
      then: (_onFulfilled, onRejected) => rejected.then(undefined, onRejected),
    };
    expect(thenable).not.toBeInstanceOf(Promise);

    const thenableSink: AnalyticsSink = () => thenable;

    captureAnalyticsEvent(VALID_EVENT, thenableSink);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(onUnhandledRejection).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    process.off("unhandledRejection", onUnhandledRejection);
    consoleErrorSpy.mockRestore();
  });

  // "constructor", "toString" and "valueOf" are not made-up examples: they are inherited
  // `Object.prototype` keys, so a plain object index (`schemasByName[event.name]`) walks the
  // prototype chain and returns a truthy, non-schema value for each of them — passing a
  // falsy-check guard and then throwing at `.safeParse` (review round 1, BLOCKER). This is
  // the one case a `try`/`catch` around the sink call cannot reach, because the throw happens
  // before the sink is ever called.
  it.each(["resume_deleted", "constructor", "toString", "valueOf"])(
    'drops an event whose name is outside the catalog ("%s"), logs once, and does not throw',
    (name) => {
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
      const sink = vi.fn();
      const unknownNameEvent = { name, properties: {} } as unknown as AnalyticsEvent;

      expect(() => captureAnalyticsEvent(unknownNameEvent, sink)).not.toThrow();
      expect(sink).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      // The unrecognized name is a separate argument, not spliced into the message string
      // (review round 2, NIT) — an untyped caller controls this value, so it must not be
      // interpolated into a server log line.
      expect(consoleErrorSpy).toHaveBeenCalledWith(expect.any(String), name);

      consoleErrorSpy.mockRestore();
    },
  );

  // `event` itself, not just `event.name`, is a JavaScript caller's to get wrong — the same
  // class of untyped-caller input `Object.hasOwn` exists to handle (review round 2, NIT).
  it.each([null, undefined])("drops a %s event, logs once, and does not throw", (event) => {
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const sink = vi.fn();

    expect(() => captureAnalyticsEvent(event as unknown as AnalyticsEvent, sink)).not.toThrow();
    expect(sink).not.toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalledTimes(1);

    consoleErrorSpy.mockRestore();
  });
});

// No PostHog seam-guard test lives here (review round 2): "this ticket's diff did not
// introduce a PostHog dependency" is a property of a diff, not an invariant of the repo at
// rest, and both "AI-45 added it" and "AI-27 legitimately added it later" leave identical
// repo state — every formulation tried (repo-wide scan, directory-scoped scan, a
// package.json/env.ts-scoped scan) either false-positived on AI-27's own eventual, legitimate
// work or false-negatived on the real violation while still passing on unrelated prose. See
// docs/specs/ai-45-funnel-analytics.md §5 slice 3 and the round 1/round 2 review threads for
// the formulations that were tried and rejected. This is diff review's job, not a unit test's.
