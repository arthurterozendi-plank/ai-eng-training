---
name: api-route
description: Scaffold a Next.js App Router API route in this repo — route.ts handler, schema.ts with Zod request validation and response types, and a co-located route test, with correct HTTP status codes and error handling. Use when asked to create, scaffold, or add an API route or endpoint.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Scaffold an API route

Create one endpoint directory under `apps/web/src/app/api/`, following this repository's conventions.
Handler skeleton only — do not invent business logic, database calls, or an auth scheme the
caller did not describe.

## Usage

```
/api-route <name> [--methods=GET,POST]
```

- `<name>` — the route segment. Accepts nesting (`admin/users`) and dynamic segments
  (`users/[id]`). Segments are kebab-case.
- `--methods` — comma-separated HTTP methods to scaffold. **Defaults to `GET` alone** when the
  flag is absent.

If `<name>` is missing, ask for it. Do not guess a route path.

## Step 1 — Read the conventions

Read `CLAUDE.md` first — it is the source of truth. Then read the existing endpoint
`apps/web/src/app/api/status/route.ts` and `route.test.ts` for the house style: plain `Request`/`Response`
(not `NextRequest`), `Response.json()`, `dynamic = "force-dynamic"` plus `Cache-Control: no-store`
on live data.

Read `apps/web/src/env.ts` if the route needs configuration — it is the only module in this
application allowed to read environment variables. Database connection strings are not there:
`@talentscout/db` validates those in `packages/db/src/env.ts`.

## Step 2 — Derive paths and check for collisions

For `<name>` = `users`:

| File                                       | Purpose                                      |
| ------------------------------------------ | -------------------------------------------- |
| `apps/web/src/app/api/users/route.ts`      | Handlers only                                |
| `apps/web/src/app/api/users/schema.ts`     | Zod request schemas + request/response types |
| `apps/web/src/app/api/users/route.test.ts` | Co-located Vitest suite                      |

**If `route.ts` already exists, stop and report it.** Adding a method to an existing route is a
different job — ask before editing someone else's handler.

## Step 3 — Write `schema.ts`

Zod schemas and every type inferred from them live here. `route.ts` imports from `./schema` —
a sibling relative import, which is correct; only directory-crossing relative imports are banned.

```ts
import { z } from "zod";

/** Query parameters accepted by `GET /api/users`. */
export const listUsersQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
});

export type ListUsersQuery = z.infer<typeof listUsersQuery>;

/** Success payload of `GET /api/users`. */
export type ListUsersResponse = {
  items: unknown[];
  total: number;
};

/** Payload returned by every non-2xx response from this route. */
export type ErrorResponse = {
  error: string;
  issues?: unknown;
};
```

For a method with a body, add a body schema alongside:

```ts
/** Body accepted by `POST /api/users`. */
export const createUserBody = z.object({
  email: z.email(),
  name: z.string().min(1).max(200),
});

export type CreateUserBody = z.infer<typeof createUserBody>;
```

Notes:

- zod 4 is installed. Top-level formats are `z.email()`, `z.url()`, `z.uuid()` — **not**
  `z.string().email()`, which is deprecated in v4.
- Query params arrive as strings, so numeric and boolean query fields need `z.coerce`.
- Replace `unknown[]` with the real element type as soon as the caller tells you the shape.
  Leaving `unknown` is honest; inventing a `User` type they never described is not.

## Step 4 — Write `route.ts`

Type handler params as `Request`, not `NextRequest` — it matches the existing `status` route,
and it lets the test construct a plain `new Request(...)`.

```ts
import { z } from "zod";

import { listUsersQuery, type ErrorResponse, type ListUsersResponse } from "./schema";

// Live data — without both of these Next prerenders the route at build time and serves it
// stale. Remove them only if the response is genuinely static.
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const parsed = listUsersQuery.safeParse(Object.fromEntries(searchParams));

  if (!parsed.success) {
    const body: ErrorResponse = {
      error: "Invalid query parameters",
      issues: z.treeifyError(parsed.error),
    };

    return Response.json(body, { status: 400 });
  }

  try {
    // TODO: replace with the real read. `parsed.data` is typed as ListUsersQuery.
    const payload: ListUsersResponse = { items: [], total: 0 };

    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/users failed", error);

    const body: ErrorResponse = { error: "Internal server error" };

    return Response.json(body, { status: 500 });
  }
}
```

A body-carrying method parses JSON defensively, because a malformed body makes `request.json()`
throw:

```ts
export async function POST(request: Request): Promise<Response> {
  let raw: unknown;

  try {
    raw = await request.json();
  } catch {
    const body: ErrorResponse = { error: "Request body must be valid JSON" };

    return Response.json(body, { status: 400 });
  }

  const parsed = createUserBody.safeParse(raw);

  if (!parsed.success) {
    const body: ErrorResponse = {
      error: "Invalid request body",
      issues: z.treeifyError(parsed.error),
    };

    return Response.json(body, { status: 400 });
  }

  try {
    const payload: CreateUserResponse = { id: crypto.randomUUID() };

    return Response.json(payload, { status: 201 });
  } catch (error) {
    console.error("POST /api/users failed", error);

    const body: ErrorResponse = { error: "Internal server error" };

    return Response.json(body, { status: 500 });
  }
}
```

For a dynamic segment, **`params` is a Promise in Next 16** and must be awaited, then validated
like any other input:

```ts
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const parsedId = z.uuid().safeParse(id);
  // ...
}
```

### Status codes

| Code  | Use                                                                    |
| ----- | ---------------------------------------------------------------------- |
| `200` | Successful read                                                        |
| `201` | Resource created — set a `Location` header when the resource has a URL |
| `204` | Success with no body — return `new Response(null, { status: 204 })`    |
| `400` | Malformed JSON, or input that failed Zod validation                    |
| `401` | No valid credentials                                                   |
| `403` | Authenticated but not permitted to act on this resource                |
| `404` | Resource does not exist                                                |
| `409` | Conflict with current state (duplicate key, version mismatch)          |
| `422` | Syntactically valid but semantically impossible                        |
| `500` | Unexpected failure                                                     |

### Rules that are not negotiable

- **Parse every input.** Body, search params, and dynamic segments. A route handler is a public
  HTTP endpoint — anyone can call it with any payload. Never cast instead of parsing.
- **Never leak internals.** A `500` returns a fixed generic string. The exception goes to
  `console.error` server-side, never into the response. No stack traces, no ORM messages, no
  internal identifiers.
- Echoing Zod issues on a `400` is fine — that is the caller's own input described back to them.
- **Authorisation is not scaffolded.** If the caller mentioned auth, add the check and fail
  `401`/`403` before doing any work. If they did not, add a `// TODO: authorization` line
  immediately after validation and flag it in your report. Do not silently ship an open endpoint.
- `console.error` and `console.warn` are allowed; `console.log` is not — `/pre-deploy` fails on it.

## Step 5 — Write `route.test.ts`

Import through the `@/` alias, as the existing route test does.

```ts
import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/users/route";
import type { ErrorResponse, ListUsersResponse } from "@/app/api/users/schema";

describe("GET /api/users", () => {
  it("returns a page of results with default paging", async () => {
    const response = await GET(new Request("http://localhost/api/users"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");

    const body = (await response.json()) as ListUsersResponse;

    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it("rejects an out-of-range limit with 400", async () => {
    const response = await GET(new Request("http://localhost/api/users?limit=999"));

    expect(response.status).toBe(400);

    const body = (await response.json()) as ErrorResponse;

    expect(body.error).toBe("Invalid query parameters");
  });
});
```

Cover, per scaffolded method: the success path, **and at least one validation failure asserting
`400`**. For a body method also assert the malformed-JSON branch — that is the one reviewers most
often find untested.

## Step 6 — Verify

```bash
pnpm typecheck && pnpm --filter @talentscout/web exec vitest run src/app/api/<name>
pnpm format
```

Fix anything red before reporting.

## Report

List the three files, the HTTP methods scaffolded, and the typecheck/test result. Then state
explicitly, in one line each:

- Where you left a `TODO` (the real read/write, and authorisation if unspecified)
- Any type you left as `unknown` because the caller did not describe the shape
