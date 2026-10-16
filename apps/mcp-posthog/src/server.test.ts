import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { EnvValidationError } from "@/env";
import { createPostHogApi, type PostHogConfig } from "@/posthog-api";
import { createServer } from "@/server";

const CONFIG: PostHogConfig = {
  host: "https://us.posthog.com",
  projectId: "4242",
  personalApiKey: "phx_secret_do_not_print",
};

const NOW = new Date("2026-10-16T08:00:00.000Z");

interface ToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

interface SeenRequest {
  url: URL;
  body: unknown;
}

/**
 * A `fetch` that hands every request to `route` and records it. The real `createPostHogApi` sits
 * between it and the server, so these tests cover the whole path from an HTTP response PostHog
 * documents to the text an agent reads.
 */
function routedFetch(route: (request: SeenRequest) => Response): {
  fetch: typeof fetch;
  requests: SeenRequest[];
} {
  const requests: SeenRequest[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const request = {
      url: new URL(String(input)),
      body: init?.body === undefined ? undefined : JSON.parse(String(init.body)),
    };
    requests.push(request);
    return route(request);
  }) as typeof fetch;

  return { fetch: fetchImpl, requests };
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
}

async function connect(
  fetchImpl: typeof fetch,
  loadConfig: () => PostHogConfig = () => CONFIG,
): Promise<Client> {
  const server = createServer(createPostHogApi({ loadConfig, fetch: fetchImpl }), {
    now: () => NOW,
  });
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  return (await client.callTool({ name, arguments: args })) as unknown as ToolResult;
}

function textOf(result: ToolResult): string {
  return result.content[0]!.text;
}

describe("tool registration", () => {
  it("registers the three tools as read-only and open-world", async () => {
    const client = await connect(routedFetch(() => json({})).fetch);

    const { tools } = await client.listTools();

    expect(tools.map((tool) => tool.name).sort()).toEqual([
      "check-event-fired",
      "get-event-definitions",
      "get-events",
    ]);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: true,
      });
    }
  });
});

describe("check-event-fired", () => {
  it("returns a definite negative when PostHog counts zero", async () => {
    const { fetch, requests } = routedFetch(() => json({ results: [[0, "1970-01-01T00:00:00Z"]] }));
    const client = await connect(fetch);

    const result = await call(client, "check-event-fired", {
      event: "application_submitted",
      withinMinutes: 10,
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/^NOT FIRED: no `application_submitted` event/);
    expect(textOf(result)).toContain('"fired": false');
    expect(textOf(result)).toContain('"lastSeen": null');
    expect(requests[0]!.body).toMatchObject({
      query: { values: { event: "application_submitted", withinMinutes: 10 } },
    });
  });

  it("reports the count and newest timestamp when the event fired", async () => {
    const client = await connect(
      routedFetch(() => json({ results: [["3", "2026-10-16T07:58:00Z"]] })).fetch,
    );

    const result = await call(client, "check-event-fired", {
      event: "job_viewed",
      withinMinutes: 10,
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/^FIRED: `job_viewed` fired 3 times/);
    expect(textOf(result)).toContain('"fired": true');
    expect(textOf(result)).toContain("2026-10-16T07:58:00Z");
  });

  it.each<[string, () => Response]>([
    ["an invalid key (401)", () => json({ code: "invalid_personal_api_key" }, { status: 401 })],
    ["a missing scope (403)", () => json({ code: "permission_denied" }, { status: 403 })],
    ["an unknown project (404)", () => json({ detail: "Not found." }, { status: 404 })],
    [
      "a rate limit (429)",
      () => json({ code: "throttled" }, { status: 429, headers: { "Retry-After": "12" } }),
    ],
    ["a server error (500)", () => new Response("<html>oops</html>", { status: 500 })],
    ["a HogQL rejection (400)", () => json({ detail: "Syntax error" }, { status: 400 })],
    ["a non-JSON 200", () => new Response("<html>ok</html>", { status: 200 })],
    ["a 200 with no results key", () => json({})],
    ["a 200 with zero rows", () => json({ results: [] })],
    ["a 200 with a null count", () => json({ results: [[null, null]] })],
    ["a 200 with a word for a count", () => json({ results: [["none", null]] })],
    [
      "a network failure",
      () => {
        throw new TypeError("fetch failed");
      },
    ],
    [
      "a timeout",
      () => {
        throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      },
    ],
  ])("turns %s into a tool error, never a negative", async (_label, respond) => {
    const client = await connect(routedFetch(respond).fetch);

    const result = await call(client, "check-event-fired", {
      event: "application_submitted",
      withinMinutes: 10,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("NOT FIRED");
    expect(textOf(result)).not.toContain('"fired": false');
    expect(textOf(result)).toContain("This is an error, not a negative");
    expect(textOf(result)).not.toContain(CONFIG.personalApiKey);
  });

  it("names the missing key when the server is not configured", async () => {
    const { fetch, requests } = routedFetch(() => json({ results: [[0, null]] }));
    const client = await connect(fetch, () => {
      throw new EnvValidationError("  - POSTHOG_PERSONAL_API_KEY: must be a personal API key");
    });

    const result = await call(client, "check-event-fired", {
      event: "job_viewed",
      withinMinutes: 5,
    });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("POSTHOG_PERSONAL_API_KEY");
    expect(textOf(result)).not.toContain("NOT FIRED");
    expect(requests).toHaveLength(0);
  });

  it("requires a window rather than choosing one for the caller", async () => {
    const client = await connect(routedFetch(() => json({ results: [[0, null]] })).fetch);

    const result = await call(client, "check-event-fired", { event: "job_viewed" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("withinMinutes");
  });
});

describe("get-events", () => {
  const row = (uuid: string, event = "job_viewed") => [
    uuid,
    event,
    "anon-1",
    "2026-10-16T07:59:00Z",
    JSON.stringify({ job_id: "11111111-1111-4111-8111-111111111111", source: "careers_page" }),
  ];

  it("returns real rows with their properties for an event-name filter", async () => {
    const { fetch, requests } = routedFetch(() => json({ results: [row("u-1"), row("u-2")] }));
    const client = await connect(fetch);

    const result = await call(client, "get-events", {
      event: "job_viewed",
      after: "2026-10-16T07:00:00Z",
      before: "2026-10-16T08:00:00Z",
    });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(
      /^2 events for event `job_viewed` between 2026-10-16T07:00:00Z and 2026-10-16T08:00:00Z/,
    );
    const [, payload] = textOf(result).split("\n\n");
    expect(JSON.parse(payload!)).toStrictEqual([
      {
        uuid: "u-1",
        event: "job_viewed",
        distinctId: "anon-1",
        timestamp: "2026-10-16T07:59:00Z",
        properties: { job_id: "11111111-1111-4111-8111-111111111111", source: "careers_page" },
      },
      expect.objectContaining({ uuid: "u-2" }),
    ]);
    expect(requests[0]!.body).toMatchObject({ query: { values: { event: "job_viewed" } } });
  });

  it("defaults to the 24 hours before now", async () => {
    const { fetch, requests } = routedFetch(() => json({ results: [] }));
    const client = await connect(fetch);

    await call(client, "get-events", {});

    expect(requests[0]!.body).toMatchObject({
      query: {
        values: { after: "2026-10-15T08:00:00.000Z", before: "2026-10-16T08:00:00.000Z" },
      },
    });
  });

  it("states truncation when PostHog has more rows than the limit", async () => {
    const client = await connect(
      routedFetch(() => json({ results: [row("u-1"), row("u-2"), row("u-3")] })).fetch,
    );

    const result = await call(client, "get-events", { limit: 2 });

    expect(textOf(result)).toContain("Showing the newest 2; more exist");
    const [, payload] = textOf(result).split("\n\n");
    expect(JSON.parse(payload!)).toHaveLength(2);
  });

  it("says plainly when nothing matched", async () => {
    const client = await connect(routedFetch(() => json({ results: [] })).fetch);

    const result = await call(client, "get-events", { event: "offer_made" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/^No events matched event `offer_made` between /);
  });

  it("refuses an inverted window without querying PostHog", async () => {
    const { fetch, requests } = routedFetch(() => json({ results: [] }));
    const client = await connect(fetch);

    const result = await call(client, "get-events", {
      after: "2026-10-16T08:00:00Z",
      before: "2026-10-16T07:00:00Z",
    });

    expect(result.isError).toBe(true);
    expect(requests).toHaveLength(0);
  });

  it("turns a rate limit into an error, not an empty result", async () => {
    const client = await connect(
      routedFetch(() => json({ code: "throttled" }, { status: 429 })).fetch,
    );

    const result = await call(client, "get-events", { event: "job_viewed" });

    expect(result.isError).toBe(true);
    expect(textOf(result)).not.toContain("No events matched");
    expect(textOf(result)).toContain("This is an error, not an empty result");
  });
});

describe("get-event-definitions", () => {
  function definitionsRoute(overrides: { propertiesStatus?: number } = {}) {
    return ({ url }: SeenRequest): Response => {
      if (url.pathname.endsWith("/event_definitions/")) {
        if (url.searchParams.get("offset") === "100") {
          return json({ results: [{ name: "job_viewed", last_seen_at: "2026-10-16T07:00:00Z" }] });
        }
        return json({
          results: [{ name: "offer_made", last_seen_at: null }],
          next: `${url.origin}${url.pathname}?limit=100&offset=100`,
        });
      }

      if (overrides.propertiesStatus) {
        return json({ code: "throttled" }, { status: overrides.propertiesStatus });
      }
      const [eventName] = JSON.parse(url.searchParams.get("event_names")!) as string[];
      return json({
        results: [
          { name: "source", property_type: "String" },
          { name: eventName === "offer_made" ? "stage" : "job_id", property_type: "String" },
        ],
      });
    };
  }

  it("lists every defined event, across pages, with its properties", async () => {
    const client = await connect(routedFetch(definitionsRoute()).fetch);

    const result = await call(client, "get-event-definitions", {});

    expect(result.isError).toBeFalsy();
    expect(textOf(result)).toMatch(/^2 events defined in PostHog\./);
    const [, payload] = textOf(result).split("\n\n");
    expect(JSON.parse(payload!)).toStrictEqual({
      events: [
        {
          name: "job_viewed",
          lastSeenAt: "2026-10-16T07:00:00Z",
          properties: [
            { name: "job_id", type: "String" },
            { name: "source", type: "String" },
          ],
        },
        {
          name: "offer_made",
          lastSeenAt: null,
          properties: [
            { name: "source", type: "String" },
            { name: "stage", type: "String" },
          ],
        },
      ],
    });
  });

  it("names the requested events PostHog has no definition for", async () => {
    const { fetch, requests } = routedFetch(definitionsRoute());
    const client = await connect(fetch);

    const result = await call(client, "get-event-definitions", {
      names: ["job_viewed", "job_vewed"],
    });

    expect(textOf(result)).toMatch(/^1 of 2 requested events defined in PostHog\./);
    expect(textOf(result)).toContain("no definition for: `job_vewed`");
    const [, payload] = textOf(result).split("\n\n");
    expect(JSON.parse(payload!).notDefined).toEqual(["job_vewed"]);
    expect(requests[0]!.url.searchParams.getAll("names")).toEqual(["job_viewed", "job_vewed"]);
  });

  it("fails the whole call, not part of it, when a property lookup is rate-limited", async () => {
    const client = await connect(routedFetch(definitionsRoute({ propertiesStatus: 429 })).fetch);

    const result = await call(client, "get-event-definitions", {});

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain("This is an error, not an empty catalog");
    expect(textOf(result)).not.toContain('"events"');
  });
});
