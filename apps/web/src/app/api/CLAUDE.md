# `apps/web/src/app/api/` — route handler conventions

The root `CLAUDE.md` holds the rules for this folder. What follows is what the root leaves out: a
worked skeleton, the decisions the two real routes answer differently, and where agents actually
go wrong. This file loads when Claude reads any file in this directory's subtree — `status/`,
`jobs/` and `candidates/[id]/` included, even though none of them sits directly in this folder.

## A — the skeleton

Structurally adapted from `jobs/route.ts`: a `GET` with a search-param schema, plain
`Request`/`Response`, and one `NO_STORE` constant applied to every branch — `jobs` is the shape to
copy for caching. Its `400` branch is **not** copied: this skeleton's error body is the
`candidates/[id]` shape, an exported `ErrorResponse` populated with `z.treeifyError`, not `jobs`'
hand-mapped `issues` array (Section B has both deviations).

`schema.ts`

```ts
import { z } from "zod";

/** The most rows one request may return. */
export const MAX_WIDGETS_LIMIT = 100;

/** Search params accepted by `GET /api/widgets`. */
export const widgetsSearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_WIDGETS_LIMIT).default(20),
});

export type WidgetsSearchParams = z.infer<typeof widgetsSearchParamsSchema>;

/** Payload returned by every non-2xx response from this route. */
export type ErrorResponse = {
  error: string;
  issues?: unknown;
};
```

`route.ts`

```ts
import { z } from "zod";

import { widgetsSearchParamsSchema, type ErrorResponse } from "./schema";

export const dynamic = "force-dynamic";

// Applied to every branch, error responses included — a cached 400/404/500 outlives the
// condition that caused it.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: Request): Promise<Response> {
  const parsed = widgetsSearchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );

  if (!parsed.success) {
    const body: ErrorResponse = {
      error: "Invalid search parameters",
      issues: z.treeifyError(parsed.error),
    };

    return Response.json(body, { status: 400, headers: NO_STORE });
  }

  try {
    // TODO: replace with the real read; parsed.data is typed as WidgetsSearchParams.
    const widgets: unknown[] = [];

    return Response.json({ widgets }, { headers: NO_STORE });
  } catch (error) {
    console.error("GET /api/widgets failed", error);

    const body: ErrorResponse = { error: "Could not load widgets" };

    return Response.json(body, { status: 500, headers: NO_STORE });
  }
}
```

Show:

- `Request` in, `Response.json()` out — never `NextRequest`/`NextResponse`. All three real routes
  do this (`jobs/route.ts:83`, `candidates/[id]/route.ts:10-11`), which is what lets a test build
  a plain `new Request(...)` with no server (Section C).
- `safeParse` and an early `400`, before any I/O. Both route tests assert the database was never
  touched on a `400` (`jobs/route.test.ts:153`, `candidates/[id]/route.test.ts:132`).
- `try`/`catch` around the read, `console.error` with a `<METHOD> /api/<path>` prefix, and a
  generic body on the `catch` branch (`jobs/route.ts:101-114`, `candidates/[id]/route.ts:28,86-92`).

## B — the local facts

| Fact                                                                                                                                                                                                                  | Evidence                                                            |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Dynamic segments type their context with the Next 16 global `RouteContext<"/api/candidates/[id]">`                                                                                                                    | `candidates/[id]/route.ts:12`; Next docs `15-route-handlers.md:189` |
| zod 4 top-level formats — `z.uuid()`, `z.email()`, `z.url()` — not `z.string().uuid()`                                                                                                                                | `candidates/[id]/schema.ts:5`; zod `^4.4.3`                         |
| Search params arrive as strings; numeric fields need `z.coerce`, parsed via `Object.fromEntries(new URL(request.url).searchParams)`                                                                                   | `jobs/schema.ts:14`; `jobs/route.ts:84-86`                          |
| A list endpoint caps its result set with an exported `MAX_*` constant — never unbounded                                                                                                                               | `jobs/schema.ts:4,14` and its JSDoc                                 |
| Project columns at the query and map the response field by field                                                                                                                                                      | `candidates/[id]/route.ts:31,53-83`                                 |
| A `Date` becomes an ISO string at the wire boundary via `.toISOString()`                                                                                                                                              | `candidates/[id]/route.ts:65-66`                                    |
| An endpoint with no input has no `schema.ts` — the documented exception to R-A1                                                                                                                                       | `status/` has only `route.ts` + `route.test.ts`                     |
| **A fact, not a convention:** no auth scheme exists yet and no ticket owns one, so routes ship unauthenticated with `// TODO: authorization` after validation. Do not invent a scheme and do not read this as settled | `candidates/[id]/route.ts:26`                                       |
| `console.error`/`console.warn` are allowed; `console.log`/`console.debug` fail `/pre-deploy`                                                                                                                          | `.claude/skills/pre-deploy/scripts/check-console.sh`                |
| Errors use the exported `ErrorResponse` populated with `z.treeifyError`. **`jobs/route.ts` hand-maps its own `issues` array instead — a known deviation, not the shape to copy**                                      | `candidates/[id]/schema.ts:42-46` vs `jobs/route.ts:92-95`          |
| `Cache-Control: no-store` goes on **every** response, 400/404/500 included. **`candidates/[id]/route.ts` sets it on the `200` only — a known deviation**                                                              | `jobs/route.ts:15` vs `candidates/[id]/route.ts:85`                 |

## C — testing a handler

- Import `GET` through `@/` and call it directly. No HTTP server, no `next start`.
- `vi.mock("@talentscout/db/client")` built inside `vi.hoisted(...)`. **Required, not stylistic**,
  for two stacked reasons the repo already documents: `db` throws `EnvValidationError` at module
  load when `DATABASE_URL` is unset under Vitest (`candidates/[id]/route.test.ts:8-11`), and
  `vi.mock`'s factory is hoisted above every `const` in the file (`jobs/route.test.ts:6-7`).
- A dynamic segment is called as `GET(request, { params: Promise.resolve({ id }) })`
  (`candidates/[id]/route.test.ts:73-75`).
- Silence an expected log with `vi.spyOn(console, "error").mockImplementation(...)` and assert it
  was called (`jobs/route.test.ts:157-168`).
- **Give the no-leak assertions teeth:** the fixture deliberately carries fields the projection
  drops (`resumeText`, `changedBy`) so the test fails if someone later spreads the row
  (`candidates/[id]/route.test.ts:22-23,164-176`).

## D — do not

- Do not spread a database row into a response. `resumeText` is the RAG-sized body and
  `changedBy` is internal; both exist on rows the routes return.
- Do not put the error string from a caught exception into the response body — a connection error
  carries the connection string. `jobs/route.test.ts:159-165` asserts exactly this.
- Do not cast a search param instead of parsing it — they arrive as strings, so a bare cast makes
  `limit=abc` a `NaN` that reaches the query (`jobs/route.ts:84-86`, `jobs/route.test.ts:147-155`).
  Nothing is said here about request bodies: every handler in this repo is a `GET` and none calls
  `request.json()` — there is no real body-handling code yet to point at. `/api-route` already
  covers the malformed-JSON branch for the first route that needs one.
- Do not reach for `NextRequest`/`NextResponse`, `res.status().json()`, or a Pages-router shape.
- Do not scaffold an auth check that the request did not describe, and do not silently ship an
  open endpoint — leave the TODO, say so in your report, and never call the result secured.
- Do not `fetch()` this app's own API route from a Server Component — import the exported loader
  directly, the way `jobs/page.tsx` imports `loadOpenJobs` from `route.ts`
  (`apps/web/src/app/jobs/page.tsx:5`).
- Do not add `export const revalidate` / `fetchCache` / `dynamicParams` to a handler as "cache
  safety". They are unrelated to the two things R-A6 asks for.
