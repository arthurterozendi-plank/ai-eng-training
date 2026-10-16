import { PostHogApiError, type HogQLResult } from "./posthog-api";

/** Rows `get-events` returns when the caller does not pass `limit`. */
export const GET_EVENTS_LIMIT_DEFAULT = 25;

/**
 * The ceiling on `get-events`' `limit`. Each row carries the event's whole property bag, and
 * autocapture events run to dozens of properties — past this a page is a context-window event.
 */
export const GET_EVENTS_LIMIT_MAX = 200;

/** `get-events`' window when the caller passes no `after`: the deprecated events API's default. */
export const GET_EVENTS_DEFAULT_WINDOW_MS = 24 * 60 * 60 * 1000;

/** The widest `check-event-fired` window: seven days. PostHog asks for short time ranges. */
export const WITHIN_MINUTES_MAX = 7 * 24 * 60;

/** A HogQL statement and the values its `{placeholders}` bind to. */
export interface HogQLStatement {
  hogql: string;
  values: Record<string, unknown>;
}

/** What `get-events` filters on. `after` and `before` are ISO 8601 datetimes. */
export interface GetEventsFilter {
  event?: string;
  distinctId?: string;
  after: string;
  before: string;
  limit: number;
}

/** One event as `get-events` returns it. */
export interface EventRow {
  uuid: string;
  event: string;
  distinctId: string;
  timestamp: string;
  properties: Record<string, unknown>;
}

/** The parsed answer to "how many times did this event fire in the window?". */
export interface EventFiredCount {
  matches: number;
  /** The newest match's timestamp; `null` whenever `matches` is 0. */
  lastSeen: string | null;
}

const EVENT_COLUMNS = ["uuid", "event", "distinct_id", "timestamp", "properties"] as const;

/**
 * Builds `get-events`' query. Fragments are fixed text; every caller-supplied string is a bound
 * value. It asks for `limit + 1` rows so the caller can tell a full page from a truncated one by
 * counting, rather than trusting PostHog's `hasMore`.
 */
export function buildGetEventsQuery(filter: GetEventsFilter): HogQLStatement {
  if (!Number.isSafeInteger(filter.limit) || filter.limit < 1) {
    throw new RangeError(`limit must be a positive integer, got ${filter.limit}`);
  }

  const conditions = ["timestamp >= toDateTime({after})", "timestamp < toDateTime({before})"];
  const values: Record<string, unknown> = { after: filter.after, before: filter.before };

  if (filter.event !== undefined) {
    conditions.push("event = {event}");
    values.event = filter.event;
  }
  if (filter.distinctId !== undefined) {
    conditions.push("distinct_id = {distinctId}");
    values.distinctId = filter.distinctId;
  }

  const hogql = [
    `SELECT ${EVENT_COLUMNS.join(", ")}`,
    "FROM events",
    `WHERE ${conditions.join(" AND ")}`,
    "ORDER BY timestamp DESC",
    `LIMIT ${filter.limit + 1}`,
  ].join("\n");

  return { hogql, values };
}

/** Builds `check-event-fired`'s query. The window is measured on PostHog's clock, not ours. */
export function buildEventFiredQuery(event: string, withinMinutes: number): HogQLStatement {
  return {
    hogql: [
      "SELECT count() AS matches, max(timestamp) AS last_seen",
      "FROM events",
      "WHERE event = {event} AND timestamp >= now() - toIntervalMinute({withinMinutes})",
    ].join("\n"),
    values: { event, withinMinutes },
  };
}

function malformed(what: string): PostHogApiError {
  return new PostHogApiError("malformed", `PostHog's query result could not be read: ${what}.`);
}

/**
 * Parses `get-events`' rows strictly: a row of the wrong width or a property bag that is not a
 * JSON object is an error, never a silently dropped row.
 */
export function parseEventRows(result: HogQLResult): EventRow[] {
  return result.results.map((row, index) => {
    if (row.length !== EVENT_COLUMNS.length) {
      throw malformed(`row ${index} has ${row.length} columns, expected ${EVENT_COLUMNS.length}`);
    }

    const [uuid, event, distinctId, timestamp, properties] = row;
    if (
      typeof uuid !== "string" ||
      typeof event !== "string" ||
      typeof distinctId !== "string" ||
      typeof timestamp !== "string"
    ) {
      throw malformed(`row ${index} has a non-string uuid, event, distinct_id or timestamp`);
    }

    return { uuid, event, distinctId, timestamp, properties: parseProperties(properties, index) };
  });
}

function parseProperties(value: unknown, index: number): Record<string, unknown> {
  let parsed = value;
  if (typeof value === "string") {
    try {
      parsed = JSON.parse(value);
    } catch {
      throw malformed(`row ${index}'s properties are not valid JSON`);
    }
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw malformed(`row ${index}'s properties are not a JSON object`);
  }
  return parsed as Record<string, unknown>;
}

/**
 * Parses `check-event-fired`'s single `count()` row. This is the only path to a negative, so it
 * accepts exactly one shape — one row whose first cell is a non-negative integer, as a JSON number
 * or as a decimal string (ClickHouse `UInt64`) — and throws on everything else. An empty
 * `results`, a `null` count, or a non-integer must never read as "did not fire".
 *
 * `last_seen` is ignored when nothing matched: ClickHouse's `max` over zero rows returns the
 * type's default (the Unix epoch), not `NULL`.
 */
export function parseEventFiredCount(result: HogQLResult): EventFiredCount {
  if (result.results.length !== 1) {
    throw malformed(`expected exactly one count row, got ${result.results.length}`);
  }

  const [count, lastSeen] = result.results[0]!;
  const matches = parseCount(count);

  return {
    matches,
    lastSeen: matches > 0 && typeof lastSeen === "string" ? lastSeen : null,
  };
}

function parseCount(value: unknown): number {
  if (typeof value === "number" && Number.isSafeInteger(value) && value >= 0) {
    return value;
  }
  if (typeof value === "string" && /^\d+$/.test(value) && Number.isSafeInteger(Number(value))) {
    return Number(value);
  }
  throw malformed(`the match count ${JSON.stringify(value) ?? "undefined"} is not a count`);
}
