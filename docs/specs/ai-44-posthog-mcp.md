# AI-44 — Expose PostHog analytics over MCP for engineers verifying instrumentation

**Linear:** AI-44 · Type: Chore · Parent: AI-10 · Milestone: Week 1 — Use AI: Workflow
**Depends on:** AI-27 (unstarted — see §0) · **Blocks:** AI-46
**Merges after:** AI-133, `arthurterozendi/ai-133-let-the-deploy-gate-skip-local-only-env-keys-for-engineers`
(§0, decision 1)
**Branch:** `arthurterozendi/ai-44-expose-posthog-analytics-over-mcp-for-engineers-verifying`
(stacked on AI-133's branch at `2b96024`, itself based on `origin/main` at `e46eee5`)
**Status:** planned and built against a **mocked** PostHog HTTP layer. The live-project halves of
AC 1 and AC 3 are deferred to AI-27, not met.

---

## 0. Escalations and open questions

**AI-27 has not started, so no PostHog project and no personal API key exist.** The decision taken
for this run: build the server and prove everything that can be proven without a live project
against a fake `fetch`, and defer the live halves of the ACs. Every claim below about PostHog's
behaviour comes from PostHog's published docs and its public OpenAPI schema (§2), not from a
response observed against a real project. Two of those claims — the HogQL text in §4 parsing as
written, and `count()` arriving as a JSON number — can only be confirmed live, so they are listed
in the live checklist (§5, slice 6) rather than claimed here.

Questions this ticket could not settle on its own. Two are decided; one is still open.

1. **Decided — the PostHog keys are local-only, and this branch merges after AI-133.**
   `CLAUDE.md` says every key a schema validates must be in `.env.example`, and
   `.claude/skills/pre-deploy/scripts/check-env.sh` fails on any declared key with no value
   (measured, §2). These three are a local developer tool's keys, so requiring them would force a
   deploy environment to hold a personal API key just to pass the gate. The decision: a separate
   PR, AI-133 (`arthurterozendi/ai-133-let-the-deploy-gate-skip-local-only-env-keys-for-engineers`),
   teaches `check-env.sh` that keys below a line reading exactly `# @local-only` are declared but
   never required to deploy; this branch puts the three keys below that line. **Why the merge
   order matters:** without AI-133's change, `check-env.sh` reads the marker as an ordinary
   comment and fails on the three empty keys — measured, with every deploy key set and the PostHog
   keys empty, as exit 1 and `FAIL: unset or empty: POSTHOG_API_HOST POSTHOG_PROJECT_ID
POSTHOG_PERSONAL_API_KEY`. This branch is stacked on AI-133's, so it carries the change: the
   same run exits 0 and lists the three keys on its `NOTE` line, with no drift `WARN`. Merging
   this branch first would land AI-133's commit with it, unreviewed as its own PR.
2. **Decided — the env key names stay.** No ticket named them. `POSTHOG_PERSONAL_API_KEY` is the
   name PostHog's own API docs use in every example; `POSTHOG_PROJECT_ID` and `POSTHOG_API_HOST`
   follow the same spelling. `POSTHOG_API_HOST` is deliberately not `NEXT_PUBLIC_POSTHOG_HOST`,
   which AI-27 owns for the browser client and which points at the _ingestion_ host (§2).
3. **Open — no live verification script.** AI-43 shipped `pnpm mcp:verify`. A PostHog equivalent
   written now could not be run once before merging, and adding it to the root `mcp:verify` Turbo
   task would make that task need PostHog credentials too. **Branch choice for now:** none ships;
   §5 slice 6 is the manual live checklist AI-27 (or the first AI-46 session) runs.

---

## 1. Problem statement

**User story:** As an engineer on the training, I want Claude Code to query PostHog directly so
that it can check which events actually fired instead of taking my word for it.

Analytics fail without making noise. An event gets renamed, a property is dropped, a step is never
instrumented, and nobody notices until a funnel looks wrong. AI-46 builds the loop that catches
it: walk the flow, ask the agent what fired, fix what did not, walk it again. That loop is only as
good as its negative. If "did `application_submitted` fire?" can come back as an empty list —
because the key was wrong, or the request was throttled — then the agent reads silence as "no",
or worse as "nothing to report", and the audit passes on a broken pipe.

### In scope

- A new workspace `apps/mcp-posthog` (`@talentscout/mcp-posthog`): an `@modelcontextprotocol/sdk`
  server over **stdio** with three tools — `get-events`, `get-event-definitions`,
  `check-event-fired`.
- Zod input schemas on every tool; the workspace's own `src/env.ts` for its three keys.
- Registration in the root `.mcp.json`, beside `talentscout-db`.
- README edits recording the decisions.

### Out of scope

- Writing events, editing PostHog config, dashboards, the instrumentation itself (AI-45).
- Creating the PostHog project or the key (AI-27).
- A remote transport, prompts, resources, sampling.

### Acceptance criteria (verbatim from the ticket)

1. Given a live PostHog project, when `get-events` is called with an event name, then real recent
   events come back with their properties.
2. Given an event that has not fired, when `check-event-fired` is called, then it returns a
   definite negative rather than an empty result the model reads as success.
3. `get-event-definitions` lists every defined event and its properties.
4. Edge cases / error states handled: PostHog rate limiting or an invalid key surfaces as a clear
   tool error, not as "no events found".

### AC → slice traceability

| AC  | Satisfied by | Mechanically checked by                                                                                   | Status                                   |
| --- | ------------ | --------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| 1   | Slices 2, 3  | `server.test.ts` over a fake `fetch`: event-name filter reaches PostHog as a bound value; rows → objects  | Mocked half met · **live half deferred** |
| 2   | Slices 2, 3  | `server.test.ts`: `count = 0` → `NOT FIRED`; every malformed body → `isError`, never `NOT FIRED`          | Met against the mock                     |
| 3   | Slices 2, 4  | `server.test.ts`: paginated definitions + per-event properties; unknown requested names listed explicitly | Mocked half met · **live half deferred** |
| 4   | Slices 1, 2  | `posthog-api.test.ts` + `server.test.ts`: 401, 403, 404, 429 (with `Retry-After`), 5xx, network, timeout  | Met against the mock                     |

"Met against the mock" is exact: these tests prove what this code does with the responses PostHog
documents. They cannot prove PostHog sends those responses; slice 6 does that.

---

## 2. Verified facts this plan rests on

Fetched on 2026-10-16. Sources: [API overview](https://posthog.com/docs/api.md),
[API queries](https://posthog.com/docs/api/queries.md), the public OpenAPI schema at
`https://us.posthog.com/api/schema/`, and PostHog's server source on GitHub
([`posthog/exceptions.py`](https://github.com/PostHog/posthog/blob/master/posthog/exceptions.py),
[`hogql_query_runner.py`](https://github.com/PostHog/posthog/blob/master/posthog/hogql_queries/hogql_query_runner.py),
[`hogql/functions/clickhouse/conversions.py`](https://github.com/PostHog/posthog/blob/master/posthog/hogql/functions/clickhouse/conversions.py),
[`drf-exceptions-hog/handler.py`](https://github.com/PostHog/drf-exceptions-hog/blob/master/exceptions_hog/handler.py)).

**The events list endpoint is deprecated; use `/query`.** The OpenAPI description of
`GET /api/projects/{project_id}/events/` reads: "It is effectively deprecated and is kept only for
backwards compatibility … If you want to ad-hoc list or aggregate events, use the Query endpoint
instead." So `get-events` and `check-event-fired` both use
`POST /api/projects/{project_id}/query/` with `{"query": {"kind": "HogQLQuery", …}}`, scope
`query:read`.

**Hosts.** "On US Cloud, these are `https://us.i.posthog.com` for public endpoints and
`https://us.posthog.com` for private ones. On EU Cloud, `https://eu.i.posthog.com` …
`https://eu.posthog.com`." Every endpoint this server calls is private, so `POSTHOG_API_HOST` is
the app host. The `i.` host is what the browser SDK sends events to (AI-27's key).

**Auth.** `Authorization: Bearer <personal API key>` (OpenAPI `PersonalAPIKeyAuth`, `scheme:
bearer`). Personal keys start `phx_` (GitHub secret-scanning section of the API overview). The
project token is `phc_` and is the one people paste by mistake; env validation rejects it.

**Placeholders bind, they do not interpolate.** `HogQLQuery.values` is "Constant values that can
be referenced with the `{placeholder}` syntax in the query". The query runner turns each into
`ast.Constant(value=value)` after parsing, so a bound value can never become HogQL syntax. Every
caller-supplied string in this server travels as a value.

**`toDateTime(string)`** maps to ClickHouse's `parseDateTime64BestEffortOrNull`, so an ISO 8601
timestamp with an offset parses.

**Caching.** "API queries are cached by default." `refresh` defaults to `blocking`, which serves
"very fresh results in the cache" without recalculating. For a tool whose whole job is "did it fire
_just now_", a cached zero is a false negative. Every query here sends `refresh:
"force_blocking"` — "calculate synchronously, even if fresh results are already cached".

**Response shape.** `HogQLQueryResponse` requires `results` (array of row arrays); `columns` and
`types` are optional. Default 100 rows without an explicit `LIMIT`, up to 50 000 with one.

**Definitions.** `GET /api/projects/{project_id}/event_definitions/` (scope
`event_definition:read`) pages `{count, next, previous, results}` and filters by `names` ("Pass
names as repeated or comma-separated values"). Properties come from `GET
/api/projects/{project_id}/property_definitions/?type=event&event_names=<JSON array>&filter_by_event_names=true`
(scope `property_definition:read`); `event_names` is documented as JSON-encoded.

**Errors are `{type, code, detail, attr}` JSON.** PostHog's DRF handler maps authentication
failures to `type: "authentication_error"` (the overview documents `code:
"invalid_personal_api_key"`, `detail: "Invalid Personal API key."` on 401) and throttling to
`type: "throttled_error"`. Query budget exhaustion is a `429` with `code:
"api_queries_budget_exceeded"` and a `Retry-After` header.

**Rate limits.** `/query`: 2400/hour, 240/minute, 3 concurrent, 10 s max execution, and a queued
query may wait up to 30 s. Other read endpoints: 480/minute, 4800/hour. Counted per personal key.

**Node's `fetch` failure shapes — measured here (node v22.20.0).** An `AbortSignal.timeout` rejects
with a `DOMException` named `TimeoutError`; a refused connection rejects with
`TypeError: fetch failed`. Those are the two non-HTTP failures the client classifies.

**Baseline on this machine (node v22.20.0, `origin/main` at `e46eee5`, measured before any
change):** `@talentscout/web` 93/93 tests pass, `@talentscout/db` 106/106, `@talentscout/mcp-db`
62/62, `prettier --check .` clean. `check-env.sh` fails in this worktree with `FAIL: unset or
empty: NEXT_PUBLIC_APP_URL DATABASE_URL DIRECT_DATABASE_URL` because the worktree has no
`.env.local` (known baseline red 2). Known baseline red 1 — 48 jsdom `localStorage` failures under
Node 26 — **does not reproduce on Node 22**, so it is not part of this DoD. Known red 3
(`next build` env failure) is outside every command this ticket runs.

---

## 3. Shape — `apps/mcp-posthog`, server `talentscout-posthog`

AI-43 §3 already decided this: an MCP server is a thing you run, not import, so it lives under
`apps/`, and it named this one in advance — "`apps/mcp-db` and `apps/mcp-posthog` sort together and
read as a family." The `.mcp.json` key follows the same rule: `talentscout-posthog`, so the
agent-visible tools are `mcp__talentscout-posthog__check-event-fired`.

It imports nothing from `@talentscout/db` and owns its own env module, because it reads keys no
other workspace reads.

---

## 4. Target shape

```
apps/mcp-posthog/
  eslint.config.mjs  package.json  tsconfig.json  vitest.config.mts   copied from apps/mcp-db
  src/
    env.ts            POSTHOG_API_HOST, POSTHOG_PROJECT_ID, POSTHOG_PERSONAL_API_KEY — lazy getters
    posthog-api.ts    the HTTP seam: one `fetch`, error classification, pagination
    queries.ts        HogQL text and strict result parsing — pure
    server.ts         createServer(api): the three tools, error → isError rendering
    main.ts           the only module touching env, global fetch, and stdio
```

**The seam.** `server.ts` takes a `PostHogApi` and never sees `fetch` or `process.env`;
`posthog-api.ts` takes a `fetch` and a `loadConfig()`; `main.ts` wires the real ones. Tests
substitute a fake `fetch` returning real `Response` objects, which is the boundary the ACs are
about: the status codes and bodies PostHog sends.

**Config is read per call, not at startup.** `.mcp.json` launches the server for every engineer
on the training. Until AI-27 lands nobody has a key, and a server that dies at startup shows up in
Claude Code as a bare "failed" with the reason in a log nobody opens. So the server always starts,
and each tool call that cannot load config returns `isError: true` naming the missing key.

### Tool contracts

Every tool carries `readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: true` — it
reads an external service, unlike `talentscout-db`. Every failure is `isError: true` and says, in
words, that nothing was concluded about events.

**`get-events`** — `{ event?, distinctId?, after?, before?, limit? }`

- `after` / `before` are ISO 8601 datetimes with an offset. Defaults: `before` = now, `after` =
  `before` − 24 h (the deprecated events endpoint's own default window — PostHog's docs say to
  "almost always include a time range"). `after >= before` is an error.
- `limit` 1–200, default 25. Event rows carry every property, and autocapture events run large;
  25 is a readable page, 200 the ceiling before a call becomes a context-window event.
- HogQL (fixed fragments; caller strings only as `values`; `limit` is a validated integer):

  ```sql
  SELECT uuid, event, distinct_id, timestamp, properties
  FROM events
  WHERE timestamp >= toDateTime({after}) AND timestamp < toDateTime({before})
    AND event = {event}              -- only when given
    AND distinct_id = {distinctId}   -- only when given
  ORDER BY timestamp DESC
  LIMIT <limit + 1>
  ```

  One extra row is fetched so truncation is detected by count rather than by trusting `hasMore`.

- Result text: a header stating the filters, the exact window and the row count (plus "truncated
  at `limit`" when cut), then a JSON array of `{ uuid, event, distinctId, timestamp, properties }`.
  Zero rows is a real answer and says so: "No events matched … between A and B."

**`check-event-fired`** — `{ event, withinMinutes }`, both required; `withinMinutes` 1–10 080 (7
days).

- HogQL: `SELECT count() AS matches, max(timestamp) AS last_seen FROM events WHERE event =
{event} AND timestamp >= now() - toIntervalMinute({withinMinutes})`. The window is measured on
  PostHog's clock, not this machine's.
- **The negative is only ever produced from a parsed zero.** `results` must be exactly one row
  whose first cell is a non-negative integer (a JSON number, or a decimal string — ClickHouse
  `UInt64`). Anything else — no rows, `null`, a non-numeric string, a missing `results` key, an
  HTML body — is a malformed-response error. `last_seen` is reported only when `matches > 0`:
  ClickHouse's `max` over zero rows returns the type's default (epoch), not `NULL`.
- Text opens with `FIRED:` or `NOT FIRED:` and ends with a JSON object carrying `fired: boolean`.
  `NOT FIRED` adds that the name match is exact and case-sensitive, and that an event captured
  moments ago may not be queryable yet.

**`get-event-definitions`** — `{ names? }` (1–50 non-empty names)

- Pages every `event_definitions` result (following `next`), then pages each event's
  `property_definitions`. Sequential — PostHog counts limits per key, and a training project has
  tens of events, not thousands.
- Result: every event as `{ name, lastSeenAt, properties: [{ name, type }] }`, sorted by name.
  When `names` is given, any requested name PostHog has no definition for is listed under
  `notDefined` — the precise answer AI-46 needs when an event was renamed.
- A `next` URL on a different origin than `POSTHOG_API_HOST` is refused rather than followed with
  the bearer token attached. More than 50 pages is an error, not a silent cut.

### Error rendering (AC 4)

| Cause                              | Kind           | Text names                                                                    |
| ---------------------------------- | -------------- | ----------------------------------------------------------------------------- |
| Key or project id unset or invalid | `config`       | the env key and what a valid value looks like                                 |
| `401`                              | `unauthorized` | `POSTHOG_PERSONAL_API_KEY`; `phx_` personal key, not the `phc_` project token |
| `403`                              | `forbidden`    | the scope this endpoint needs, and the project id                             |
| `404`                              | `not_found`    | `POSTHOG_PROJECT_ID` and `POSTHOG_API_HOST` (US vs EU)                        |
| `429`                              | `rate_limited` | PostHog's code (`throttled` / `api_queries_budget_exceeded`), `Retry-After`   |
| `400`                              | `rejected`     | PostHog's `detail` verbatim (a HogQL error lands here)                        |
| other non-2xx                      | `server_error` | the status                                                                    |
| `TypeError` from `fetch`           | `network`      | the host                                                                      |
| `TimeoutError`                     | `timeout`      | the limit (45 s)                                                              |
| 2xx, but not JSON or wrong shape   | `malformed`    | that the response could not be read — never "no events"                       |
| A `next` link on another origin    | `malformed`    | both origins; the key is not sent                                             |
| More than 50 definition pages      | `too_large`    | the endpoint; no partial list is returned                                     |

45 s covers PostHog's own worst case — up to 30 s queued plus 10 s executing. The API key never
appears in a message: it only travels in the `Authorization` header.

---

## 5. Plan (slices)

Every slice: `pnpm --filter @talentscout/mcp-posthog typecheck`, `lint` and `test` green;
`pnpm exec eslint --no-warn-ignored <file>` on each touched file (the post-tool-use hook is broken
on this machine); no regression in the §2 baseline counts.

### Slice 1 — workspace, env, and the HTTP seam

- Workspace files copied from `apps/mcp-db`; `@modelcontextprotocol/sdk` and `zod` as deps.
- `env.ts`: `POSTHOG_API_HOST` (http/https URL), `POSTHOG_PROJECT_ID` (digits),
  `POSTHOG_PERSONAL_API_KEY` (`phx_` prefix). Lazy per-key getters, `KEY: z.` inline so
  `check-env.sh` sees them.
- `posthog-api.ts`: `createPostHogApi({ loadConfig, fetch, timeoutMs })`, `PostHogApiError` with
  the §4 kinds.
- **DoD** (each red if the mapping is removed): every status in §4 maps to its kind; `Retry-After`
  is carried; `TimeoutError` and `TypeError` classify; a 2xx non-JSON body and a 2xx JSON body
  missing `results` are `malformed`; the request carries `Bearer`, `refresh: "force_blocking"` and
  a `name`; pagination follows `next` and refuses a foreign origin; the key appears in no error
  message.

### Slice 2 — HogQL and strict parsing (`queries.ts`)

- **DoD:** a hostile event name (`x' OR 1=1 --`) never appears in the query text and arrives
  intact in `values`; the count parser accepts `0`, `"0"`, `3`, `"3"` and rejects `[]`, `[[]]`,
  `[[null]]`, `[["abc"]]`, `[[-1]]`, `[[1.5]]`; an event row with `properties` as a JSON string
  or an object parses; a row of the wrong width is malformed.

### Slice 3 — the server: `check-event-fired` and `get-events`

- `InMemoryTransport` client against `createServer(api)` with a fake `fetch`.
- **DoD:** count 0 → `NOT FIRED` with `fired: false`; count 3 → `FIRED`; **every failure in §4,
  and every malformed body from slice 2, yields `isError: true` and text containing neither
  `NOT FIRED` nor `"fired": false`**; `get-events` renders rows, states the window, flags
  truncation at `limit + 1`, and rejects `after >= before`; a missing config key yields
  `isError: true` naming it.

### Slice 4 — `get-event-definitions`

- **DoD:** two pages of definitions and per-event properties render sorted; `names` filter reaches
  PostHog and unknown names land in `notDefined`; a `429` mid-walk yields `isError`, not a partial
  list.

### Slice 5 — `main.ts`, `.mcp.json`, `.env.example`, README

- `main.ts`: stdio transport, stderr-only diagnostics, exit on stdin end.
- **DoD:** spawning `pnpm --silent --filter @talentscout/mcp-posthog run mcp` and sending
  `initialize` + `tools/list` returns the three tools on stdout with nothing else on it, and a
  `tools/call` with no config returns `isError` naming the key; with every deploy key in the
  process environment and the three PostHog keys empty, `check-env.sh` (AI-133's, underneath this
  branch) exits 0, lists them as local-only, and emits no drift `WARN` (§0, decision 1).

### Slice 6 — live checklist (deferred to AI-27, not run here)

Once `.env.local` holds a real key, project id and host:

1. `get-event-definitions` with no arguments lists `$pageview` with its properties (AC 3).
2. Load any page of the app, then `check-event-fired` `{ event: "$pageview", withinMinutes: 10 }`
   → `FIRED` (proves the HogQL parses, `count()` decodes, and `force_blocking` sees fresh data).
3. `check-event-fired` `{ event: "never_fired_probe", withinMinutes: 10 }` → `NOT FIRED` (AC 2).
4. `get-events` `{ event: "$pageview" }` → rows with properties (AC 1).
5. Set the key to `phx_invalid` → every tool returns the `unauthorized` error (AC 4).

---

## 6. Decisions log

| #   | Decision                                                       | Rejected alternative                 | Why                                                                                |
| --- | -------------------------------------------------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| D1  | HogQL over `/query` for events                                 | `GET /events/`                       | PostHog marks it effectively deprecated                                            |
| D2  | `refresh: "force_blocking"` on every query                     | Default `blocking`                   | A cached zero is a false negative — the exact failure AC 2 exists to prevent       |
| D3  | Config read per call                                           | Validate at startup                  | The server is registered for everyone before anyone has a key                      |
| D4  | Negative derived only from a strictly parsed `count()`         | Treat empty `results` as zero        | An unparseable answer must never read as "did not fire"                            |
| D5  | `withinMinutes` required, no default                           | Default 10                           | The ticket says "within N minutes"; a silent default would decide N for the caller |
| D6  | `get-events` limit 25 default, 200 max; 24 h default window    | PostHog's 100-row default; no window | Full property bags are large; PostHog asks for a time range                        |
| D7  | Sequential property-definition calls                           | Parallel fan-out                     | Limits count per key; tens of events make parallelism irrelevant                   |
| D8  | Refuse cross-origin `next` URLs                                | Follow any `next`                    | Following one would send the bearer token to whatever host the response names      |
| D9  | `openWorldHint: true`                                          | Copy `talentscout-db`'s `false`      | This server talks to an external service                                           |
| D10 | Unit tests over a fake `fetch` only; live proof is a checklist | A `mcp:verify` script                | §0 question 3 — still open                                                         |
| D11 | The three keys go below `# @local-only` in `.env.example`      | Deploy keys, or left out of the file | A deploy must not need a personal API key; the keys must stay declared for drift   |

---

## 7. Risks

- **RISK-1 — event properties reach the agent's context.** Whatever PostHog holds, `get-events`
  returns. AI-45's catalog keeps candidate PII out of _its_ events, but autocapture and session
  recording capture form input outside that catalog, which is why AI-45 handed AI-27 the job of
  turning both off. If AI-27 leaves autocapture on, this tool will pipe captured form text into
  agent context.
- **RISK-2 — the HogQL and `count()` encoding are unverified live.** If either is wrong, the strict
  parser turns it into a `malformed` or `rejected` error — loud, never a false negative. Slice 6
  steps 2–3 close it.
- **RISK-3 — ingestion delay.** An event captured seconds ago may not be queryable yet. The
  `NOT FIRED` text says so; the remedy is to re-check, not to widen the window.
