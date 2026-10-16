import { describe, expect, it } from "vitest";

import { EnvValidationError } from "@/env";
import {
  createPostHogApi,
  MAX_PAGES,
  PostHogApiError,
  type PostHogConfig,
  type PostHogErrorKind,
} from "@/posthog-api";

const CONFIG: PostHogConfig = {
  host: "https://us.posthog.com",
  projectId: "4242",
  personalApiKey: "phx_secret_do_not_print",
};

interface RecordedRequest {
  url: URL;
  init: RequestInit;
}

/** A `fetch` that answers each call with the next responder and records what it was sent. */
function fakeFetch(...responders: (() => Response | Promise<Response>)[]): {
  fetch: typeof fetch;
  requests: RecordedRequest[];
} {
  const requests: RecordedRequest[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: new URL(String(input)), init: init ?? {} });
    const responder = responders[requests.length - 1];
    if (!responder) {
      throw new Error(`fakeFetch: unexpected request #${requests.length} to ${String(input)}`);
    }
    return responder();
  }) as typeof fetch;

  return { fetch: fetchImpl, requests };
}

function json(body: unknown, init: ResponseInit = {}): () => Response {
  return () =>
    new Response(JSON.stringify(body), {
      status: 200,
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
}

function api(fetchImpl: typeof fetch, loadConfig: () => PostHogConfig = () => CONFIG) {
  return createPostHogApi({ loadConfig, fetch: fetchImpl });
}

async function failure(promise: Promise<unknown>): Promise<PostHogApiError> {
  const error = await promise.then(
    () => {
      throw new Error("expected the call to fail");
    },
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(PostHogApiError);
  return error as PostHogApiError;
}

describe("createPostHogApi — query", () => {
  it("posts HogQL with bound values, a name, force_blocking and the bearer key", async () => {
    const { fetch, requests } = fakeFetch(json({ results: [[1]] }));

    const result = await api(fetch).query("probe", "SELECT {x}", { x: "value" });

    expect(result.results).toEqual([[1]]);
    const [request] = requests;
    expect(request!.url.href).toBe("https://us.posthog.com/api/projects/4242/query/");
    expect(request!.init.method).toBe("POST");
    expect(new Headers(request!.init.headers).get("Authorization")).toBe(
      "Bearer phx_secret_do_not_print",
    );
    expect(JSON.parse(String(request!.init.body))).toStrictEqual({
      query: { kind: "HogQLQuery", query: "SELECT {x}", values: { x: "value" } },
      name: "talentscout-mcp-posthog:probe",
      refresh: "force_blocking",
    });
  });

  it.each<[string, () => Response]>([
    ["a body that is not JSON", () => new Response("<html>gateway</html>", { status: 200 })],
    ["JSON with no results", json({ query_status: { complete: false } })],
    ["results that are not rows", json({ results: [1, 2, 3] })],
  ])("treats %s as malformed, not as zero rows", async (_label, responder) => {
    const error = await failure(api(fakeFetch(responder).fetch).query("probe", "SELECT 1", {}));

    expect(error.kind).toBe("malformed");
  });
});

describe("createPostHogApi — failures", () => {
  it.each<[number, PostHogErrorKind, RegExp]>([
    [401, "unauthorized", /POSTHOG_PERSONAL_API_KEY/],
    [403, "forbidden", /query:read/],
    [404, "not_found", /POSTHOG_PROJECT_ID/],
    [400, "rejected", /rejected the request/],
    [500, "server_error", /HTTP 500/],
    [502, "server_error", /HTTP 502/],
  ])("maps HTTP %i to %s", async (status, kind, message) => {
    const { fetch } = fakeFetch(
      json({ type: "x", code: "some_code", detail: "PostHog detail" }, { status }),
    );

    const error = await failure(api(fetch).query("probe", "SELECT 1", {}));

    expect(error.kind).toBe(kind);
    expect(error.message).toMatch(message);
    expect(error.message).toContain("PostHog detail");
  });

  it("carries PostHog's code and Retry-After on a 429", async () => {
    const { fetch } = fakeFetch(
      json(
        { type: "throttled_error", code: "api_queries_budget_exceeded", detail: "Budget used." },
        { status: 429, headers: { "Retry-After": "37" } },
      ),
    );

    const error = await failure(api(fetch).query("probe", "SELECT 1", {}));

    expect(error.kind).toBe("rate_limited");
    expect(error.message).toContain("api_queries_budget_exceeded");
    expect(error.message).toContain("Retry after 37 s");
  });

  it("does not quote an HTML error page into the message", async () => {
    const { fetch } = fakeFetch(
      () => new Response("<html><body>Bad gateway</body></html>", { status: 502 }),
    );

    const error = await failure(api(fetch).query("probe", "SELECT 1", {}));

    expect(error.message).not.toContain("<html>");
  });

  it("classifies an aborted-by-timeout fetch as a timeout", async () => {
    const { fetch } = fakeFetch(() => {
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    });

    const error = await failure(api(fetch).query("probe", "SELECT 1", {}));

    expect(error.kind).toBe("timeout");
  });

  it("classifies fetch's own TypeError as a network failure", async () => {
    const { fetch } = fakeFetch(() => {
      throw new TypeError("fetch failed");
    });

    const error = await failure(api(fetch).query("probe", "SELECT 1", {}));

    expect(error.kind).toBe("network");
    expect(error.message).toContain("https://us.posthog.com");
  });

  it("turns a config loader failure into a config error that names the key", async () => {
    const { fetch, requests } = fakeFetch();
    const loadConfig = () => {
      throw new EnvValidationError("  - POSTHOG_PERSONAL_API_KEY: must be a personal API key");
    };

    const error = await failure(api(fetch, loadConfig).query("probe", "SELECT 1", {}));

    expect(error.kind).toBe("config");
    expect(error.message).toContain("POSTHOG_PERSONAL_API_KEY");
    expect(requests).toHaveLength(0);
  });

  it("never puts the API key in an error message", async () => {
    const statuses = [400, 401, 403, 404, 429, 500];
    for (const status of statuses) {
      const { fetch } = fakeFetch(json({ detail: "nope" }, { status }));
      const error = await failure(api(fetch).query("probe", "SELECT 1", {}));
      expect(error.message).not.toContain(CONFIG.personalApiKey);
    }
  });
});

describe("createPostHogApi — definitions", () => {
  it("follows every page of event definitions and filters by repeated names", async () => {
    const { fetch, requests } = fakeFetch(
      json({
        results: [{ name: "job_viewed", last_seen_at: "2026-10-16T08:00:00Z" }],
        next: "https://us.posthog.com/api/projects/4242/event_definitions/?limit=100&offset=100",
      }),
      json({ results: [{ name: "offer_made", last_seen_at: null }], next: null }),
    );

    const definitions = await api(fetch).listEventDefinitions(["job_viewed", "offer_made"]);

    expect(definitions).toStrictEqual([
      { name: "job_viewed", lastSeenAt: "2026-10-16T08:00:00Z" },
      { name: "offer_made", lastSeenAt: null },
    ]);
    expect(requests[0]!.url.searchParams.getAll("names")).toEqual(["job_viewed", "offer_made"]);
    expect(requests[1]!.url.searchParams.get("offset")).toBe("100");
  });

  it("asks for one event's properties with a JSON-encoded event_names filter", async () => {
    const { fetch, requests } = fakeFetch(
      json({
        results: [
          { name: "job_id", property_type: "String" },
          { name: "untyped", property_type: "" },
        ],
        next: null,
      }),
    );

    const properties = await api(fetch).listEventProperties("job_viewed");

    expect(properties).toStrictEqual([
      { name: "job_id", type: "String" },
      { name: "untyped", type: null },
    ]);
    const params = requests[0]!.url.searchParams;
    expect(requests[0]!.url.pathname).toBe("/api/projects/4242/property_definitions/");
    expect(params.get("event_names")).toBe('["job_viewed"]');
    expect(params.get("filter_by_event_names")).toBe("true");
    expect(params.get("type")).toBe("event");
  });

  it("refuses a next-page link on another origin instead of sending the key there", async () => {
    const { fetch, requests } = fakeFetch(
      json({ results: [], next: "https://attacker.example/api/projects/4242/event_definitions/" }),
    );

    const error = await failure(api(fetch).listEventDefinitions());

    expect(error.kind).toBe("malformed");
    expect(requests).toHaveLength(1);
  });

  it("stops at the page cap with an error rather than a partial list", async () => {
    const page = json({
      results: [{ name: "e", last_seen_at: null }],
      next: "https://us.posthog.com/api/projects/4242/event_definitions/?offset=1",
    });
    const { fetch } = fakeFetch(...Array.from({ length: MAX_PAGES + 1 }, () => page));

    const error = await failure(api(fetch).listEventDefinitions());

    expect(error.kind).toBe("too_large");
  });

  it("treats a page without results as malformed", async () => {
    const { fetch } = fakeFetch(json({ count: 0 }));

    const error = await failure(api(fetch).listEventDefinitions());

    expect(error.kind).toBe("malformed");
  });

  it("fails the whole listing when a later page is rate-limited", async () => {
    const { fetch } = fakeFetch(
      json({
        results: [{ name: "job_viewed", last_seen_at: null }],
        next: "https://us.posthog.com/api/projects/4242/event_definitions/?offset=100",
      }),
      json({ code: "throttled" }, { status: 429 }),
    );

    const error = await failure(api(fetch).listEventDefinitions());

    expect(error.kind).toBe("rate_limited");
  });
});
