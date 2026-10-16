import { z } from "zod";

/** Where and as whom this server talks to PostHog's private API. */
export interface PostHogConfig {
  /** The app host, e.g. `https://us.posthog.com` — never the `i.` ingestion host. */
  host: string;
  projectId: string;
  personalApiKey: string;
}

/**
 * Every way a PostHog call can fail, as the tool layer needs to tell them apart. None of them is
 * ever rendered as an empty result — that conflation is what AI-44 AC 4 exists to prevent.
 */
export type PostHogErrorKind =
  | "config"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "rejected"
  | "server_error"
  | "network"
  | "timeout"
  | "malformed"
  | "too_large";

/**
 * A failed PostHog call. `message` is written for the agent reading the tool result: it names the
 * env key or scope to fix, and it never contains the personal API key.
 */
export class PostHogApiError extends Error {
  constructor(
    readonly kind: PostHogErrorKind,
    message: string,
  ) {
    super(message);
    this.name = "PostHogApiError";
  }
}

/** A HogQL result: one array of cells per row, in `SELECT` order. */
export interface HogQLResult {
  results: unknown[][];
}

/** One entry from PostHog's event-definition catalog. */
export interface EventDefinition {
  name: string;
  /** When PostHog last ingested this event, or `null` if it never has. */
  lastSeenAt: string | null;
}

/** One property PostHog has seen on a given event. */
export interface PropertyDefinition {
  name: string;
  /** PostHog's inferred type (`String`, `Numeric`, `DateTime`, …), or `null` if it has none. */
  type: string | null;
}

/**
 * The PostHog calls the tools make. This is the seam `src/server.ts` is built against: it never
 * sees `fetch`, a URL or a key, which is what lets its tests drive it with a fake `fetch`.
 */
export interface PostHogApi {
  /** Runs one HogQL query. Caller-supplied strings must travel in `values`, never in `hogql`. */
  query(name: string, hogql: string, values: Record<string, unknown>): Promise<HogQLResult>;
  /** Every event definition in the project, or only those named. Follows every page. */
  listEventDefinitions(names?: readonly string[]): Promise<EventDefinition[]>;
  /** Every property PostHog has seen on `eventName`. Follows every page. */
  listEventProperties(eventName: string): Promise<PropertyDefinition[]>;
}

/**
 * How long one PostHog request may take. PostHog's own worst case for `/query` is up to 30 s in
 * its concurrency queue plus 10 s of execution (AI-44 §2), so anything shorter would time out
 * queries PostHog was still going to answer.
 */
export const REQUEST_TIMEOUT_MS = 45_000;

/** The most pages a definitions listing may follow before it is treated as an error. */
export const MAX_PAGES = 50;

const hogqlResponseSchema = z.object({ results: z.array(z.array(z.unknown())) });

const errorBodySchema = z.object({
  code: z.string().optional(),
  detail: z.string().optional(),
});

function pageSchema<T extends z.ZodType>(item: T) {
  return z.object({ results: z.array(item), next: z.string().nullish() });
}

const eventDefinitionPageSchema = pageSchema(
  z.object({ name: z.string(), last_seen_at: z.string().nullish() }),
);

const propertyDefinitionPageSchema = pageSchema(
  z.object({ name: z.string(), property_type: z.string().nullish() }),
);

/** PostHog's personal-API-key scope each endpoint requires, quoted in `403` messages. */
const SCOPES = {
  query: "query:read",
  eventDefinitions: "event_definition:read",
  propertyDefinitions: "property_definition:read",
} as const;

/** The longest PostHog `detail` quoted into a message — enough for a HogQL error, not a page. */
const MAX_DETAIL_LENGTH = 500;

/**
 * Builds the {@link PostHogApi} over `fetch`. `loadConfig` runs on every call rather than once,
 * so a server started before its keys exist still starts — and each call says which key is
 * missing instead.
 */
export function createPostHogApi(options: {
  loadConfig: () => PostHogConfig;
  fetch: typeof fetch;
  timeoutMs?: number;
}): PostHogApi {
  const { fetch: fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS } = options;

  function loadConfig(): PostHogConfig {
    try {
      return options.loadConfig();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new PostHogApiError(
        "config",
        `The talentscout-posthog MCP server is not configured. Set the keys below in the ` +
          `repository root's .env.local, then restart the server.\n${reason}`,
      );
    }
  }

  function projectUrl(config: PostHogConfig, path: string): URL {
    return new URL(`/api/projects/${encodeURIComponent(config.projectId)}/${path}`, config.host);
  }

  async function request(
    config: PostHogConfig,
    url: URL,
    scope: string,
    body?: unknown,
  ): Promise<unknown> {
    let response: Response;
    try {
      response = await fetchImpl(url, {
        method: body === undefined ? "GET" : "POST",
        headers: {
          Authorization: `Bearer ${config.personalApiKey}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      throw transportError(error, url, timeoutMs);
    }

    if (!response.ok) {
      throw await httpError(response, config, scope);
    }

    try {
      return await response.json();
    } catch (error) {
      if (isTimeout(error)) {
        throw transportError(error, url, timeoutMs);
      }
      throw new PostHogApiError(
        "malformed",
        `PostHog answered HTTP ${response.status} from ${url.pathname} with a body that is not JSON.`,
      );
    }
  }

  async function collectPages<T extends z.ZodType>(
    config: PostHogConfig,
    first: URL,
    scope: string,
    schema: ReturnType<typeof pageSchema<T>>,
  ): Promise<z.infer<T>[]> {
    const items: z.infer<T>[] = [];
    let url: URL | null = first;

    for (let page = 1; url; page++) {
      if (page > MAX_PAGES) {
        throw new PostHogApiError(
          "too_large",
          `${first.pathname} has more than ${MAX_PAGES} pages; refusing to return a partial list.`,
        );
      }

      const parsed = schema.safeParse(await request(config, url, scope));
      if (!parsed.success) {
        throw new PostHogApiError(
          "malformed",
          `PostHog's ${first.pathname} response did not have the documented page shape ` +
            `({ results, next }): ${parsed.error.issues[0]?.message ?? "unknown issue"}.`,
        );
      }

      items.push(...parsed.data.results);
      url = parsed.data.next ? sameOriginNextPage(parsed.data.next, first) : null;
    }

    return items;
  }

  return {
    async query(name, hogql, values) {
      const config = loadConfig();
      const body = await request(config, projectUrl(config, "query/"), SCOPES.query, {
        query: { kind: "HogQLQuery", query: hogql, values },
        name: `talentscout-mcp-posthog:${name}`,
        // A cached answer to "did it fire just now?" is a stale answer; a cached zero is a false
        // negative. `force_blocking` recalculates even when PostHog holds fresh results.
        refresh: "force_blocking",
      });

      const parsed = hogqlResponseSchema.safeParse(body);
      if (!parsed.success) {
        throw new PostHogApiError(
          "malformed",
          "PostHog's query response had no readable `results` array, so it says nothing about " +
            "which events exist.",
        );
      }

      return parsed.data;
    },

    async listEventDefinitions(names) {
      const config = loadConfig();
      const url = projectUrl(config, "event_definitions/");
      url.searchParams.set("limit", "100");
      for (const name of names ?? []) {
        url.searchParams.append("names", name);
      }

      const definitions = await collectPages(
        config,
        url,
        SCOPES.eventDefinitions,
        eventDefinitionPageSchema,
      );
      return definitions.map((definition) => ({
        name: definition.name,
        lastSeenAt: definition.last_seen_at ?? null,
      }));
    },

    async listEventProperties(eventName) {
      const config = loadConfig();
      const url = projectUrl(config, "property_definitions/");
      url.searchParams.set("type", "event");
      url.searchParams.set("event_names", JSON.stringify([eventName]));
      url.searchParams.set("filter_by_event_names", "true");
      url.searchParams.set("limit", "100");

      const properties = await collectPages(
        config,
        url,
        SCOPES.propertyDefinitions,
        propertyDefinitionPageSchema,
      );
      return properties.map((property) => ({
        name: property.name,
        type: property.property_type || null,
      }));
    },
  };
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && error.name === "TimeoutError";
}

function transportError(error: unknown, url: URL, timeoutMs: number): PostHogApiError {
  if (isTimeout(error)) {
    return new PostHogApiError(
      "timeout",
      `PostHog at ${url.origin} did not answer within ${timeoutMs / 1000} s.`,
    );
  }

  const reason = error instanceof Error ? error.message : String(error);
  return new PostHogApiError(
    "network",
    `Could not reach PostHog at ${url.origin} (${reason}). Check POSTHOG_API_HOST and the network.`,
  );
}

/**
 * A page's `next` link is absolute and comes from the response body. Following one to another
 * origin would send the bearer token to whatever host the body names.
 */
function sameOriginNextPage(next: string, first: URL): URL {
  const url = new URL(next, first);
  if (url.origin !== first.origin) {
    throw new PostHogApiError(
      "malformed",
      `PostHog returned a next-page link on ${url.origin}, not ${first.origin}; refusing to ` +
        "send the API key there.",
    );
  }
  return url;
}

async function httpError(
  response: Response,
  config: PostHogConfig,
  scope: string,
): Promise<PostHogApiError> {
  const { code, detail } = await readErrorBody(response);
  const status = `HTTP ${response.status}${code ? `, ${code}` : ""}`;
  const quoted = detail ? ` PostHog said: "${detail}"` : "";

  switch (response.status) {
    case 401:
      return new PostHogApiError(
        "unauthorized",
        `PostHog rejected the personal API key (${status}). Check POSTHOG_PERSONAL_API_KEY: it ` +
          `must be a live personal API key (phx_…), not the project token (phc_…).${quoted}`,
      );
    case 403:
      return new PostHogApiError(
        "forbidden",
        `PostHog refused access (${status}). The personal API key needs the ${scope} scope ` +
          `and access to project ${config.projectId}.${quoted}`,
      );
    case 404:
      return new PostHogApiError(
        "not_found",
        `PostHog has no project ${config.projectId} at ${new URL(config.host).origin} ` +
          `(${status}). Check POSTHOG_PROJECT_ID, and POSTHOG_API_HOST — US projects live on ` +
          `https://us.posthog.com, EU projects on https://eu.posthog.com.${quoted}`,
      );
    case 429: {
      const retryAfter = response.headers.get("Retry-After");
      const retry = retryAfter ? ` Retry after ${retryAfter} s.` : "";
      return new PostHogApiError(
        "rate_limited",
        `PostHog rate-limited this request (${status}).${retry}${quoted}`,
      );
    }
    case 400:
      return new PostHogApiError("rejected", `PostHog rejected the request (${status}).${quoted}`);
    default:
      return new PostHogApiError("server_error", `PostHog returned ${status}.${quoted}`);
  }
}

/**
 * PostHog errors are `{ type, code, detail, attr }` JSON. Anything else — an HTML error page from a
 * proxy, most plausibly — contributes nothing to the message rather than being quoted into it.
 */
async function readErrorBody(response: Response): Promise<{ code?: string; detail?: string }> {
  let text: string;
  try {
    text = await response.text();
  } catch {
    return {};
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return {};
  }

  const parsed = errorBodySchema.safeParse(json);
  if (!parsed.success) {
    return {};
  }

  const { code, detail } = parsed.data;
  return {
    code,
    detail:
      detail && detail.length > MAX_DETAIL_LENGTH
        ? `${detail.slice(0, MAX_DETAIL_LENGTH)}…`
        : detail,
  };
}
