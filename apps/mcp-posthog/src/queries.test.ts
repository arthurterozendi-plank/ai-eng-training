import { describe, expect, it } from "vitest";

import { PostHogApiError } from "@/posthog-api";
import {
  buildEventFiredQuery,
  buildGetEventsQuery,
  parseEventFiredCount,
  parseEventRows,
} from "@/queries";

const WINDOW = { after: "2026-10-15T08:00:00Z", before: "2026-10-16T08:00:00Z" };
const HOSTILE = "x' OR 1=1 --";

describe("buildGetEventsQuery", () => {
  it("binds every caller string as a value and never splices it into the HogQL", () => {
    const { hogql, values } = buildGetEventsQuery({
      ...WINDOW,
      event: HOSTILE,
      distinctId: HOSTILE,
      limit: 25,
    });

    expect(hogql).not.toContain(HOSTILE);
    expect(values).toStrictEqual({ ...WINDOW, event: HOSTILE, distinctId: HOSTILE });
  });

  it("omits the event and distinct_id conditions when they are not given", () => {
    const { hogql, values } = buildGetEventsQuery({ ...WINDOW, limit: 25 });

    expect(hogql).not.toContain("{event}");
    expect(hogql).not.toContain("{distinctId}");
    expect(values).toStrictEqual(WINDOW);
  });

  it("asks for one row beyond the limit so truncation is detectable", () => {
    expect(buildGetEventsQuery({ ...WINDOW, limit: 25 }).hogql).toMatch(/LIMIT 26$/);
  });

  it("refuses a limit that is not a positive integer", () => {
    expect(() => buildGetEventsQuery({ ...WINDOW, limit: 1.5 })).toThrow(RangeError);
    expect(() => buildGetEventsQuery({ ...WINDOW, limit: 0 })).toThrow(RangeError);
  });
});

describe("buildEventFiredQuery", () => {
  it("binds the event name and the window", () => {
    const { hogql, values } = buildEventFiredQuery(HOSTILE, 10);

    expect(hogql).not.toContain(HOSTILE);
    expect(values).toStrictEqual({ event: HOSTILE, withinMinutes: 10 });
  });
});

describe("parseEventFiredCount", () => {
  it.each([
    [[[0, "1970-01-01T00:00:00Z"]], 0],
    [[["0", "1970-01-01T00:00:00Z"]], 0],
    [[[3, "2026-10-16T08:00:00Z"]], 3],
    [[["3", "2026-10-16T08:00:00Z"]], 3],
  ])("reads %j as %i matches", (results, matches) => {
    expect(parseEventFiredCount({ results }).matches).toBe(matches);
  });

  it("drops the epoch max() returns over zero rows", () => {
    expect(parseEventFiredCount({ results: [[0, "1970-01-01T00:00:00Z"]] }).lastSeen).toBeNull();
  });

  it("reports the newest match when there is one", () => {
    expect(parseEventFiredCount({ results: [[2, "2026-10-16T08:00:00Z"]] }).lastSeen).toBe(
      "2026-10-16T08:00:00Z",
    );
  });

  it.each([
    ["no rows", []],
    ["an empty row", [[]]],
    ["a null count", [[null]]],
    ["a non-numeric count", [["abc"]]],
    ["a negative count", [[-1]]],
    ["a fractional count", [[1.5]]],
    ["two rows", [[0], [0]]],
  ])("refuses %s rather than reading it as a negative", (_label, results) => {
    expect(() => parseEventFiredCount({ results })).toThrow(PostHogApiError);
  });
});

describe("parseEventRows", () => {
  const row = ["uuid-1", "job_viewed", "anon-1", "2026-10-16T08:00:00Z"];

  it("parses properties delivered as a JSON string", () => {
    const [event] = parseEventRows({ results: [[...row, '{"job_id":"j-1"}']] });

    expect(event).toStrictEqual({
      uuid: "uuid-1",
      event: "job_viewed",
      distinctId: "anon-1",
      timestamp: "2026-10-16T08:00:00Z",
      properties: { job_id: "j-1" },
    });
  });

  it("parses properties delivered as an object", () => {
    const [event] = parseEventRows({ results: [[...row, { job_id: "j-1" }]] });

    expect(event!.properties).toStrictEqual({ job_id: "j-1" });
  });

  it.each([
    ["a row of the wrong width", [row]],
    ["properties that are not JSON", [[...row, "{not json"]]],
    ["properties that are an array", [[...row, "[]"]]],
    ["a numeric event name", [["uuid-1", 7, "anon-1", "2026-10-16T08:00:00Z", "{}"]]],
  ])("refuses %s", (_label, results) => {
    expect(() => parseEventRows({ results })).toThrow(PostHogApiError);
  });
});
