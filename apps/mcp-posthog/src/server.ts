import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { PostHogApiError, type PostHogApi } from "./posthog-api";
import {
  buildEventFiredQuery,
  buildGetEventsQuery,
  GET_EVENTS_DEFAULT_WINDOW_MS,
  GET_EVENTS_LIMIT_DEFAULT,
  GET_EVENTS_LIMIT_MAX,
  parseEventFiredCount,
  parseEventRows,
  WITHIN_MINUTES_MAX,
  type EventFiredCount,
} from "./queries";

/**
 * The annotations every tool here carries. `openWorldHint` is `true`, unlike `talentscout-db`'s:
 * these tools read an external service whose contents this repository does not control.
 */
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: true,
} as const;

/** PostHog caps an event definition's name at 400 characters. */
const EVENT_NAME = z.string().min(1).max(400);

/** The most names one `get-event-definitions` call may ask about. */
const MAX_DEFINITION_NAMES = 50;

type ToolResult = { isError?: true; content: { type: "text"; text: string }[] };

function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] };
}

/**
 * Renders a failure as `isError: true`, followed by `consequence`: one sentence saying, in words,
 * that the failure is not an answer. Without it an agent reading "0 results" and an agent reading
 * "401" can reach the same conclusion (AI-44 AC 4).
 */
function toErrorResult(error: unknown, consequence: string): ToolResult {
  const reason =
    error instanceof PostHogApiError
      ? error.message
      : `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
  return { isError: true, content: [{ type: "text", text: `${reason}\n\n${consequence}` }] };
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

function renderEventFired(event: string, withinMinutes: number, count: EventFiredCount): string {
  const payload = JSON.stringify(
    { fired: count.matches > 0, event, withinMinutes, ...count },
    null,
    2,
  );
  const window = `the last ${plural(withinMinutes, "minute")}`;

  if (count.matches > 0) {
    return (
      `FIRED: \`${event}\` fired ${plural(count.matches, "time")} in ${window}; ` +
      `the most recent at ${count.lastSeen ?? "an unreported time"}.\n\n${payload}`
    );
  }

  return (
    `NOT FIRED: no \`${event}\` event was recorded in ${window}. This is a definite negative ` +
    "from a query PostHog answered, not an empty or failed lookup.\n\n" +
    "The name match is exact and case-sensitive. An event captured moments ago may not be " +
    "queryable yet — PostHog's ingestion is not instant — so re-check before concluding it " +
    `was never sent.\n\n${payload}`
  );
}

/**
 * Builds the `talentscout-posthog` MCP server and registers `check-event-fired`, `get-events`
 * and `get-event-definitions` against `api`. `now` is injectable so `get-events`' default window
 * is testable; `src/main.ts` is the sole caller that supplies a real `api` and a transport.
 */
export function createServer(api: PostHogApi, options: { now?: () => Date } = {}): McpServer {
  const now = options.now ?? (() => new Date());
  const server = new McpServer({ name: "talentscout-posthog", version: "0.1.0" });

  server.registerTool(
    "check-event-fired",
    {
      description:
        "Check whether PostHog recorded a given event in the last N minutes. Answers FIRED with " +
        "a count and the newest timestamp, or NOT FIRED — a definite negative from a successful " +
        "query. Any failure (bad key, rate limit, unreadable response) is a tool error, never a " +
        "negative.",
      inputSchema: {
        event: EVENT_NAME,
        withinMinutes: z.int().min(1).max(WITHIN_MINUTES_MAX),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ event, withinMinutes }) => {
      try {
        const { hogql, values } = buildEventFiredQuery(event, withinMinutes);
        const count = parseEventFiredCount(await api.query("check-event-fired", hogql, values));
        return textResult(renderEventFired(event, withinMinutes, count));
      } catch (error) {
        return toErrorResult(
          error,
          `This is an error, not a negative: nothing is known about whether \`${event}\` fired.`,
        );
      }
    },
  );

  server.registerTool(
    "get-events",
    {
      description:
        "List recent PostHog events with their full properties, newest first. Filter by event " +
        "name and/or distinct_id within an ISO 8601 window; without `after`, the window is the " +
        `24 hours before \`before\` (default now). Returns ${GET_EVENTS_LIMIT_DEFAULT} events ` +
        `unless \`limit\` (up to ${GET_EVENTS_LIMIT_MAX}) says otherwise.`,
      inputSchema: {
        event: EVENT_NAME.optional(),
        distinctId: z.string().min(1).optional(),
        after: z.iso.datetime({ offset: true }).optional(),
        before: z.iso.datetime({ offset: true }).optional(),
        limit: z.int().min(1).max(GET_EVENTS_LIMIT_MAX).optional(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ event, distinctId, after, before, limit }) => {
      const windowEnd = before ?? now().toISOString();
      const windowStart =
        after ?? new Date(Date.parse(windowEnd) - GET_EVENTS_DEFAULT_WINDOW_MS).toISOString();
      const pageSize = limit ?? GET_EVENTS_LIMIT_DEFAULT;

      if (Date.parse(windowStart) >= Date.parse(windowEnd)) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: `\`after\` (${windowStart}) must be earlier than \`before\` (${windowEnd}).`,
            },
          ],
        };
      }

      try {
        const { hogql, values } = buildGetEventsQuery({
          event,
          distinctId,
          after: windowStart,
          before: windowEnd,
          limit: pageSize,
        });
        const rows = parseEventRows(await api.query("get-events", hogql, values));

        const filters = [
          event === undefined ? "all events" : `event \`${event}\``,
          ...(distinctId === undefined ? [] : [`distinct_id \`${distinctId}\``]),
        ].join(" for ");
        const window = `between ${windowStart} and ${windowEnd}`;

        if (rows.length === 0) {
          return textResult(
            `No events matched ${filters} ${window}. This is a real result from a query PostHog ` +
              "answered.",
          );
        }

        const shown = rows.slice(0, pageSize);
        const truncated =
          rows.length > pageSize
            ? ` Showing the newest ${pageSize}; more exist — narrow the window` +
              (pageSize < GET_EVENTS_LIMIT_MAX
                ? ` or raise \`limit\` (up to ${GET_EVENTS_LIMIT_MAX}).`
                : ".")
            : "";

        return textResult(
          `${plural(shown.length, "event")} for ${filters} ${window}, newest first.${truncated}` +
            `\n\n${JSON.stringify(shown, null, 2)}`,
        );
      } catch (error) {
        return toErrorResult(
          error,
          "This is an error, not an empty result: nothing is known about which events exist in " +
            "this window.",
        );
      }
    },
  );

  server.registerTool(
    "get-event-definitions",
    {
      description:
        "List every event PostHog has a definition for, each with the properties PostHog has " +
        "seen on it and when it was last seen. Pass `names` to check specific events; any of " +
        "them PostHog has no definition for is listed under notDefined.",
      inputSchema: {
        names: z.array(EVENT_NAME).min(1).max(MAX_DEFINITION_NAMES).optional(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ names }) => {
      try {
        const requested = names === undefined ? undefined : new Set(names);
        const definitions = (await api.listEventDefinitions(names))
          .filter((definition) => requested === undefined || requested.has(definition.name))
          .sort((a, b) => a.name.localeCompare(b.name));

        // Sequential on purpose: PostHog's rate limits count per key, and a project with tens of
        // events gains nothing from a burst that risks a 429 halfway through.
        const events = [];
        for (const definition of definitions) {
          const properties = await api.listEventProperties(definition.name);
          events.push({
            ...definition,
            properties: properties.sort((a, b) => a.name.localeCompare(b.name)),
          });
        }

        const defined = new Set(definitions.map((definition) => definition.name));
        const notDefined = (names ?? []).filter((name) => !defined.has(name));

        const header =
          names === undefined
            ? `${plural(events.length, "event")} defined in PostHog.`
            : `${defined.size} of ${plural(names.length, "requested event")} defined in PostHog.`;
        const missing =
          notDefined.length > 0
            ? ` PostHog has no definition for: ${notDefined.map((name) => `\`${name}\``).join(", ")}.`
            : "";
        const payload = names === undefined ? { events } : { events, notDefined };

        return textResult(`${header}${missing}\n\n${JSON.stringify(payload, null, 2)}`);
      } catch (error) {
        return toErrorResult(
          error,
          "This is an error, not an empty catalog: nothing is known about which events are " +
            "defined.",
        );
      }
    },
  );

  return server;
}
