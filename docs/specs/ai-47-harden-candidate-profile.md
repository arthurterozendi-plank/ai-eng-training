# AI-47 — Harden one feature with error handling and health checks for recruiters relying on it daily

**Linear:** AI-47 · Type: Feature · Parent: AI-10 (Day 5)
**Branch:** `arthurterozendi/ai-47-harden-one-feature-with-error-handling-and-health-checks-for`
(isolated worktree, based on `origin/main` at `e46eee5`)
**Status:** implemented and committed locally. Operator runbook:
[`docs/runbooks/candidate-profile.md`](../runbooks/candidate-profile.md).

---

## 1. Problem statement

**User story:** As a recruiter, I want a failing page to tell me what happened and what to do next
so that a transient error does not look like lost data.

**The feature:** the candidate profile, meaning the `/candidates/[id]` page and
`GET /api/candidates/[id]`. The user chose it over `/jobs` because it had no failure handling at
all. If the database failed, the page threw straight into Next's default error page. The API's
`500` carried no correlation id, and its error responses were cacheable.

### Decisions settled before planning (user, 2026-10-16)

| Question                   | Answer                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Which feature              | Candidate profile, page and API                                                           |
| Database timeout           | **5 seconds**, then fail with a clear timeout message                                     |
| Server-side logging        | One structured `console.error` JSON-line logger in `apps/web/src/lib/`, no new dependency |
| Correlation id on the page | Yes: a small "Reference: `<id>`" line in the fallback, an opaque random id                |

### In scope

- A shared loader in `src/lib/` that both the page and the route use, so the timeout covers both.
- A 5 s deadline on every database read this feature makes.
- An inline fallback on the page for load failures, plus a segment `error.tsx` boundary for
  anything else.
- A structured logger and a correlation id that appear in the log line, the API body and the
  fallback.
- `/api/status` extended with a bounded database check.
- Failure-path tests, a README entry, and corrections to the module `CLAUDE.md` citations this
  diff moves.
- The ticket's short doc on how to tell the feature is broken, as the runbook
  `docs/runbooks/candidate-profile.md`.

### Out of scope (from the ticket)

- Applying the pattern to every feature. `/jobs` keeps its own inline fallback untouched.
- Alerting (AI-122), retries and circuit breakers.

### Acceptance criteria (verbatim from the ticket)

1. Given the database is unreachable, when a recruiter loads the feature, then they see an
   explanatory fallback with a retry, not a blank screen.
2. Given a server error, when it is returned to the client, then the response carries a generic
   message while the detail is logged server-side with a correlation id.
3. `/api/status` reports unhealthy when the database is down and healthy when it is up.
4. Tests cover the failure path, not only the happy path.
5. Edge case: a slow database produces a timeout with a clear message rather than a hung request.

---

## 2. Verified facts this plan rests on

Each fact below was checked in this worktree on 2026-10-16, not recalled.

- **Next 16.3.1's `error.tsx` takes `retry`, not `reset`.**
  `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/error.md`: "`v16.3.0`
  `retry` prop became stable". `retry()` re-fetches and re-renders the segment. `reset()` only
  clears the error state, and the doc says "In most cases, you should use `retry()`".
- **A Server Component error reaches the boundary stripped.** The same doc says that in
  production, errors forwarded from Server Components "show a generic message with an
  identifier", the `digest`, which is meant "to match the corresponding server-side logs". So
  `error.message` can never be shown to a recruiter. In development it carries the real message.
- **A pre-set `digest` is preserved, but that is undocumented.**
  `next/dist/server/app-render/create-error-handler.js:79-81` ("If the error already has a digest,
  respect the original digest"). The design does **not** depend on this (§3.3).
- **Drizzle's relational query cannot be cancelled from the caller.**
  `drizzle-orm@0.45.2/postgres-js/session.js` awaits `client.unsafe(query, params).values()`
  internally, so the postgres.js `Query` never reaches us.
- **Cancelling a postgres.js query is unsafe as a timeout action.** `postgres@3.4.9`
  `src/query.js:52-53`: `cancel()` runs
  `this.canceller && (this.canceller(this), this.canceller = null)`, which **discards** the
  promise `src/index.js:350` returns. That promise rejects when the cancel connection fails
  (`src/connection.js:145-153`), which is exactly when the database is in trouble. The result
  would be an unhandled rejection.
- **postgres.js defaults:** `connect_timeout: 30` seconds (`src/index.js:453`). `idle_timeout` is
  `null`, and there is no per-query timeout option. A blackholed host therefore holds a request for
  30 s unless the app imposes its own deadline.
- **A connection error message names the host and port.** `src/errors.js` `connection()` builds
  `'write ' + code + ' ' + host + ':' + port`. That is why the client message stays generic.
- **`db.$client` is the raw postgres.js `Sql`, typed.** `drizzle-orm/postgres-js/driver.d.ts:21-23`
  declares `PostgresJsDatabase<TSchema> & { $client: TClient }`, so `/api/status` can run
  `select 1` without `apps/web` taking a direct `drizzle-orm` dependency.
- **The page and the route ran the identical query.** Both used `columns: { resumeText: false }`
  and the same `with` tree, duplicated. `api/CLAUDE.md` §D says a loader shared by a page and a
  route belongs in `src/lib/`.
- **`candidates/[id]/route.ts` set `no-store` on the `200` only.** `api/CLAUDE.md` §B lists it as a
  known deviation. A cached `500` outlives the outage it reports, which is this ticket's failure
  mode.
- **`console.error` is allowed and `console.log` is not.**
  `.claude/skills/pre-deploy/scripts/check-console.sh`.
- **Baseline on this machine:** Node **v22.20.0**. On bare `origin/main`,
  `pnpm --filter @talentscout/web test` is **93/93 passing, 11 files**, and typecheck, lint and
  `prettier --check .` are all green. The 48 localStorage failures in `repo-baseline-reds` are a
  Node 26 artefact and **do not reproduce here**.

---

## 3. Design

### 3.1 The deadline: `src/lib/database-timeout.ts`

`withDatabaseTimeout(operation)` races the operation against a 5 000 ms timer and rejects with
`DatabaseTimeoutError` if the timer wins. It clears the timer when the operation settles first.

The timer is **app-level, not Postgres-side**. It is the only mechanism that bounds the whole
wait a recruiter actually sees: the pool queue, the connect phase (up to 30 s by default) and the
statement itself.

- `statement_timeout` bounds the statement only. It also needs a change to the shared
  `packages/db` client, which affects every caller (§8).
- `connect_timeout` bounds the connect phase only.
- Cancelling the query is unsafe (§2).

The **known limitation** is that an abandoned query keeps its pooled connection until Postgres
finishes it or the connect attempt times out. The request is released; the connection is not.
`Promise.race` subscribes to the abandoned operation, so its later rejection is handled and never
surfaces as an unhandled rejection.

### 3.2 The log line and the correlation id: `src/lib/logger.ts`

- `createCorrelationId()` returns a `crypto.randomUUID()`. It is opaque and carries no internal
  detail.
- `logServerError(message, { correlationId, error, ...context })` writes **one JSON line** via
  `console.error`. The line holds `level`, `message`, `correlationId`, `time`, an `error` object
  (`name`, `message`, string `code` when present, `stack`) and any extra context, such as
  `candidateId`.
- The detail lives only in the log line. The client gets the id.

### 3.3 Two fallbacks, one look: `src/components/error-fallback/`

`ErrorFallback` renders a `role="alert"` block containing the page heading, the explanatory copy,
an optional `Reference: <id>` line and an action slot. It is a Server Component, and the boundary
imports it as a client module because it holds nothing server-only.

| Failure                                  | Caught by                                  | Reference shown       | Retry                                            |
| ---------------------------------------- | ------------------------------------------ | --------------------- | ------------------------------------------------ |
| Database unreachable or erroring on load | `page.tsx` `try/catch` around the loader   | our `correlationId`   | plain `<a href>` to the same URL, as on `/jobs`  |
| Database slower than 5 s                 | same, with timeout-specific copy           | our `correlationId`   | same                                             |
| Anything else thrown while rendering     | `candidates/[id]/error.tsx` boundary       | Next's `error.digest` | `retry()`, documented as re-fetching the segment |
| Unknown candidate                        | `notFound()`, called **outside** the `try` | none (404)            | none                                             |

The load failure is handled inline rather than thrown to the boundary for three reasons:

1. In production the boundary cannot tell a timeout from an outage (§2: the message is stripped).
2. Carrying our id through a thrown error would need the undocumented digest-preservation
   behaviour.
3. `/jobs` already established the inline pattern.

The boundary still earns its place. It turns a render bug into an explanatory fallback with a
retry instead of Next's default error page. The `digest` it shows is the one Next documents as
matching its own server log.

`notFound()` throws a framework error. Calling it inside the `try` would turn every 404 into "could
not load", so it stays outside.

### 3.4 `GET /api/candidates/[id]`

- It uses the shared loader, so the deadline applies.
- **`Cache-Control: no-store` goes on every branch** (400/404/500), which removes the known
  deviation.
- A failure returns status `500` with `{ error, correlationId }`, logged through `logServerError`
  with the same id and the `candidateId`. A timeout gets `error: "Timed out loading candidate"`.
  Anything else stays `"Internal server error"`.
- The status stays **500 for both**, because the root `CLAUDE.md` lists the status codes and `503`
  and `504` are not among them (§8 has the option to change that).
- `ErrorResponse` gains an optional `correlationId`.

### 3.5 `GET /api/status`

- It runs `select 1` through `db.$client` (the pooled `DATABASE_URL`, the same path the feature
  uses), bounded by the same 5 s deadline.
- It returns `200` with `{ status: "ok", database: "ok", … }` or **`503`** with
  `{ status: "unhealthy", database: "unreachable" | "timeout", correlationId, … }`, plus a log
  line.
- **Why 503 and not the root's 500.** `500` means "this handler failed unexpectedly". Here the
  handler succeeded at its job, which is reporting a dependency down. Load balancers and uptime
  monitors key on the status code, and `503 Service Unavailable` is the code that says "temporarily
  unable, come back". A `500` would be indistinguishable from the status route itself crashing.
- `force-dynamic` and `no-store` are kept on both outcomes. A cached "healthy" during an outage is
  the worst possible answer.
- The import of `@talentscout/db/client` is static, like every other database route. An invalid
  `DATABASE_URL` therefore fails the module load (a 500 from Next), which a monitor also reads as
  unhealthy. §6 has the reasoning.

---

## 4. Files

| File                                                                  | Change                                                                    |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `apps/web/src/lib/database-timeout.ts` + test                         | new: `DATABASE_TIMEOUT_MS`, `DatabaseTimeoutError`, `withDatabaseTimeout` |
| `apps/web/src/lib/logger.ts` + test                                   | new: `createCorrelationId`, `logServerError`                              |
| `apps/web/src/lib/candidates.ts`                                      | new: `loadCandidateProfile` (the de-duplicated query)                     |
| `apps/web/src/components/error-fallback/` + test                      | new: `ErrorFallback`                                                      |
| `apps/web/src/app/candidates/[id]/page.tsx` + new test                | loader, inline fallback, `notFound()` kept outside the `try`              |
| `apps/web/src/app/candidates/[id]/error.tsx` + test                   | new: segment boundary                                                     |
| `apps/web/src/app/api/candidates/[id]/route.ts`, `schema.ts`, test    | loader, correlation id, timeout message, `no-store` everywhere            |
| `apps/web/src/app/api/status/route.ts` + test                         | database check, `503` when unhealthy                                      |
| `README.md`                                                           | failure-handling decisions; `/api/status` contract                        |
| `apps/web/src/app/api/CLAUDE.md`, `apps/web/src/components/CLAUDE.md` | citations this diff moves; the fixed deviation                            |
| `docs/runbooks/candidate-profile.md`                                  | new: how to tell the feature is broken                                    |

No new dependency, no new env key, no `packages/db` change.

---

## 5. Test plan (failure paths first)

Each test is aimed at the failure it names, not at the mechanism. The question asked of each one
was "would this pass with the feature deleted?"

| Test                                                                                                                                                                               | Fails if…                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `database-timeout`: still pending at 4 999 ms, `DatabaseTimeoutError` at 5 000 ms (fake timers)                                                                                    | the deadline is removed or mis-set                             |
| `database-timeout`: the operation's own rejection propagates unchanged; no timer is left behind                                                                                    | a failure is mislabelled as a timeout, or a timer leaks        |
| `logger`: one parseable JSON line carrying id, message, error name/message/code, context                                                                                           | the line is unstructured or loses the id                       |
| page: loader rejects (`ECONNREFUSED`-shaped) → alert with copy, `Reference: <id>`, "Try again" link to the same URL; the logged id equals the shown id; the detail is not rendered | AC 1 or AC 2 regress                                           |
| page: loader never settles → after 5 000 ms, timeout copy                                                                                                                          | AC 5 regresses (the test hangs and fails without the deadline) |
| page: no row → rejects with the `notFound()` error, nothing logged                                                                                                                 | the `try` swallows `notFound()`                                |
| `error.tsx`: digest shown as the reference, raw `error.message` not rendered, the button calls `retry` once                                                                        | the boundary leaks detail or cannot recover                    |
| API: rejection → `500 {error: "Internal server error", correlationId}`, logged id equals body id, the detail is absent from the body, `no-store`                                   | AC 2 regresses                                                 |
| API: never settles → after 5 000 ms, `500` `"Timed out loading candidate"`, `no-store`                                                                                             | AC 5 regresses for API callers                                 |
| API: `400` and `404` carry `no-store`                                                                                                                                              | the deviation returns                                          |
| status: up → `200 ok/ok`; rejects → `503 unhealthy/unreachable` with the id logged; never settles → `503 unhealthy/timeout`; `no-store` on all                                     | AC 3 regresses                                                 |

**What a fake cannot prove.** The fakes cannot prove that a real postgres.js pool against a
genuinely stopped or blackholed Postgres produces these outcomes. That needs a live run (§7).

---

## 6. Assumptions and decisions log

1. **App-level deadline, no Postgres-side timeout.** Reasoned in §3.1. The shared-client change is
   §8's open question.
2. **Inline fallback plus boundary**, rather than throwing everything to `error.tsx`. Reasoned in
   §3.3.
3. **`/api/status` returns 503 when unhealthy.** Reasoned in §3.5.
4. **The candidate route stays at 500 on timeout**, following the root's code list. This is a
   deliberately conservative reading, flagged in §8.
5. **The `/api/status` import is static.** A dynamic import would make a bad `DATABASE_URL` report
   as a JSON 503 rather than a bare 500. Every other database route imports statically, and a
   monitor treats both as unhealthy, so the extra mechanism was not worth it.
6. **The `ErrorFallback` heading is an `<h1>`.** Both callers replace the page's whole content, and
   the candidate page otherwise has no `<h1>` when the profile fails to render.
7. **The operator doc lives in a new `docs/runbooks/` folder** (user, 2026-10-16). It is not kept in
   this spec, which records a design at the time it was built, nor in the README, which records
   decisions rather than procedures. AI-122 (production hardening) extends the folder.

---

## 7. Definition of Done

- [x] AC 1: covered by the page test for a rejected load. Live check:
      `pnpm --filter @talentscout/web dev` with Postgres stopped, then open
      `/candidates/<seeded id>`. **Not run here** (no local Supabase in this worktree; never
      reading `.env.local`).
- [x] AC 2: covered by the API and page tests matching the logged id to the returned/shown id.
- [x] AC 3: covered by the status route tests for all three outcomes. Live check:
      `curl -i localhost:3000/api/status` with Postgres up, then stopped. **Not run here**, same
      reason.
- [x] AC 4: §5. Every new test targets a failure path except the two sanity "up/success" cases.
- [x] AC 5: covered by the timeout tests on the page, the API and status (fake timers).
- [x] Measured 2026-10-16 (Node v22.20.0), workspace scripts run directly rather than through
      Turbo. `pnpm --filter @talentscout/web typecheck` and `lint` are clean.
      `pnpm --filter @talentscout/web test` reports **119/119 passing, 16 files** (baseline 93/11).
      `pnpm --filter @talentscout/db test` reports 106/106 (untouched). `pnpm exec prettier --check .`
      is clean.
- [x] Each key property was broken on purpose and the suite went red each time:
  - with the deadline removed, the 4 timeout tests fail;
  - with `notFound()` moved inside the `try`, the 404 test fails;
  - with a fresh id in the API body instead of the logged one, 2 tests fail;
  - with `200` returned while unhealthy, 2 tests fail.
- [x] `/pre-deploy`'s `check-console.sh` fails, but only on `apps/mcp-db/src/read-only.ts:23`.
      That line is a JSDoc mention of `console.log` that already exists on `origin/main`, so it is
      a baseline red, not this diff.
- [x] The operator doc is in its permanent home:
      [`docs/runbooks/candidate-profile.md`](../runbooks/candidate-profile.md).

---

## 8. Open questions

1. **Should Postgres also enforce the timeout?** `statement_timeout` / `connect_timeout` on the
   shared client in `packages/db/src/client.ts` would release the abandoned statement and
   connection, not just the request. It affects every `db` caller, including future long
   analytics reads (AI-63), so it is not this ticket's call. Separately, Supabase's transaction
   pooler documents `prepare: false` for postgres.js, and `client.ts` does not set it. That was
   noticed here, not changed.
2. **`503`/`504` for the candidate API?** They would be more precise than `500` for unavailable
   and timeout. Adopting them adds codes to the root `CLAUDE.md` list for every route.
