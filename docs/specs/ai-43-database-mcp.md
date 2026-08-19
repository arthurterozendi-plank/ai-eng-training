# AI-43 — Expose the TalentScout database over MCP for engineers querying data mid-feature

**Linear:** AI-43 · Type: Chore · Parent: AI-10 · Milestone: Week 1 — Use AI: Workflow
**Depends on:** AI-26, AI-34
**Branch:** `arthurterozendi/ai-43-expose-the-talentscout-database-over-mcp-for-engineers`
(worktree `ai-eng-training-ai-43`, based on `origin/main` at `936b2d1`)
**Status:** planned — no RED escalations; all eight slices proceed. Hardened three times
(`CHANGES_REQUESTED` -> revised each round); dispositions at the end of §6.

---

## 0. Escalations (RED — blocking, need a human)

**None. Proceeding autonomously.** Nothing in this ticket is a one-way door: it adds one workspace,
one `.mcp.json` entry and one README edit, and the server it builds is incapable of writing to the
database by construction (§2, land-mines 1–2). Every judgement call is logged in §6 and every one of
them is reversible by deleting a directory.

Two things that look like escalations and are deliberately not, recorded so review can disagree:

**Not escalated — candidate PII reaches an LLM context.** `candidates` holds 60 rows of names,
emails and phone numbers, and this server's entire purpose is to pipe them into an agent's context.
That is the ticket, stated in the user story, and the rows are **synthetic seed data on a local
Supabase at `127.0.0.1:54322`** — verified: `.env.local` in this worktree is byte-identical to the
committed `.env.example`, and both point at the local instance. Escalating "may the agent read the
demo data you asked it to read" would be theatre. **The trigger that changes this answer:** the
moment `DIRECT_DATABASE_URL` is pointed at a database holding real candidates, this decision must be
re-taken before the server is used. That is why §5 slice 6 makes the server print its target host
and database to stderr on every start, and why the README says so in plain words. See RISK-1.

**Not escalated — CLAUDE.md's "Ask rather than assume" versus deciding here.** The repository's
working agreement says to ask about every choice the request does not settle, including reversible
ones, and to _batch the questions upfront and ask them before starting_. This document **is** that
batch: §6 is the question list with a recommended answer and a rejected alternative attached to
each, published before any code is written and reviewed adversarially before implementation. That
satisfies the rule's purpose — no silent surprises, one round trip instead of thirteen. It would not
satisfy it if §6 were thin, so it is not.

---

## 1. Problem statement

**User story:** As an engineer on the training, I want Claude Code to query the database directly so
that it writes features against the real schema and real row shapes instead of guessing at them.

An agent that cannot see the database invents column names. It reads
`packages/db/src/schema/applications.ts`, sees `stageChangedAt`, and writes `stage_changed_at` or
`stageChangedAt` into raw SQL with a coin flip. It cannot know that `jobs` has 8 rows and
`application_stage_transitions` has 299, so it cannot judge whether a query it just wrote is
plausible. And it cannot see anything the Drizzle files do not describe — this repository has a
hand-written migration (`packages/db/drizzle/0001_pipeline-stages-seed-and-triggers.sql`) carrying
triggers and seeded reference rows that appear in no schema object at all.

This is the first MCP server in the programme built from scratch, and the one with the most
immediate payoff.

### In scope

- A new workspace `apps/mcp-db` (`@talentscout/mcp-db`): an `@modelcontextprotocol/sdk` server over
  **stdio**, with tools `query`, `schema` and `describe-table`, and a browsable `tables` resource.
- Zod input schemas on every tool.
- Read-only enforcement by the **Postgres server**, not by prompt instruction (§2).
- Registration in the repository's existing root **`.mcp.json`**.
- A live-database verification script, `pnpm mcp:verify`, that proves the read-only matrix.
- README edits recording the decisions (`CLAUDE.md` → "Record project decisions in the README").

### Out of scope

- **Writes of any kind.** Not behind a flag, not behind a confirmation. There is no code path.
- The PostHog MCP server — AI-44.
- Remote transport (HTTP/SSE), authentication, production exposure.
- A dedicated read-only Postgres role, RLS policies, or any migration — those belong to AI-26 and
  are unnecessary here (§2, land-mine 3).
- Prompts, sampling, completions, MCP resource subscriptions.
- Any change to `packages/db`'s runtime client, schema or migrations. Two documentation-only
  corrections are in scope and land in slice 8: one stale code comment in
  `packages/db/src/schema/relations.ts`, and the `.env.example` comment that this ticket falsifies.
  No key, no schema, no runtime behaviour changes in that package.

### Acceptance criteria (verbatim from the ticket)

1. Given a question about the data, when Claude Code is asked mid-feature, then it answers from a
   real query rather than from the schema file.
2. Given a SQL statement that writes, when `query` receives it, then it is rejected — enforced by a
   read-only connection, not by prompt instruction.
3. `schema` returns tables, columns, types and relationships; `describe-table` adds row count and
   sample rows.
4. The `tables` resource lists every table and is browsable.
5. Edge cases / error states handled: a malformed query returns the database error as usable text,
   and a huge result set is truncated with the truncation stated.

### AC → slice traceability

| AC  | Satisfied by   | Mechanically checked by                                                                                                                                                                      |
| --- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Slices 3, 4, 6 | Slice 7 `pnpm mcp:verify` — `select count(*) from candidates` returns **60**, a number present in no file in the repository                                                                  |
| 2   | Slices 1, 3    | Slice 1 unit test (reset + preamble + protocol flag); **slice 7 is the real proof** — the write matrix, the statement-splitting matrix and the GUC-poisoning case, each rejected by Postgres |
| 3   | Slice 4        | Slice 4 unit tests over fixed catalog rows; slice 7 asserts 7 tables / 71 columns / 10 FKs / 6 enums against the live database                                                               |
| 4   | Slice 5        | Slice 5 in-memory `client.listResources()` + `readResource()`; slice 7 reads it over real stdio                                                                                              |
| 5   | Slices 2, 3    | Slice 2 unit tests assert the header carries shown/total/cap plus the off-by-one boundary; slice 7 asserts real Postgres error text for four bad queries                                     |

**AC 1 needs a human in the loop and says so.** "Claude Code is asked mid-feature" cannot be
asserted by a script. What §5 slice 7 _can_ assert — and does — is the property AC 1 is really
about: the answer comes from the database and not from a file. `count(*) from candidates` = 60 is
the chosen witness because that number is written down nowhere in the repository; a schema-file
answer cannot produce it.

---

## 2. Verified facts this plan rests on

Every claim below was executed on this machine on 2026-08-19, against the live local database and
against `@modelcontextprotocol/sdk@1.30.0` installed in a scratch package built to this
repository's exact compiler options. None is recalled.

**Toolchain.** node `v22.20.0`, pnpm `11.5.0`, zod `4.4.3` installed, TypeScript `5.9.3`. No
`.npmrc`; `pnpm config get minimumReleaseAge` → `undefined`, so a fresh dependency does not stall.

**`@modelcontextprotocol/sdk@1.30.0` is already in `pnpm-lock.yaml`** — correcting the brief. It is
a **transitive** dependency of `shadcn@4.18.0` (an `apps/web` devDependency), pinned there as
`@modelcontextprotocol/sdk: 1.30.0(zod@3.25.76)`. It is not a direct dependency of any workspace.
Consequences: the tarball is already in the pnpm store so the install is cheap, and adding it
against this repository's zod 4 will produce a **second** peer-resolved variant in the lockfile
alongside the shadcn one. That is normal pnpm behaviour, and slice 1's DoD asserts both entries
exist so the shadcn resolution is not silently disturbed. Its peer range is `zod: ^3.25 || ^4.0`, so
zod 4.4.3 satisfies it; `engines.node` is `>=18`.

**The database is live and seeded** (local Supabase, `127.0.0.1:54322`), and the catalog queries in
§4 were run against it:

| table                           | columns | rows |
| ------------------------------- | ------- | ---- |
| `jobs`                          | 12      | 8    |
| `candidates`                    | 13      | 60   |
| `applications`                  | 11      | 90   |
| `application_stage_transitions` | 8       | 299  |
| `interviews`                    | 12      | 43   |
| `notes`                         | 9       | 120  |
| `pipeline_stages`               | 6       | 7    |

7 tables, 71 columns, 27 constraints of which **10 are foreign keys**, and **6 enum types**
(`application_source`, `employment_type`, `interview_kind`, `interview_recommendation`,
`interview_status`, `job_status`). The whole column catalog serialises to **10 412 bytes** — the
`schema` tool never needs truncation.

### LAND-MINE 1 — `BEGIN READ ONLY` alone is **not** enough. A payload starting `commit;` escapes it.

This is the single most important finding in this document, and it inverts the brief's conclusion.
`BEGIN READ ONLY` was measured to reject `INSERT`/`UPDATE`/`DELETE`/`CREATE`/`DROP` with SQLSTATE
`25006`, exactly as reported. But postgres.js's `sql.unsafe(str)` defaults to the **simple query
protocol** when no parameters are passed — verified in the installed source,
`node_modules/postgres/src/index.js:123`:

```js
simple: "simple" in options ? options.simple : args.length === 0;
```

The simple protocol permits multiple statements in one round trip, and `COMMIT` ends the read-only
transaction, dropping the session into autocommit. Measured:

```
statement: "commit; create temp table probe_escape (a int)"
result:    OK  (the table was created; only a WARNING 25P01 "there is no transaction in progress")
```

The write succeeded. A read-only guarantee that a nine-character prefix defeats does not satisfy
AC 2. Two fixes were measured. **Both are adopted, but they are not peers** — see the correction
below, which came out of harden round 1.

| Layer                                                                 | Effect on `commit; create temp table …`                           | Effect on honest SQL  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------- |
| **(a)** `sql.unsafe(stmt, [], { simple: false })` — extended protocol | `42601 cannot insert multiple commands into a prepared statement` | none; `select 1` fine |
| **(b)** connection option `-c default_transaction_read_only=on`       | `25006 cannot execute CREATE TABLE in a read-only transaction`    | none                  |
| (a) + (b) + `BEGIN READ ONLY`                                         | rejected twice over                                               | none                  |

Layer (a) is the primary defence: the extended query protocol makes Postgres refuse to _parse_ more
than one statement per message, so statement-splitting attacks stop existing. Also measured under
(a)+(b): `select 1; select 2` → `42601`; `do $$ begin create temp table t (a int); end $$` →
`25006` (PL/pgSQL does not escape); `set transaction read write` returns OK but is
transaction-scoped and each tool call opens its own transaction, so it cannot compound.

**This is why no new Postgres role and no migration are needed** — the guarantee is a property of
how the connection is opened, not of who opens it.

### LAND-MINE 1b — layer (b) is not belt-and-braces by itself. One `SET` disarms it permanently.

An earlier draft of this document claimed layer (b) meant the guarantee "degrades instead of
vanishing" if the extended-protocol flag were lost. **That claim was wrong, and the correction is
load-bearing.** Re-measured against the live database, one pool, `max: 1`:

| #   | call                                                            | protocol | result                                                                                   |
| --- | --------------------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- |
| 1   | `commit; create temp table pwn (a int)` on a fresh connection   | simple   | `25006` — layer (b) holds                                                                |
| 2   | `set session default_transaction_read_only = off`               | extended | **OK** — accepted inside `BEGIN READ ONLY`, and it **persists on the pooled connection** |
| 3   | `commit; create temp table pwn (a int)` on that same connection | simple   | **OK — the table was created**                                                           |

`SET SESSION` is accepted inside the read-only transaction and outlives it, so a single
ordinary-looking `query` call permanently disarms layer (b) for every later call on that
connection. Layer (b) is therefore **not** an independent guarantee; it is a fallback that is only
worth anything while nobody has issued that `SET`.

Two further measurements decide the fix:

- **The primary guarantee is untouched by the poisoning.** With the GUC forced `off`, layer (a)
  still rejects everything: `insert into jobs …` → `25006` (`BEGIN READ ONLY` is explicit and
  transaction-scoped, independent of the GUC) and `commit; create temp table …` → `42601`. Losing
  layer (b) does not weaken AC 2 while layer (a) is in place.
- **`RESET ALL` restores the startup-packet value.** After `reset all`,
  `show default_transaction_read_only` is `on` again and the simple-protocol bypass returns to
  `25006`. It must run **before** each transaction, not after: measured, a call that _errors_
  (`slect 1` → `42601`) leaves the poison behind, so an after-the-fact cleanup is skipped exactly
  when it is needed. Reset-before was measured to block the bypass in both the poisoned and the
  errored-then-poisoned case.

Adopted: `max: 1` (so the reset is deterministic on the one connection) + `RESET ALL` issued
before every transaction. That is one extra round trip per tool call and it makes the fallback
claim actually true.

### LAND-MINE 1c — the connection option silently no-ops if it is placed one level too high.

`connection: { options }` and a bare top-level `options` are both accepted by postgres.js. Only
one of them does anything, and the wrong one fails **silently** — no error, no warning:

```
postgres(url, { connection: { options: "-c default_transaction_read_only=on" } })
  → show default_transaction_read_only = on    (bypass blocked, 25006)

postgres(url, { options: "-c default_transaction_read_only=on" })
  → show default_transaction_read_only = off   (bypass SUCCEEDS)
```

This is why §4 and slice 1 name `connection: { options }` literally rather than "the connection
options object", and why slice 7 asserts `show default_transaction_read_only` = `on` against the
real connection. A fake-`sql` unit test cannot see this — it is invisible until a real Postgres
answers.

### LAND-MINE 2 — `{ simple: false }` does not typecheck against postgres.js's own types.

The flag that carries the security property in land-mine 1 is absent from postgres.js's
`UnsafeQueryOptions` interface, which declares only `prepare`. Measured:

```
src/ts-surface.ts(6,47): error TS2353: Object literal may only specify known properties,
and 'simple' does not exist in type 'UnsafeQueryOptions'.   exit=2
```

Fix, verified in both directions (removing the file re-produces TS2353; restoring it gives
`exit=0`) — a module augmentation at `apps/mcp-db/src/types/postgres.d.ts`:

```ts
import "postgres";

declare module "postgres" {
  interface UnsafeQueryOptions {
    simple?: boolean | undefined;
  }
}
```

A cast at each call site would also compile. It is rejected: a cast at the exact line that carries
the security property is where a future refactor quietly drops it, and `as never` reads like noise
rather than like a deliberate protocol choice.

### LAND-MINE 3 — a dedicated read-only role is not available and is not needed.

Every table calls `.enableRLS()` and no migration defines a single policy, so under deny-by-default
RLS a non-bypassing role sees **zero rows**. `anon` and `authenticated` are `NOLOGIN`;
`supabase_read_only_user` is Supabase-managed with an unknown password and would not exist on a
non-Supabase Postgres. Creating a role with grants means new migrations, which is **AI-26's**
ticket and out of scope here. `docs/specs/ai-34-domain-model.md` and its walkthrough already
recorded this as "a requirement on AI-43: the MCP server must connect with service/owner
credentials". The `postgres` role both connection strings use has `rolbypassrls = true`, so it
sees rows.
Land-mine 1's mechanism makes that safe: an owner connection that cannot write.

### LAND-MINE 4 — pnpm can write install progress to **stdout**, corrupting the JSON-RPC stream.

A stdio MCP server owns stdout exclusively; one stray byte breaks the framing. Measured in a
package directory whose lockfile was missing, stdout only (stderr discarded):

```
$ pnpm --dir <pkg> run mcp
Already up to date
Done in 144ms using pnpm v11.5.0
{"cwd":"…/packages/mcp-db","hasDbUrl":true}

$ pnpm --silent --dir <pkg> run mcp
{"cwd":"…/packages/mcp-db","hasDbUrl":true}
```

**Refined in harden round 1**: this is not a banner pnpm always prints. Measured in _this_
repository, with its lockfile current, `pnpm --filter @talentscout/db run db:check` puts nothing of
pnpm's own on stdout with or without `--silent` — the noise above is pnpm deciding to run an
install first, which it announces on stdout. So `--silent` is insurance rather than a constant
necessity — but the case it insures against (a stale or missing lockfile) is exactly the case where
someone is already debugging, and a corrupted handshake is the worst possible symptom to add. It
stays. The same rule applies inside the server: every diagnostic goes to `console.error`, never
`console.log`.

### LAND-MINE 5 — `pg_class.reltuples` returns `-1`, so `describe-table` must run a real `count(*)`.

Measured on this database: `reltuples` is `-1` for `interviews` and `jobs` (never analysed) while
being correct for the other five. AC 3 asks `describe-table` for a row count; an estimate that
reads `-1` for two of seven tables is not one. `select count(*)` on the largest table (299 rows)
is free here.

### LAND-MINE 6 — a bad tool argument does **not** throw; it returns `isError: true`.

Expected `client.callTool` to reject on a zod violation. It does not — measured:

```
{ "isError": true,
  "content": [{ "type": "text",
    "text": "MCP error -32602: Input validation error: Invalid arguments for tool query:
             Invalid input: expected string, received number at sql" }] }
```

Any DoD phrased as "rejects" would be unsatisfiable. Every input-validation assertion in §5 is
phrased against `isError` and the message text instead.

### The launch chain works end to end — measured, not designed on paper.

A real `McpServer` over `StdioServerTransport`, launched by `StdioClientTransport` with
`command: "pnpm"`, `args: ["--silent", "--dir", <pkg>, "run", "mcp"]` (the shape the first draft
used; see land-mine 7 for the correction to `--filter`), whose package script is
`dotenv -e ../../<root env file> -- tsx src/main.ts`, connected and answered:

```
connected. server: {"name":"talentscout-db","version":"0.1.0"}
tools: query readOnlyHint=true
resources: talentscout://tables
[  OK ] select count(*)::int as n from candidates          → 1 row(s). [ { "n": 60 } ]
[  OK ] select id from application_stage_transitions       → Showing 100 of 299 rows. Truncated…
[ERROR] slect * from jobs                                  → syntax error at or near "slect" · 42601 · position 1
[ERROR] insert into jobs (title) values ('x')              → cannot execute INSERT … 25006
[ERROR] commit; create temp table escaped (a int)          → cannot insert multiple commands … 42601
[ERROR] select pg_sleep(9)                                 → canceling statement due to statement timeout 57014
```

Every acceptance criterion in this ticket is visible in that transcript.

### LAND-MINE 7 — `${CLAUDE_PROJECT_DIR}` is **unset** in Claude Code's own environment.

The first draft launched with `--dir ${CLAUDE_PROJECT_DIR:-.}/apps/mcp-db`, while YELLOW-4
simultaneously rejected an alternative for depending on that same `:-.` fallback. Harden round 1
called that contradiction, and it was right. Measured directly:

```
CLAUDE_PROJECT_DIR in this agent's tool environment: <UNSET>
```

Claude Code sets `CLAUDE_PROJECT_DIR` in the **spawned server's** environment, not its own, so a
`${CLAUDE_PROJECT_DIR:-.}` inside `command`/`args` is expanded _before_ that variable exists and
collapses to `.` — the working directory, which is the one thing the design was trying not to
depend on. **The construct is removed rather than justified.** Whether Claude Code expands from its
own environment or the child's is now moot: the entry contains no variable to expand.

The replacement is `pnpm --silent --filter @talentscout/mcp-db run mcp`, which asks pnpm to find
the workspace by walking up from cwd to `pnpm-workspace.yaml` instead of being told a path.
Measured, spawning with `CLAUDE_PROJECT_DIR` **deleted from the child environment**:

| spawn cwd                       | `--filter` (adopted)                                                 | `--dir ${CLAUDE_PROJECT_DIR:-.}/…` (rejected) |
| ------------------------------- | -------------------------------------------------------------------- | --------------------------------------------- |
| repository root                 | `exit=0`, stdout `READY`, stderr empty                               | works only because `.` happens to be the root |
| `apps/web/src` (nested)         | `exit=0`, stdout `READY` — pnpm walks up                             | **breaks** — `./apps/mcp-db` does not exist   |
| `/tmp` (outside the repository) | `exit=0`, stdout `No projects matched the filters in "/private/tmp"` | breaks                                        |
| `/`                             | **hangs** — pnpm scans the filesystem for workspace projects         | breaks                                        |

`--filter` is strictly better: it is correct from anywhere _inside_ the repository rather than only
from its root. The two bad rows are outside the operating envelope — a project-scoped `.mcp.json`
is launched from the project — and both are recorded as RISK-4, because the `/tmp` row exits **0**
while writing a non-JSON line to stdout, which is a confusing way to fail.

Also verified along the way: `pnpm --filter <name> run <script>` executes with cwd set to the
package directory (checked from the repository root _and_ from `apps/web/src`, both landing in
`packages/db`), which is what lets the package script keep the repository's existing **relative**
`-e ../../.env.local` idiom instead of duplicating an absolute path into `.mcp.json`; and an
absolute-path invocation of `<pkg>/node_modules/.bin/tsx` works from any cwd, which is the fallback
in RISK-4.

**`tsc --noEmit` exits 0** on a package importing `@modelcontextprotocol/sdk/server/mcp.js`,
`…/server/stdio.js`, `…/client/index.js` and `…/inMemory.js` under this repository's exact
`@talentscout/typescript-config/library.json` options — `target: ES2017`, `lib: ["esnext"]` (no
DOM), `module: esnext`, `moduleResolution: bundler`, `strict`, `isolatedModules`, `noEmit`,
`skipLibCheck: true`. The SDK's `./*` exports wildcard resolves under `bundler`, and `skipLibCheck`
absorbs the SDK's DOM-typed internals. **No build step and no tsconfig change are required.**

**`InMemoryTransport.createLinkedPair()` gives a full in-process client↔server pair** — verified
driving `callTool`, `listTools`, `listResources` and `readResource` with no subprocess and no
database. This is what makes §5's Vitest suites real tests rather than assertions about internals.

**Postgres error objects are safe to surface verbatim.** `PostgresError` carries `message`, `code`,
`position`, `routine`, and optionally `detail`/`hint`. Measured across four failing queries: the
connection string appears in neither the message nor the stack.

**`pnpm` binary layout.** `tsx` and `dotenv` resolve from `<workspace>/node_modules/.bin/`, never
the root — the repository root's `.bin` holds only `dotenv`, `prettier`, `tsc`, `tsserver`, `turbo`,
while `packages/db/node_modules/.bin/` holds `tsx`, `dotenv`, `drizzle-kit`, `eslint`, `vitest`.
`apps/mcp-db` therefore declares its own `tsx` and `dotenv-cli` devDependencies, as `packages/db`
does.

---

## 3. The structural question: `apps/mcp-db` or `packages/mcp-db`?

**Decision: `apps/mcp-db`, package name `@talentscout/mcp-db`.** Recorded here because `CLAUDE.md`'s
rule — "a new workspace goes under `apps/` if it is deployable and `packages/` if it is imported" —
does not decide it. This thing is a long-running local process that nothing imports. The rule is a
two-way test and this case answers "no" to both halves, so the honest question is not _which rule
applies_ but _which rule would be broken_.

Put it in `packages/` and it breaks two: `packages/` means "imported", and this has zero library
consumers; and "extract a package when a second consumer exists, not before" argues against a
package with none.

Put it in `apps/` and it breaks one, on a narrow reading of a single word. "Deployable" is the
rule's proxy for "a thing you run rather than a thing you import", and this is unambiguously a thing
you run: its own entry point, its own process lifecycle, its own transport. It is deployed — to
every engineer's Claude Code, through `.mcp.json`. And the dependency direction comes out right for
free: `apps/mcp-db` depending on `@talentscout/db/env` is the sanctioned "apps depend on packages",
whereas `packages/mcp-db` → `packages/db` is package-on-package and muddier.

The `mcp-` prefix is deliberate. AI-44 adds a PostHog MCP server immediately after this one;
`apps/mcp-db` and `apps/mcp-posthog` sort together and read as a family. The **server name in
`.mcp.json` is `talentscout-db`**, not `mcp-db` — that name becomes the agent-visible tool prefix
(`mcp__talentscout-db__query`), where "mcp" would stutter and "db" alone is ambiguous across a
machine running several projects' servers.

**Cost accepted:** a reader scanning `apps/` will briefly expect something deployable. One line in
the README's Layout section pays that off (§5 slice 8), which the "record decisions in the README"
rule requires anyway.

---

## 4. Target shape

```
apps/mcp-db/
  eslint.config.mjs           re-exports @talentscout/eslint-config/base — copied from packages/db
  package.json                @talentscout/mcp-db, private, type: module
  tsconfig.json               extends @talentscout/typescript-config/library.json — no build step
  vitest.config.mts           environment: node — copied from packages/db
  scripts/
    verify-read-only.ts       the live-database proof (AC 2, AC 5); never runs in `pnpm check`
  src/
    catalog.ts                catalog SQL + shaping for `schema` / `describe-table`
    catalog.test.ts
    format.ts                 truncation notice, row rendering, Postgres-error rendering
    format.test.ts
    main.ts                   the only module touching process, stdio, env, or postgres()
    read-only.ts              opens the connection and runs one statement, read-only
    read-only.test.ts
    server.ts                 registers the three tools and the resource; no postgres import
    server.test.ts
    types/
      postgres.d.ts           the UnsafeQueryOptions augmentation — land-mine 2
```

**The one contract worth pinning.** `src/server.ts` exports
`createServer(execute: QueryExecutor): McpServer`, where `QueryExecutor` is
`(statement: string, params?: unknown[]) => Promise<Record<string, unknown>[]>`. It imports no
`postgres`, reads no environment variable, and touches no stream. `src/main.ts` is the sole owner of
the boundary: it reads `env.DIRECT_DATABASE_URL` from `@talentscout/db/env`, builds the executor
from `read-only.ts`, hands it to `createServer`, and connects a `StdioServerTransport`.

**Why `DIRECT_DATABASE_URL` and not `DATABASE_URL`.** Raised in harden round 2 and adopted: this
server rests on three **session-scoped** mechanisms — the startup-packet
`connection: { options: … }`, `max: 1` pinning one backend, and `RESET ALL` landing on the same
backend the next `BEGIN READ ONLY` gets. That is precisely the class this repository already
documents as not surviving Supabase's transaction pooler: `README.md` § Database says
`db:migrate` and `db:seed` use the direct URL "never the pooled URL: DDL and the migrator's
advisory locks do not survive Supabase's transaction pooler", and `.env.example:8` labels
`DATABASE_URL` "Supavisor, transaction mode". A transaction pooler may drop, ignore or reject an
unknown startup parameter **silently** — land-mine 1c's exact failure signature. The pooled URL is
for `packages/db/src/client.ts`'s request-path ORM client; a long-running local dev process doing
session-scoped work is the `db:migrate` case, not the request-path case. `packages/db/src/env.ts`
validates each key in its own lazy getter, so this server never trips over an absent
`DATABASE_URL`. It also makes the specification match the evidence: locally both keys point at the
same direct instance on `127.0.0.1:54322`, so **every measurement in this document was taken
against a direct connection** — naming the direct key is what stops that from being an unstated
assumption.

That seam is what makes the whole tool surface testable with `InMemoryTransport` and a fake
`execute` (§2, verified), and it rhymes with the repository's existing "one module owns the
boundary" habit — `src/env.ts` for environment access, `apps/web/src/app/api/*/schema.ts` for
request parsing. Everything below that line — helper names, file lengths, how the test files split
their cases — is the implementer's call against real code.

**Scripts on `apps/mcp-db/package.json`:** `mcp`, `mcp:verify`, `lint`, `lint:fix`, `typecheck`,
`test`, `test:watch`, `test:coverage`. **Deliberately no `dev`, `build` or `start`:** root
`pnpm dev` is `turbo run dev` with `persistent: true`, and a `dev` script here would launch a stdio
JSON-RPC server alongside the Next dev server, where it would sit reading an empty stdin forever.

```jsonc
// apps/mcp-db/package.json — the two that matter
"mcp":        "dotenv -e ../../.env.local -- tsx src/main.ts",
"mcp:verify": "dotenv -e ../../.env.local -- tsx scripts/verify-read-only.ts",
```

**The `.mcp.json` entry**, added beside the existing `chrome-devtools` server:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp@latest"]
    },
    "talentscout-db": {
      "type": "stdio",
      "command": "pnpm",
      "args": ["--silent", "--filter", "@talentscout/mcp-db", "run", "mcp"]
    }
  }
}
```

Four things in six lines, each measured in §2 and each load-bearing:

- **`--silent`** — insurance against pnpm announcing an install on stdout and breaking the
  handshake (land-mine 4). Not needed while the lockfile is current; kept because the case it
  covers is exactly when someone is already debugging.
- **`--filter @talentscout/mcp-db`** — asks pnpm to _find_ the workspace by walking up from cwd to
  `pnpm-workspace.yaml`, rather than being told a path. Measured correct from the repository root
  and from a nested subdirectory, and it sets the child's working directory to the package, which
  is what lets the package script keep the repository's existing relative `-e ../../.env.local`
  idiom.
- **No `${CLAUDE_PROJECT_DIR}`, deliberately** — it is unset in Claude Code's own environment
  (measured, land-mine 7), so the `:-.` fallback would always fire and make the entry
  cwd-dependent, which is exactly what it was there to prevent. There is no variable left to expand.
- **`run mcp`** — the launch command lives in `package.json` beside every other runnable in this
  repository, not duplicated as two absolute binary paths inside `.mcp.json`.

**Tool and resource surface.** All four names are the ticket's, unchanged.

| Surface           | Input (zod)                                                 | Returns                                                                                         |
| ----------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `query`           | `sql: string.min(1)`, `maxRows?: int 1–1000`                | header line + `JSON.stringify(rows, null, 2)` in one text block                                 |
| `schema`          | `tables?: string[]` (all tables when absent)                | tables, columns with `format_type` types, nullability, defaults, FK definitions, enums, indexes |
| `describe-table`  | `table: string.min(1)`, `sampleRows?: int 0–20` (default 5) | that table's columns + **exact `count(*)`** + sample rows                                       |
| `tables` resource | URI `talentscout://tables` (fixed)                          | every table in `public` with its column count and exact row count                               |

Every tool carries `annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false }`
— verified to reach the client (`tools: query readOnlyHint=true`). Annotations are a _hint to the
client_, never the enforcement; the enforcement is land-mine 1's layers.

**`schema` with an unrecognised name in `tables` errors**, exactly as `describe-table` does, rather
than returning a silently empty result — a typo that yields "this table has no columns" is worse
than one that yields "no such table". Raised as a NIT in harden round 1; the case was genuinely
undefined.

**Both catalog tools take parameters, so `QueryExecutor` has a `params` slot.** Table names reach
the catalog queries as bind parameters, never as string concatenation. One trap: postgres.js decides
the protocol from the argument count (`simple: args.length === 0`), so passing parameters happens to
select the extended protocol — but `{ simple: false }` is still passed **explicitly on every call**,
because relying on that default would silently re-open land-mine 1 for every zero-parameter query.
**Three statements cannot bind the table name** and must interpolate a quoted identifier — a bind
parameter can carry a value, never an identifier. Harden round 3 caught an earlier draft naming
only the first:

1. `describe-table`'s exact `select count(*) from <table>`;
2. `describe-table`'s `sampleRows` sample query (the row limit binds; the table name cannot);
3. the `tables` resource's per-table exact row count — the same statement, once per table.

All three go through **one** helper, and that helper is the only place in the codebase allowed to
put an identifier into SQL: it rejects any name absent from the live catalog listing, then quotes
what survives. Everything else — every filter, every `tables?: string[]` entry — binds. The
read-only transaction caps the blast radius at reads regardless, so validate-then-quote is a
hygiene requirement rather than the thing standing between the agent and a write; but it is a real
decision, so slice 4's DoD tests it rather than asserting it.

**Constants**, in source, not in the environment (§6 YELLOW-9):

| Constant               | Value    | Why                                                                                                               |
| ---------------------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| `MAX_ROWS_DEFAULT`     | `100`    | largest table is 299 rows at 289 B/row → a capped page is ~29 KB; uncapped `select *` reaches 87 KB               |
| `MAX_ROWS_CEILING`     | `1000`   | the ceiling on the per-call `maxRows` override                                                                    |
| `SAMPLE_ROWS_DEFAULT`  | `5`      | measured 5-row payloads run 745 B – 8.4 KB across the seven tables                                                |
| `STATEMENT_TIMEOUT_MS` | `10_000` | every honest query on a 627-row database returns in milliseconds; well inside Claude Code's own tool-call timeout |
| pool `max`             | `1`      | makes the pre-call `RESET ALL` deterministic **for one in-flight call** — and serialises statements, see below    |

**`max: 1` serialises statements, and what that does and does not buy.** Raised as a NIT in harden
round 2 and sharpened in round 3. The pool size is chosen so `RESET ALL` lands on the same backend
the next transaction gets (YELLOW-5), and its visible cost is that concurrent `query` / `schema` /
`describe-table` calls queue behind one another, so one runaway query blocks the whole server for up
to `STATEMENT_TIMEOUT_MS`.

**It does not make the reset atomic with respect to a concurrent call.** `runReadOnly` is two queued
operations — `await sql.unsafe("reset all")`, then `await sql.begin("read only", …)` — and `max: 1`
serialises _statements_, not call sequences. Two parallel tool calls can interleave as A-reset,
B-reset, A-transaction, B-transaction; if A's statement is
`set session default_transaction_read_only = off`, B runs on a poisoned session despite having
reset. `sql.begin` reserving the connection stops a reset landing _mid_-transaction, not a poison
landing between another call's reset and its begin, and MCP clients may issue parallel tool calls,
so the window is reachable.

The consequence is nil for AC 2, and that is measured rather than argued: land-mine 1b established
that the primary guarantee (`BEGIN READ ONLY` + `{ simple: false }`) is untouched by the poisoning.
What lapses, for at most one call, is the fallback. **Deliberately not fixed:** a mutex or a
reserved connection would buy nothing AC 2 needs and would add a concurrency primitive to a
single-developer dev tool. The honest claim is that the reset is deterministic for a single
in-flight call, and that is now what the constant says.

**Output shape.** AC 5 requires the truncation to be _stated_. What must be true of the header
line — and what the tests assert — is that it names **the number of rows shown, the exact total, and
the cap that produced the cut**, and that an untruncated result says how many rows there were
without claiming a truncation. Singular and plural are distinguished (`1 row`, `299 rows`). The
header is followed by a blank line and then `JSON.stringify(shownRows, null, 2)`. An illustrative
rendering, not a string to assert character-for-character:

```
truncated:      Showing 100 of 299 rows — truncated at maxRows=100. …
not truncated:  299 rows.
```

The exact total is free: postgres.js materialises the whole result set, so `rows.length` is known
before truncation. This is why the plan does **not** wrap the user's SQL in
`select * from (…) limit n` — wrapping breaks on trailing semicolons, `EXPLAIN`, `SHOW` and `COPY`,
and buys nothing.

**Error text**, for AC 5's "usable text". The required properties are that the Postgres `message`
survives verbatim and that whichever of `code`, `position`, `detail` and `hint` exist are carried
alongside it, with the absent ones leaving no stray punctuation. `error.stack` is **never**
included — it is noise, not usable text. An illustrative rendering:

```
Query failed: syntax error at or near "slect"
SQLSTATE 42601 · position 1
```

**On `CLAUDE.md`'s "never return a stack trace, an internal identifier, or a raw exception message
to the client".** That rule sits under `## API routes` and is scoped to public HTTP endpoints; its
purpose is to keep internals away from an untrusted caller. Here the caller is an agent the engineer
launched on their own machine to inspect their own database, and the Postgres message _is_ the
product — "column `nope` does not exist, position 8" is the entire value of AC 5. The rule's spirit
is nonetheless honoured where it still bites: no stack traces, and no connection string (verified
absent from both message and stack in §2).

---

## 5. Plan (slices)

Eight slices. Each is independently verifiable and every DoD is a command with an exit code or a
file assertion. Unless stated, commands run from the repository root of the worktree
`ai-eng-training-ai-43`. No slice is blocked; there are no RED escalations.

Every slice ends with `pnpm check` exiting 0 — `CLAUDE.md` requires it before handing work back, and
markdown is not in `.prettierignore`, so this document is subject to the root Prettier pass too.

### Slice 1 — Workspace skeleton and the read-only executor

Tooling config and the first source file land together. A config-only slice cannot satisfy a
typecheck DoD: `tsc --noEmit` fails with `TS18003 No inputs were found in config file` on an empty
`include`, which the AI-41 spec measured and which applies unchanged here.

Creates `apps/mcp-db/` with `package.json`, `tsconfig.json` (extending
`@talentscout/typescript-config/library.json` with the `@/*` path, copied from `packages/db`),
`eslint.config.mjs`, `vitest.config.mts`, `src/types/postgres.d.ts` (land-mine 2), and
`src/read-only.ts` + its test.

Dependencies: `@modelcontextprotocol/sdk@^1.30.0`, `@talentscout/db@workspace:*`, `postgres@^3.4.9`,
`zod@^4.4.3`. devDependencies mirroring `packages/db`: the two shared configs, `@types/node@^20`,
`eslint@^9`, `typescript@^5`, `vitest@^4.1.10`, `@vitest/coverage-v8`, `tsx@^4.23.12`,
`dotenv-cli@^10.0.0`.

`src/read-only.ts` exports `STATEMENT_TIMEOUT_MS`, the connection options, and
`runReadOnly(sql, statement, params?)` — which issues `RESET ALL`, then opens
`sql.begin("read only", …)`, then `SET LOCAL statement_timeout`, then runs exactly one statement
with `{ simple: false }`. Three details are load-bearing and each has a measurement behind it:
the options go at `connection: { options: "-c default_transaction_read_only=on" }` and **nowhere
else** (land-mine 1c — a top-level `options` silently no-ops); the pool is `max: 1` so the reset is
deterministic; and `RESET ALL` runs **before** the transaction, not after, because an erroring call
would skip an after-the-fact cleanup exactly when it is needed (land-mine 1b). Taking the
postgres instance as an argument is what makes the security property unit-testable with a fake; the
`createReadOnlyExecutor(connectionString)` wrapper that calls `postgres()` for real is the thin part.

**Package-internal imports are relative (`./types`, `./read-only`), not `@/`-aliased**, matching the
deliberate convention `packages/db` established in commit `8e2bbe0`. Test files use the alias.

**DoD**

- `pnpm install` exits 0; `pnpm --filter @talentscout/mcp-db typecheck`, `… lint` and `… test` each
  exit 0; `pnpm check` exits 0 from the root.
- **Lockfile — the assertion is ≥ 3, not ≥ 2.** Harden round 1 measured `grep -c
"@modelcontextprotocol/sdk@1.30.0" pnpm-lock.yaml` returning **2** on unmodified `origin/main`
  (a `packages:` key at line 1142 and a `snapshots:` key at line 5900), so "at least 2" passed by
  doing nothing. Assert **≥ 3**, that the `importers:` section gains an `apps/mcp-db` entry naming
  the SDK, and that the existing `'@modelcontextprotocol/sdk': 1.30.0(zod@3.25.76)` line (9432)
  is still present — the new direct dependency must not disturb shadcn's transitive resolution.
- A fake `sql` recording its calls proves the mechanism's shape in one test: `RESET ALL` ran
  **before** the transaction, the transaction was opened with mode `read only`, the preamble
  `SET LOCAL statement_timeout` ran inside it, and the statement was executed with
  `simple: false` — including when `params` is `undefined`, which is the case postgres.js would
  otherwise default to the simple protocol.
- `grep -c "connection:" apps/mcp-db/src/read-only.ts` is at least 1 and the option string appears
  **only** nested under it — the land-mine 1c placement check. A unit test cannot see this, so the
  live assertion lives in slice 7.
- **Non-vacuity, both directions.** Deleting `simple: false` from `runReadOnly` makes
  `pnpm --filter @talentscout/mcp-db test` exit non-zero. Deleting `src/types/postgres.d.ts` makes
  `pnpm --filter @talentscout/mcp-db typecheck` exit non-zero with
  `TS2353 … 'simple' does not exist in type 'UnsafeQueryOptions'` — land-mine 2's probe, live in the
  repository. Both restored.
- `node -p "Object.keys(require('./apps/mcp-db/package.json').scripts)"` contains none of `dev`,
  `build`, `start` (§4).

### Slice 2 — Truncation and error text (AC 5's pure half)

`src/format.ts` + `src/format.test.ts`. Pure functions, no postgres import, no MCP import: the
notice, the row rendering, and the Postgres-error rendering, to the exact strings pinned in §4.

**DoD**

- Four notice cases assert the **properties**, not the copy (harden round 1 NIT): 0 rows and 1 row
  render singular/plural correctly; 299 rows under a 1000 cap report 299 and claim no truncation;
  299 rows under a 100 cap contain `100`, `299` and the cap that produced the cut. Asserting the
  sentence character-for-character would date the tests to a wording change and prove nothing extra.
- **Off-by-one boundary:** exactly `maxRows` rows produces **no** truncation notice; `maxRows + 1`
  produces one. This is the assertion that distinguishes a correct cap from a plausible one.
- Error rendering: `{ message, code: "42601", position: "1" }` carries message, code and position;
  `{ message, code: "25006" }` with no position carries one detail field and leaves no stray
  separator; a plain `new Error("boom")` with no `code` renders the message alone with no empty
  detail line.
- The rendered output of an error carrying a stack does not contain `"    at "` — no stack frame
  reaches the client.
- Non-vacuity: changing `MAX_ROWS_DEFAULT` from 100 to 101 makes `pnpm --filter … test` fail.
- `pnpm check` exits 0.

### Slice 3 — The server seam, the `query` tool, and `main.ts`

`src/server.ts` exports `createServer(execute)` and registers `query`. `src/main.ts` wires
`env.DIRECT_DATABASE_URL` (imported from `@talentscout/db/env`, never re-read from `process.env` —
`CLAUDE.md`; the direct key, for the reason in §4) through `createReadOnlyExecutor` into
`createServer` and connects a
`StdioServerTransport`. This is the first slice with a server you can talk to.

Tests drive it through `InMemoryTransport.createLinkedPair()` and a real `Client`, with `execute`
faked — verified in §2 to exercise `listTools`, `callTool`, `listResources` and `readResource` with
no subprocess and no database.

**DoD**

- `client.listTools()` returns `query` with `annotations.readOnlyHint === true`.
- A fake `execute` returning 299 rows against `maxRows: 100` produces a header carrying the shown
  count, the exact total and the cap that produced the cut; returning 1 row produces a singular
  header. Properties, not character-for-character copy — §4's renderings are illustrative.
- A fake `execute` that throws a Postgres-shaped error produces `isError: true`, and the text
  carries the message and the SQLSTATE code and contains no stack frame.
- **Input validation is asserted against `isError`, not against a throw** (land-mine 6):
  `callTool({ name: "query", arguments: { sql: 42 } })` resolves with `isError: true` and text
  containing `Invalid input: expected string`. Same shape for `maxRows: 0` and `maxRows: 1001`.
- **Stdout is clean** — the land-mine 4 check:
  `pnpm --silent --filter @talentscout/mcp-db run mcp </dev/null 2>/dev/null | wc -c` prints `0`.
  The stderr half of this check belongs to slice 6, which introduces the banner and re-runs the
  `wc -c` assertion beside it.
- `pnpm check` exits 0.

### Slice 4 — `schema` and `describe-table` (AC 3)

`src/catalog.ts` holds the catalog SQL as exported constants plus pure shaping functions; the two
tools are registered in `server.ts`. The SQL is the set verified in §2 against the live database:
`pg_class`/`pg_namespace` for tables, `information_schema.columns` joined to `pg_attribute` for
`format_type` types, `pg_constraint` with `pg_get_constraintdef` for relationships, `pg_type`/
`pg_enum` for enums, `pg_indexes` for indexes.

`describe-table` adds an **exact `select count(*)`** — never `reltuples`, which reads `-1` for two
of the seven tables (land-mine 5) — plus `sampleRows` sample rows.

Table names reach the **catalog filter** queries as bind parameters through `QueryExecutor`'s
`params` slot — which is why §4 pins that slot; an executor taking only a statement string would
force string concatenation everywhere. The three statements that cannot bind an identifier (§4) go
through the single validate-then-quote helper: a name absent from the live catalog listing never
reaches a statement string at all, and the tool returns `isError: true` naming the valid tables.
`schema` behaves the same way for an unrecognised entry in `tables` rather than returning silently
empty. The read-only connection bounds injection here to reads regardless, so this is a usability
requirement first and a hygiene one second.

**DoD**

- Pure shaping tests over fixture catalog rows: a column row renders its `format_type` type and its
  nullability; a foreign-key row renders its `pg_get_constraintdef` text including the delete
  action; an enum renders its ordered values.
- In-memory: `describe-table` with `{ table: "no_such_table" }` → `isError: true`, text containing
  `no_such_table` **and** at least one real table name from the injected catalog fixture. Same for
  `schema` with `{ tables: ["no_such_table"] }`.
- The fake executor records its second argument: every **catalog filter** query that narrows by
  table name passed it as a **bind parameter** rather than concatenating it. Scoped to filter
  queries deliberately — §4's three counting and sampling statements must interpolate a quoted
  identifier, so an absolute "nothing is ever interpolated" claim would be false by design.
- **The validate-then-quote step is tested, not asserted.** A `table` argument absent from the
  injected catalog fixture — including one carrying a quote or a semicolon — produces
  `isError: true`, **and** the fake executor records **zero** statements containing any part of
  that argument. This is the only check standing between a tool argument and an interpolated
  identifier, and until harden round 3 nothing exercised it. Slice 5's resource inherits the rule
  by construction: it takes no argument, so its table names come from the catalog itself.
- In-memory: `schema` output contains a foreign-key definition and an enum type; `describe-table`
  output contains a row count and `sampleRows` sample rows.
- `grep -c reltuples apps/mcp-db/src/catalog.ts` returns **0** (land-mine 5 stays fixed).
- `pnpm check` exits 0.

### Slice 5 — The `tables` resource (AC 4)

One `registerResource` call at the fixed URI `talentscout://tables`, returning
`application/json`: every table in the `public` schema with its column count and exact row count.
A fixed URI, not a `ResourceTemplate` — see YELLOW-11.

**DoD**

- `client.listResources()` includes `talentscout://tables` with a name and a description; that is
  AC 4's "browsable".
- `client.readResource({ uri: "talentscout://tables" })` returns `mimeType: "application/json"` and
  a body that `JSON.parse`s to one entry per table in the injected fixture.
- `pnpm check` exits 0.

### Slice 6 — Registration in `.mcp.json`, and the startup banner

Adds the `talentscout-db` entry of §4 beside `chrome-devtools`, and makes `main.ts` write
`[talentscout-db] ready — DIRECT_DATABASE_URL <host>:<port>/<database>` to **stderr** on start.
The banner is not decoration: it is what makes RISK-1 visible at the moment it matters, and the only
place an engineer sees which database the agent is about to read. It names the **key** as well as
the host so that a future change back to the pooled URL — which would silently undo the
session-scoped fallback (§4) — is visible on every start rather than only in a diff.

**`.claude/settings.json` is deliberately not touched** — see YELLOW-3.

**DoD**

- `node -p "Object.keys(require('./.mcp.json').mcpServers)"` prints both server names, and
  `git diff origin/main -- .mcp.json` shows only added lines inside `mcpServers` — the
  `chrome-devtools` entry is untouched.
- The new entry's `args` are exactly `--silent`, `--filter`, `@talentscout/mcp-db`, `run`, `mcp`,
  and its `type` is `stdio`. `grep -c CLAUDE_PROJECT_DIR .mcp.json` returns **0** — the construct
  land-mine 7 removed must not creep back.
- **The launch check spawns with `CLAUDE_PROJECT_DIR` deleted from the child environment, from a
  cwd the harness did not choose.** Hand-resolving the variable under test would make this vacuous
  against the only failure mode, which is what harden round 1 caught. Three spawns, each using
  **verbatim** the `command` and `args` read out of `.mcp.json` at runtime:
  - from the worktree root → `initialize` succeeds, `listTools()` returns 3 tools,
    `listResources()` returns 1 resource;
  - from `apps/web/src` → the same, proving pnpm's upward workspace search rather than a lucky cwd;
  - from `/tmp` → the client fails to initialise. This case is asserted as a **known** failure, not
    a passing one: it is outside the operating envelope and it fails confusingly (RISK-4).
- The banner appears on stderr and **not** on stdout: slice 3's `wc -c` check still prints `0`.
- `pnpm check` exits 0.

### Slice 7 — `pnpm mcp:verify`: the live-database proof (AC 2, and the real halves of AC 1 and 5)

`apps/mcp-db/scripts/verify-read-only.ts`, a root `"mcp:verify": "turbo run mcp:verify"` script, and
a `turbo.json` task `"mcp:verify": { "cache": false }` — the shape `db:migrate` and `db:seed`
already use for tasks that open a connection.

This slice exists because **AC 2 cannot be proved without a database.** A unit test can assert that
the code asks for a read-only transaction; only Postgres can assert that it refuses the write. The
script connects through the real executor, asserts the full matrix, prints a line per case, and
exits non-zero if **any** write succeeds.

**DoD** — every item run against the live local database:

- `pnpm mcp:verify` exits 0 and prints one line per case.
- **Write matrix, each rejected with SQLSTATE `25006`:** `insert`, `update`, `delete`,
  `create table`, `create temp table`, `drop table`, `grant`, and
  `do $$ begin create temp table t (a int); end $$` — PL/pgSQL does not escape.
- **Statement-splitting matrix, each rejected with SQLSTATE `42601`:**
  `commit; create temp table escaped (a int)`, the same with `rollback;` and with `end;`, and
  `select 1; select 2`. This is land-mine 1's regression test and the reason this slice exists in
  this form.
- **The connection option is actually in effect** (land-mine 1c, which no unit test can see):
  `show default_transaction_read_only` returns `on`. This one assertion is what catches the
  silent no-op of writing `options` at the top level instead of under `connection` — and, against a
  hosted deployment, it is also what would catch a transaction pooler dropping the startup
  parameter (§4). It is the single most valuable line in this script.
- **The script connects through `DIRECT_DATABASE_URL`**, and says so in its output. Locally both
  keys point at the same direct instance, so this assertion is about intent, not observation: it is
  the only place the choice is mechanically visible, because no local measurement can distinguish
  the two (harden round 2).
- **The session-GUC poisoning case** (land-mine 1b): run
  `set session default_transaction_read_only = off`, then assert that a **following** write is
  still refused with `25006` — the primary guarantee does not depend on the GUC — and that
  `show default_transaction_read_only` is back to `on` on the next call, proving the pre-call
  `RESET ALL` re-armed the fallback. Without the reset this case leaves the connection disarmed for
  the rest of the process.
- **The script leaves no residue.** Its own probe statements are all rejected, so nothing should be
  created; it asserts that afterwards by querying `pg_class` for any relation matching its probe
  prefix and getting **zero rows**, and that the seven table counts are unchanged (8 / 60 / 90 /
  299 / 43 / 120 / 7). Verified during planning that the probes behind §2 left nothing behind: the
  one write that got through the bypass was a session-local temp table, gone when its connection
  closed, and all seven counts were unchanged afterwards.
- **Timeout:** `select pg_sleep(12)` → SQLSTATE `57014`, within `STATEMENT_TIMEOUT_MS` + 2s.
- **AC 1 witness:** `select count(*)::int from candidates` returns **60** — a number that appears in
  no file in this repository, so a schema-file answer cannot produce it.
- **AC 3 witness:** the catalog returns **7** tables, **71** columns, **10** foreign keys and **6**
  enum types.
- **AC 5 witnesses:** `slect * from jobs` yields text containing `syntax error at or near "slect"`
  and `42601`; `select id from application_stage_transitions` yields a header naming 100 shown, 299
  total, and the cap — the properties §4 pins, not a verbatim sentence.
- **The script fails loudly when it should.** Temporarily removing `{ simple: false }` makes
  `pnpm mcp:verify` exit non-zero on the `commit;` case. Moving the connection option from
  `connection: { options }` to a top-level `options` — the silent no-op of land-mine 1c — makes the
  `show default_transaction_read_only` case fail. Removing **both** makes the `commit;` case
  _succeed_, which the script reports as a failure. All restored afterwards.
- **`pnpm check` does not need a database.** With the local Supabase **stopped**, `pnpm check` still
  exits 0, and `turbo run test --dry=json` does not list `mcp:verify`. This is the check that keeps
  CI honest.

### Slice 8 — README, and two stale comments

`CLAUDE.md`: "When a change settles something the repository did not previously state, update the
README **in the same PR as the change itself**." Adding a workspace, a second MCP server and a new
root script settles three things, and two comments elsewhere in the tree become false. Edit, do
not append. Five README sections, `.env.example`, and one comment in `packages/db`.

- **`## MCP`** — currently two sentences about `chrome-devtools`. Rewrite to cover both servers:
  what `talentscout-db` exposes, that it is **read-only by construction** and by which mechanism,
  that results are capped at 100 rows, and that the server prompts for approval on first run.
- **`## Layout`** — add `apps/mcp-db/` to the tree, plus one sentence reconciling it with the
  section's own apps-are-deployable rule (§3). The section already carries a precedent for this
  shape: it names the CLI as "the deliberate exception".
- **`## Scripts`** — add the `pnpm mcp:verify` row.
- **`## Testing`** — the sentence "Each workspace configures its own Vitest: `apps/web` runs jsdom
  …, and `packages/db` runs the node environment with no DOM at all" becomes an incomplete list the
  moment `apps/mcp-db` lands. Add it to the enumeration. Raised as a NIT in harden round 3, which
  offered de-enumerating instead; adopted the enumeration because three workspaces is still short
  enough to be useful, and because naming `apps/mcp-db` as the second node-environment workspace
  tells a reader where to look for the pattern to copy. Revisit at the fourth.
- **`## Database`** — one sentence in the two-URL list: the MCP server joins `db:migrate` and
  `db:seed` on `DIRECT_DATABASE_URL`, for the same reason they use it — the guarantees it depends on
  are session-scoped and do not survive a transaction pooler — and it reads inside a read-only
  transaction, so it cannot write. That keeps the section's existing "the seed has no reset path"
  safety story coherent and stops the next reader assuming the pooled URL.
- **`.env.example:9`** currently reads "Read by the application at runtime from AI-43 onward" under
  `DATABASE_URL`. AI-43 reads `DIRECT_DATABASE_URL` instead (§4), so that forward-looking claim is
  now false. Correct it to describe what is true — `DATABASE_URL` is the request-path client's key,
  read by `packages/db/src/client.ts` — and note under `DIRECT_DATABASE_URL` that the MCP server
  joins `db:migrate` and `db:seed` in using it, and why. **No key is added or removed.**
- **`packages/db/src/schema/relations.ts:15`** currently reads "so AI-43 and AI-63 can write
  `db.query.<table>.findMany({ with: … })`". AI-43 does not — it queries the catalog, by design
  (YELLOW-6). Drop AI-43 from that sentence, leaving AI-63. A comment naming a consumer that never
  arrived is exactly the kind `CLAUDE.md` says to delete.

**DoD**

- `git diff README.md` shows **removed** lines as well as added ones — proof it is an edit, not an
  append — and `grep -c talentscout-db README.md` is at least 1.
- `grep -c "mcp:verify" README.md` is at least 1, present as a Scripts table row.
- The `## Testing` paragraph names all three workspaces that configure Vitest, and
  `grep -c "mcp-db" README.md` returns **at least 3** — the Layout, MCP and Testing mentions.
- `grep -c AI-43 packages/db/src/schema/relations.ts` returns **0**, and
  `grep -c AI-63 packages/db/src/schema/relations.ts` returns at least 1.
- **`.env.example` gains no key, only corrected comments.** The invariant asserted is the one that
  matters: the set of `KEY=` lines is byte-identical to `origin/main`'s
  (`git show origin/main:.env.example | grep -E '^[A-Z_]+='` equals the same grep on the working
  copy), while `git diff .env.example` is non-empty and touches only `#` lines. Harden round 2
  replaced the previous "diff is empty" assertion, which had become unsatisfiable.
- `pnpm check` exits 0 — the root Prettier pass covers markdown at `printWidth: 100`.

---

## 6. Assumptions / decisions log (YELLOW — challenge these in review)

This section is what goes in the PR body. Each entry is a choice the ticket and the repository did
not settle, with the alternative that lost and why.

**YELLOW-1 — The workspace is `apps/mcp-db`, package `@talentscout/mcp-db`.** Full argument in §3:
`CLAUDE.md`'s apps-versus-packages rule is a two-way test that this workspace answers "no" to both
halves of, so the question is which rule would be broken, and `packages/` breaks two where `apps/`
breaks one. _Rejected:_ `packages/mcp-db` — it would mean a package nothing imports, against both
"packages/ if it is imported" and "extract a package when a second consumer exists, not before".
Reversible: it is a directory move plus one line in `.mcp.json`.

**YELLOW-2 — Run TypeScript directly with `tsx`; no build step, no `dist/`.** The shared tsconfig
base sets `noEmit: true` and `packages/db` ships raw `.ts` through `"exports": { "./*": "./src/*.ts" }`
— that is the proven pattern here, and `tsx@4.23.12` is already this programme's script runner.
Adding a build would make this the only workspace with compiled output, would need a new tsconfig that
contradicts the shared base, and put a stale-`dist` failure mode between an edit and the agent
seeing it. Measured: `tsc --noEmit` exits 0 against the SDK under the unmodified base options (§2),
so nothing forces the change. **Where the binary lives:** pnpm does not hoist, so `tsx` resolves
from `apps/mcp-db/node_modules/.bin/tsx` — never from the repository root, whose `.bin` holds only
`dotenv`, `prettier`, `tsc`, `tsserver` and `turbo`. `apps/mcp-db` therefore declares `tsx` and
`dotenv-cli` itself, as `packages/db` does. _Rejected:_ `tsc` + `node dist/main.js`, and node's
native type stripping (works on 22.20 but is experimental and pins the runtime).

**YELLOW-3 — Registered in `.mcp.json`, not `.claude/settings.json`; no pre-approval entry.**
**The ticket is factually wrong here and this corrects it rather than designing around it.**
`.claude/settings.json` has no `mcpServers` key — it has `enableAllProjectMcpServers`,
`enabledMcpjsonServers` and `disabledMcpjsonServers`, which only _approve_ servers defined
elsewhere. The canonical checked-in, project-scoped file is root `.mcp.json`, **which this
repository already has**, registering `chrome-devtools`, and which `README.md` § MCP already
documents. That is binding precedent and it satisfies the ticket's actual intent — the server is
registered so Claude Code picks it up. Also declined: adding
`"enabledMcpjsonServers": ["talentscout-db"]`. It would remove the first-run approval prompt, but
`chrome-devtools` is not pre-approved either and the README already tells the reader to approve on
first run; consistency beats novelty, and silently pre-approving a server that runs SQL against a
developer's database is the less conservative of the two options. **Flip it in one line if review
disagrees.**

**YELLOW-4 — `.env.local` reaches the server through the package script, not through `.mcp.json`,
and the launch names no environment variable at all.** The script is
`dotenv -e ../../.env.local -- tsx src/main.ts`, byte-for-byte the idiom `db:migrate` and
`db:seed` already use, and `pnpm --filter <name> run` sets the child's working directory to the
package so the relative path resolves (measured from two different cwds, §2).

**Corrected in harden round 1.** The original entry launched with
`--dir ${CLAUDE_PROJECT_DIR:-.}/apps/mcp-db` while this very paragraph rejected an alternative for
depending on that same `:-.` fallback — a contradiction in the argument the whole launch rode on.
It is resolved by deleting the construct rather than defending it: `CLAUDE_PROJECT_DIR` is
**measured unset** in Claude Code's own environment (land-mine 7), so the fallback would always
fire. `--filter` asks pnpm to find the workspace instead of being told where it is, which is
correct from anywhere inside the repository rather than only from its root.

_Rejected, with reasons:_ (a) `"env": { "DATABASE_URL": "${DATABASE_URL}" }` in `.mcp.json` —
expansion reads **Claude Code's own** environment, which does not have it, so this silently yields
an empty string; (b) making the server load the file itself with a `dotenv` dependency resolved
from `CLAUDE_PROJECT_DIR` — that variable _is_ set in the server's environment, so this one would
work, but it adds a dependency and a second way to read configuration to solve a problem the
existing idiom already solves; (c) spelling `${CLAUDE_PROJECT_DIR:-.}/.env.local` into `.mcp.json`
— same defect as the launch path had, for the same reason.

**YELLOW-5 — Read-only rests on one guarantee and one fallback, not on three equal layers.**
Corrected in harden round 1; the original wording overstated the defence. What actually holds:

- **The guarantee** is `BEGIN READ ONLY` + the extended query protocol (`{ simple: false }`,
  passed explicitly on every call). Together these make Postgres refuse the write _and_ refuse to
  parse a second statement. Measured to survive even a deliberately poisoned session: with
  `default_transaction_read_only` forced `off`, `insert into jobs …` is still `25006` and
  `commit; …` is still `42601`.
- **The fallback** is `connection: { options: "-c default_transaction_read_only=on" }`, which only
  matters if the extended-protocol flag is ever lost. It is **not** independently durable: one
  `set session default_transaction_read_only = off` is accepted inside the read-only transaction
  and persists on the pooled connection, after which the fallback is gone entirely (land-mine 1b).
  What makes it durable is `max: 1` plus `RESET ALL` issued **before** every transaction, measured
  to restore the startup-packet value and re-block the bypass — including after a call that errored,
  which is why the reset runs before rather than after. **That durability claim holds for a direct
  connection and is why the server uses `DIRECT_DATABASE_URL` (§4):** all three of its parts are
  session-scoped, and a transaction pooler may silently drop the startup parameter, hand `RESET ALL`
  a different backend than the next `BEGIN READ ONLY`, and make a client-side `max: 1` meaningless.
  Against a pooled URL the fallback is undefined — the primary guarantee is not, being
  transaction- and message-scoped. The determinism is also **per in-flight call**, not global:
  `max: 1` serialises statements, so two parallel tool calls can interleave reset/reset/txn/txn and
  one of them runs on a session the other poisoned (§4). Same conclusion, measured in land-mine 1b
  — the fallback lapses for one call, AC 2 does not move — and deliberately not fixed with a mutex.
- **The timeout** is `SET LOCAL statement_timeout` inside every transaction. **10 seconds:** every
  honest query against a 627-row database returns in milliseconds, and 10s sits well inside Claude
  Code's own tool-call timeout while catching a runaway join fast. A source constant in
  `src/read-only.ts`, next to the code it governs (YELLOW-9).

The brief recommended `BEGIN READ ONLY` alone; §2 land-mine 1 measured that it is **defeated by a
payload beginning `commit;`**. _Rejected:_ a dedicated read-only role (land-mine 3 — it sees zero
rows under this repository's RLS, or needs migrations that belong to AI-26); parsing the SQL to
reject write keywords (a blocklist, defeated by `WITH … INSERT`, `SELECT … FOR UPDATE` and every
function with a side effect — and precisely the "enforced by prompt instruction" AC 2 forbids in
spirit). _Considered and not adopted:_ opening a fresh connection per tool call instead of resetting
one. It would also defeat the poisoning, at the cost of a connection handshake on every query, and
`RESET ALL` was measured to do the same job in one round trip.

**YELLOW-6 — `schema` and `describe-table` query the live catalog, not the Drizzle schema objects.**
AC 1's wording — "answers from a real query rather than from the schema file" — points here, and
three things make it more than compliance. The Drizzle objects describe _intent_; `pg_catalog`
describes _reality_, and this repository already has a hand-written migration
(`0001_pipeline-stages-seed-and-triggers.sql`) carrying triggers that exist in the database and in
no Drizzle object. A schema tool reading Drizzle would report a database with no triggers. It would
also miss the six enum types, the index definitions and the FK delete actions that §2 measured out
of `pg_get_constraintdef`. And it would make the tool a strictly worse version of
`Read packages/db/src/schema/*.ts`, which the agent can already do — the tool's entire value is
seeing what the file cannot. **Accepted cost:** the catalog returns SQL names
(`application_stage_transitions`), not Drizzle's camelCase (`applicationStageTransitions`). The
agent reads the schema files for those, which is the right source for them. This is the decision
that makes `packages/db/src/schema/relations.ts`'s comment stale — slice 8 fixes it.

**YELLOW-7 — Results cap at 100 rows by default, overridable per call to 1000, with the exact total
stated.** Measured row sizes span 149 B (`pipeline_stages`) to 1682 B (`jobs`); a 100-row page of
the largest table is ~29 KB, and the whole largest table uncapped is 87 KB. 100 is the point where a
page is still a useful sample and not a context-window event. The total is exact and free —
postgres.js materialises the result set, so `rows.length` is known before truncation, which is why
the notice can say "of 299" rather than "more were available". _Rejected:_ wrapping the user's SQL
in `select * from (…) limit n` — it breaks on trailing semicolons, `explain`, `show` and `copy`, and
buys nothing given the count is already free. _Rejected:_ a byte budget alongside the row cap — a
second mechanism for a tail case the measurements do not show (the largest full-table payload here
is 87 KB); RISK-3 records the trigger for adding it.

**YELLOW-8 — One `text` content block per tool result: a header line, a blank line, then
`JSON.stringify(rows, null, 2)`.** Agents read text; JSON is the least ambiguous rendering of a
result set, and pretty-printing costs bytes but makes column names greppable. _Rejected:_
`structuredContent` with a declared `outputSchema` — the SDK supports it, but it requires a schema
per tool and clients surface the text block anyway. _Rejected:_ an ASCII table — prettier to read,
lossy for nulls, nested JSON and long text, all of which this schema has (`applications.extraction`
is a JSONB column with a GIN index). Errors return `isError: true` plus the two-line form in §4;
`error.stack` never appears, and the connection string was verified absent from both message and
stack.

**YELLOW-9 — No new environment variable; `.env.example` gains no key (one comment is corrected).**
The four tunables are
source constants. `CLAUDE.md` requires that every key added to an env schema also lands in
`.env.example`, so the cheapest way to keep that contract honest is not to add keys nobody asked
for: `apps/mcp-db` owns zero environment keys and therefore needs no `src/env.ts` at all. It reads
`DIRECT_DATABASE_URL` by importing `@talentscout/db/env`, which is exactly what `CLAUDE.md` prescribes for
a workspace that needs another's value. Runtime tuning that is genuinely useful — `maxRows`,
`sampleRows` — is exposed **per call** as a tool input instead, where the agent can actually reach
it. _Rejected:_ `TALENTSCOUT_MCP_MAX_ROWS` / `TALENTSCOUT_MCP_STATEMENT_TIMEOUT_MS` — two keys, an
`src/env.ts`, two `.env.example` lines and a zod schema, to avoid editing a constant in a file the
engineer already has checked out. If a per-machine override is ever wanted, `.mcp.json`'s `env`
block is the place, and that is when `src/env.ts` gets created.

**Amended in harden round 2:** `.env.example` does gain a **comment** edit, though still no key.
Line 9 currently claims `DATABASE_URL` is "Read by the application at runtime from AI-43 onward",
which stops being true the moment this server reads `DIRECT_DATABASE_URL` instead (§4). Slice 8
corrects it in the same PR, exactly as it corrects the stale `relations.ts` comment, and slice 8's
DoD now asserts the invariant that actually matters — **no new `KEY=` line** — rather than the
proxy of an empty diff.

**YELLOW-10 — Vitest covers everything except the database; one scripted command covers the rest.**
The seam in §4 is what makes the split clean. **In `pnpm check` (no database, no subprocess):** tool
and resource registration, annotations, zod input rejection, the truncation notice and its
boundary, error rendering, catalog shaping, unknown-table handling, and — through a fake `sql` —
that the read-only preamble and the extended-protocol flag are actually issued. **Not in
`pnpm check`, because only Postgres can prove it:** that the write is refused, that the
statement-splitting bypass is refused, that the timeout fires, that the real catalog matches, and
that the error text is genuinely Postgres's. Those are slice 7's `pnpm mcp:verify`, a `cache: false`
turbo task in the shape `db:migrate` and `db:seed` already established for tasks that connect. The
existing `packages/db` tests are all pure and `pnpm check` must stay that way — slice 7's DoD
asserts it by running `pnpm check` with the database stopped.

**YELLOW-11 — `tables` is one resource at a fixed URI, not a `ResourceTemplate`.** AC 4 asks that
the resource "lists every table and is browsable"; a single `talentscout://tables` document
containing every table with its column and row counts is browsable in one read, and shows up in
`listResources()` without the client needing template expansion. A
`talentscout://tables/{table}` template would need a `list` callback returning the same information
anyway, and `describe-table` already covers the per-table case. _Rejected:_ the template — it
duplicates a tool that exists.

**YELLOW-12 — `apps/mcp-db` opens its own postgres.js connection and imports only
`@talentscout/db/env`.** It does not use `db` or `schema` from `@talentscout/db/client`. Three
reasons: `client.ts`'s pool is built without the `default_transaction_read_only` connection option
that YELLOW-5 depends on, caches itself on `globalThis`, and connects through the **pooled**
`DATABASE_URL`, so it cannot be made read-only for this consumer without changing it for the web
app; Drizzle's query builder does not expose `sql.begin("read only")` with a per-statement protocol
flag; and this server runs raw SQL by definition, so the ORM is not doing anything for it. It reads
**`env.DIRECT_DATABASE_URL`**, not `env.DATABASE_URL` — the session-scoped reason is in §4.
`postgres@^3.4.9` is pinned to the same range `packages/db` uses so the two never resolve to
different majors.

**YELLOW-13 — The postgres.js type gap is closed by a module augmentation, not a cast.** Land-mine
2: `{ simple: false }` is absent from `UnsafeQueryOptions` and fails to typecheck. One 7-line
`.d.ts` states the gap once, in a file whose name says what it is, and keeps every call site
honestly typed. _Rejected:_ `as never` / `as UnsafeQueryOptions & { simple: boolean }` at each call
site — a cast on the exact line that carries the security property is where a later refactor
quietly drops it.

**YELLOW-14 — The new `.mcp.json` entry states `"type": "stdio"` even though `chrome-devtools` omits
it.** stdio is the default, so this is redundant — deliberately. The ticket's own out-of-scope list
names "remote transport", and AI-44 adds a second server immediately; the registration file is where
that constraint is visible to a reader. Two words, zero risk. Delete it freely if review prefers
strict symmetry with the existing entry.

**YELLOW-15 — Exactly three tools and one resource. No extras.** No `explain`, no `sample`, no
`search`, no prompts. Every tool description is context tax on every session that loads this server
(RISK-7), and the ticket named four surfaces. `query` with a `LIMIT` covers sampling; `explain` is a
`query` away.

**YELLOW-16 — README changes: `## MCP` rewritten, `## Layout`, `## Scripts` and `## Database`
edited.** Slice 8 names the exact content. `## MCP` is the one that must be rewritten rather than
appended to — it currently describes a repository with one MCP server, and that is no longer true.

**YELLOW-18 — `QueryExecutor` carries a `params` slot.** Raised in harden round 1 and adopted:
the original single-argument signature would have forced slice 4 to interpolate table names into
SQL strings, which slice 4's own DoD forbids. `(statement, params?)` is the smallest change that
makes the contract honest. Note the trap it introduces — postgres.js picks the simple protocol when
the argument list is empty, so `{ simple: false }` must stay explicit on every call rather than
being left to fall out of "we pass parameters now".

**YELLOW-17 — This spec is committed to `docs/specs/ai-43-database-mcp.md`.** The convention exists
(`ai-130-theme-toggle.md`, `ai-34-domain-model.md`, `ai-40-module-claude-md.md`,
`ai-41-talentscout-cli-scaffold.md`), and the measured land-mines in §2 are worth more to the next
person than to this PR. Decline freely; nothing depends on it.

### Critic dispositions (harden round 1)

Verdict `CHANGES_REQUESTED`: one BLOCKER, three SHOULDs, three NITs. Every empirical finding was
re-measured against the live database rather than taken on report; two of them turned out to be
worse than described.

**[BLOCKER] `${CLAUDE_PROJECT_DIR:-.}` rationale contradicted itself and slice 6's DoD could not
catch it — ACCEPTED, construct deleted.** The finding is exactly right: §4 rode on the same `:-.`
fallback that YELLOW-4 rejected an alternative for, and hand-resolving the variable inside the DoD
made the check vacuous against its only failure mode. Measured `CLAUDE_PROJECT_DIR` **unset** in
this agent's environment, corroborating the finding. I could not settle the expansion semantics
from source — the Claude Code bundle is not readable on this machine — so rather than guess, the
design now **contains no variable to expand**:
`pnpm --silent --filter @talentscout/mcp-db run mcp`. Measured with `CLAUDE_PROJECT_DIR` deleted
from the child environment: repository root → `exit=0`; nested `apps/web/src` → `exit=0` (pnpm
walks up); `/tmp` → exits 0 with a pnpm message on stdout and no server; `/` → hangs scanning the
filesystem. `--filter` is strictly better than `--dir` + fallback, which breaks in the nested case.
New land-mine 7 records it, slice 6's DoD now spawns from two cwds with the variable deleted and
asserts the third fails, and RISK-4 carries the two bad rows.

**[SHOULD] "Degrades instead of vanishing" is measured FALSE, and layer (b) had no test coverage —
ACCEPTED, and the correction is larger than the finding.** Reproduced exactly: `set session
default_transaction_read_only = off` is accepted inside the read-only transaction and persists on
the pooled connection, after which the simple-protocol `commit;` bypass succeeds. Also reproduced:
`postgres(url, { options })` leaves the GUC `off` with no error, while
`postgres(url, { connection: { options } })` sets it `on` — a silent no-op if placed one level too
high. Two facts the finding did not have, both measured here: (i) the **primary** guarantee is
untouched by the poisoning — with the GUC forced off, `insert` is still `25006` and `commit; …`
still `42601` — so AC 2 never depended on layer (b); (ii) `RESET ALL` restores the startup-packet
value and re-blocks the bypass, and it must run **before** each transaction, because a call that
errors leaves the poison behind and would skip an after-the-fact cleanup. Adopted the finding's
whole minimum plus the stronger fix it invited: `max: 1` + pre-call `RESET ALL`, `connection: {
options }` named literally in §4 and slice 1, a `show default_transaction_read_only` = `on`
assertion in slice 7, and the poisoning case added to slice 7's matrix asserting a following write
is still refused. New land-mines 1b and 1c; YELLOW-5 rewritten from "three layers" to "one
guarantee and one fallback"; RISK-2 rewritten. _Declined:_ a fresh connection per call — same
effect, costs a handshake per query, and `RESET ALL` was measured to do it in one round trip.

**[SHOULD] `QueryExecutor` cannot carry parameters but slice 4 needs them — ACCEPTED.** Correct and
self-evident once stated: the contract as pinned would have forced the string interpolation slice
4's DoD forbids. Signature is now `(statement: string, params?: unknown[])`. Recorded the trap the
finding flagged — postgres.js selects the simple protocol at zero arguments, so `{ simple: false }`
stays explicit on every call. New YELLOW-18; slice 4 gains a DoD asserting table names arrive as
bind parameters and appear in no statement string.

**[SHOULD] Slice 1's lockfile assertion was vacuous — ACCEPTED, verified independently.**
`grep -c "@modelcontextprotocol/sdk@1.30.0" pnpm-lock.yaml` returns **2** on unmodified
`origin/main`, so "at least 2" passed by doing nothing. Now asserts ≥ 3, plus an `importers:`
entry for `apps/mcp-db`, plus the existing shadcn `(zod@3.25.76)` line surviving.

**[NIT] Pinned output copy was below design altitude — ACCEPTED.** §4 now states the _properties_
the header must carry (rows shown, exact total, the cap that cut it) with the sentence shown as an
illustration rather than a fixture, and the same for the error layout. Kept singular/plural, the
off-by-one boundary, and "no stack frame in output" — those are behaviour, not copy.

**[NIT] `schema` with an unknown name in `tables` was undefined — ACCEPTED.** It errors, matching
`describe-table`. One clause in §4, one DoD line in slice 4. A typo yielding "no columns" is worse
than one yielding "no such table".

**[NIT] Slice 6's `shasum` on `.claude/settings.json` verified a non-event — ACCEPTED, deleted.**
YELLOW-3's prose already records the decision not to touch that file.

**Residue check — no finding, but asked for and worth recording.** Both the critic's probes and
mine created temp objects (`pwn_b`, `pwn_c`, `probe_escape`) on the live database. Verified after
the fact: `pg_class` matches **zero** relations with those prefixes, and all seven table counts are
unchanged (8 / 60 / 90 / 299 / 43 / 120 / 7). Every one was a session-local temp table that vanished
with its connection. Slice 7's DoD now carries the same assertion so the shipped script is held to
it too.

**Scope held.** No new file, dependency, tool or slice. Net change: one `.mcp.json` argument shape,
one `RESET ALL`, one `params` slot, and eight DoD assertions that were vacuous or missing.

### Critic dispositions (harden round 2)

Verdict `CHANGES_REQUESTED`, converging: no BLOCKER, one SHOULD, two NITs, and round 1's items
confirmed resolved and not re-raised. All three adopted; no scope added.

**[SHOULD] The plan connected through the transaction-mode pooler, where every session-scoped
mechanism the fallback rests on is undefined — ACCEPTED, switched to `DIRECT_DATABASE_URL`.** The
finding's repo facts all check out verbatim: `.env.example:8` labels `DATABASE_URL` "Supavisor,
transaction mode"; `README.md` § Database says `db:migrate` and `db:seed` use the direct URL
"never the pooled URL: DDL and the migrator's advisory locks do not survive Supabase's transaction
pooler"; `packages/db/src/client.ts` scopes the pooled key to the request-path ORM client; and both
keys in `.env.local` are byte-identical direct connections, so **no local measurement could have
caught this** — the setup is structurally blind to the distinction, and `mcp:verify` inherits that
blindness. The finding is right that this is the same claim class round 1 already made me retract:
an unverified durability assertion. Took the finding's simplest option rather than logging the
assumption, because the repository has already decided this question — session-scoped work uses the
direct key, and all three of this server's mechanisms (startup-packet option, `max: 1`,
`RESET ALL`) are session-scoped. Switching also makes the specification match the evidence instead
of resting on measurements taken under a different key. Updated §4 (new paragraph with the full
argument), slice 3's wiring, slice 6's banner (which now names the **key** as well as the host, so
a revert to the pooled URL is visible on every start), slice 7 (asserts the key, and records that
`show default_transaction_read_only` = `on` is also the check that would catch a pooler dropping
the startup parameter), YELLOW-5 (durability claim now explicitly scoped to a direct connection),
YELLOW-12, RISK-1 and RISK-9. **Knock-on reconciled, as the finding required:** `.env.example:9`
claims `DATABASE_URL` is "Read by the application at runtime from AI-43 onward", which this change
falsifies — slice 8 now corrects that comment in the same PR, and its DoD swapped the
now-unsatisfiable "diff is empty" for the invariant that actually matters, that the set of `KEY=`
lines is unchanged from `origin/main`. Verified that assertion is satisfiable and runnable as
written. YELLOW-9's "no environment key" decision is unchanged; only its `.env.example` corollary
was amended.

**[NIT] The row cap bounds output, not work — ACCEPTED, one clause in RISK-3.** Correct, and the
cost was genuinely unrecorded while the benefit ("the exact total is free") was stated twice.
RISK-3 now says the cap counts _output_ rows, that `STATEMENT_TIMEOUT_MS` is the only bound on what
is actually pulled, and that the fix if it ever bites is a cursor — not a `LIMIT` wrapper, which
YELLOW-7 rejects for reasons this does not change.

**[NIT] `max: 1` serialises every tool call and that was unstated — ACCEPTED, one clause beside the
constant.** Added `max` to §4's constants table and a short paragraph: concurrent tool calls queue,
so one runaway query blocks the server for up to `STATEMENT_TIMEOUT_MS`. Accepted rather than
fixed — a single-developer dev tool issues one call at a time, and the alternative YELLOW-5 already
declined buys concurrency nobody asked for at the price of a handshake per query.

**Scope held.** No new file, dependency, tool, slice or constant beyond documenting the pool size
that was already pinned. Net change: one connection string, one `.env.example` comment, and three
DoD assertions.

### Critic dispositions (harden round 3)

Verdict `CHANGES_REQUESTED`: no BLOCKER, one SHOULD, two NITs; rounds 1 and 2 confirmed resolved
and not re-raised. All three adopted, all three as wording-and-one-assertion fixes with no new
machinery — which is what the findings asked for.

**[SHOULD] Slice 4's "no table name appears interpolated into any statement string" was false by
design, and the one path that does interpolate had zero coverage — ACCEPTED, both halves.** The
finding is right on the arithmetic and right about the class of error: this is the third time a
sentence has read like coverage while asserting nothing about the risky path, after the lockfile
`≥ 2` and the hand-resolved `CLAUDE_PROJECT_DIR`. §4 named one interpolation site; there are
**three** — `describe-table`'s `count(*)`, `describe-table`'s `sampleRows` sample query, and the
`tables` resource's per-table row count, which is the same statement seven times. §4 now lists all
three and states that they share a single validate-then-quote helper, the only place in the codebase
permitted to put an identifier into SQL. Slice 4's clause is scoped to **catalog filter** queries,
with the reason stated so nobody re-broadens it, and gains the assertion that was missing: a
`table` argument absent from the injected catalog fixture — including one carrying a quote or a
semicolon — returns `isError: true` **and** the fake executor records **zero** statements containing
any part of it. Slice 5's resource inherits the rule by construction, since it takes no argument and
its names come from the catalog itself. Kept the finding's framing that the blast radius is bounded
by the read-only transaction: this is hygiene with a test, not the thing standing between the agent
and a write.

**[NIT] `max: 1` does not make the reset deterministic under concurrent tool calls — ACCEPTED.** The
interleaving is real and I could not fault the trace: `runReadOnly` is two queued operations, so
A-reset, B-reset, A-transaction, B-transaction lets A's
`set session default_transaction_read_only = off` poison B despite B having reset;
`sql.begin` reserving the connection prevents a reset landing mid-transaction, not a poison landing
in that gap, and MCP clients may call tools in parallel. Corrected the constants table
("deterministic **for one in-flight call**"), added the trace and its consequence to §4, and scoped
the same claim in YELLOW-5. **Took the finding's advice not to fix it:** land-mine 1b already
measured that the primary guarantee is untouched by poisoning, so what lapses is the fallback for at
most one call — a mutex or a reserved connection would add a concurrency primitive to a
single-developer dev tool and buy nothing AC 2 needs.

**[NIT] README `## Testing` enumerates workspaces and would go stale in this same PR — ACCEPTED,
enumeration kept.** The finding offered either adding `apps/mcp-db` or dropping the enumeration; I
took the first. Three workspaces is still short enough to be worth reading, and naming
`apps/mcp-db` as the second node-environment Vitest workspace tells the next person where to find
the pattern to copy — which is most of what that paragraph is for. Recorded the revisit trigger (a
fourth workspace) rather than leaving it implicit. Slice 8 now edits five README sections, not four,
and its heading and DoD were corrected to match.

**Scope held.** No new file, dependency, tool, slice or constant. Net change: one enumeration in §4,
one scoped DoD clause, one added DoD assertion, one corrected constants-table cell, and one README
section added to slice 8.

---

## 7. Risks / land-mines

1. **RISK-1 — `DIRECT_DATABASE_URL` decides whether this is a demo tool or a PII pipe.** Today it points at
   a local Supabase holding 60 synthetic candidates, and this server's job is to read them into an
   agent's context. Point the same variable at a database with real candidates and every name, email
   and phone number the agent touches leaves the machine. The read-only guarantee does not help:
   it prevents damage, not disclosure. Mitigations in this plan are deliberately cheap — the startup
   banner names the host and database on stderr (slice 6), and the README says so in plain words
   (slice 8). **This is the one decision in §0 that a reviewer should re-take rather than ratify if
   the hosted Supabase project ever holds real data.**
2. **RISK-2 — the whole security property hangs on one word, `simple`.** Delete `{ simple: false }`
   in a refactor and the `commit;` bypass returns, silently, with every unit test still green
   (land-mine 1). Three things defend it: the unit test asserting the flag was passed (slice 1), the
   live statement-splitting matrix in `pnpm mcp:verify` (slice 7), and the
   `default_transaction_read_only` fallback — but **only** the first two are reliable. Harden round
   1 measured that the fallback is disarmed permanently by one
   `set session default_transaction_read_only = off` on the pooled connection (land-mine 1b); it is
   worth something again only because of the pre-call `RESET ALL`, which is itself one line someone
   could delete. It stays the top technical risk because none of these run automatically in CI —
   `mcp:verify` needs a database and is deliberately outside `pnpm check`.
3. **RISK-2b — the connection option fails silently when misplaced.** `options` at the top level
   instead of under `connection` leaves the GUC `off` with no error and no warning (land-mine 1c).
   Nothing in the type system distinguishes them; only slice 7's
   `show default_transaction_read_only` assertion does.
4. **RISK-3 — the cap counts rows, not bytes, and it counts _output_ rows, not work.** 100 rows of
   `pipeline_stages` is 15 KB; 100 rows of a wide join could be 200 KB. The measurements do not
   justify a byte budget today — the largest full-table payload on this database is 87 KB — but the
   trigger for adding one is concrete: the first time a real query returns over ~100 KB of text,
   add a character budget beside the row cap and state both in the notice. Separately, and noted in
   harden round 2: because postgres.js materialises the whole result set before the cut (which is
   what makes the exact total free), the cap bounds **what is returned, not what is pulled**.
   `select … from generate_series(1, 10_000_000)` or an accidental cartesian join buffers in the
   server process first, and `STATEMENT_TIMEOUT_MS` is the only thing bounding that. Harmless on a
   627-row database; the fix if it ever bites is a cursor, not a `LIMIT` wrapper (YELLOW-7 rejects
   wrapping for good reasons that do not change here).
5. **RISK-4 — the launch depends on cwd being inside the repository, and fails confusingly when it
   is not.** Measured with `CLAUDE_PROJECT_DIR` unset: from `/tmp`, `pnpm --filter` exits **0**
   while printing `No projects matched the filters` on stdout — a non-JSON byte on the wire and a
   zero exit code, which is the worst combination for diagnosing a dead server; from `/` it hangs
   scanning the filesystem for workspace projects. Neither is in the operating envelope — a
   project-scoped `.mcp.json` is launched from the project — but neither announces itself either.
   Slice 6's DoD asserts the `/tmp` case is a known failure so nobody later mistakes it for
   working. `pnpm` must also be on `PATH`; it normally is, since Claude Code inherits the launching
   shell's environment, but a GUI launch with a minimal `PATH` fails with a bare `ENOENT`. The
   escape hatch for all of these is measured and cwd-independent: an absolute
   `<pkg>/node_modules/.bin/tsx` plus an absolute path to `src/main.ts`, with the server reading the
   environment file itself. Do not pre-build it; know it exists.
6. **RISK-5 — pnpm may run a dependency check before the script, delaying first connect.** The §2
   probe showed `pnpm run` emitting `Already up to date` before the script started. `--silent`
   removes it from stdout, but not the time it took. If registration ever fails with a startup
   timeout, `.mcp.json` accepts a `timeout` field; try that before restructuring the launch.
7. **RISK-6 — the SDK pulls a large dependency tree for a process that only speaks stdio.**
   `@modelcontextprotocol/sdk@1.30.0` depends on `express`, `hono`, `@hono/node-server`, `jose`,
   `cors`, `ajv`, `express-rate-limit` and `eventsource` — all of it for the HTTP transports this
   ticket explicitly does not use. It is already in the store as a shadcn transitive, so the install
   cost is near zero, but it is dependency surface in a repository that otherwise keeps its
   packages thin.
8. **RISK-7 — every tool description is charged to every session that loads this server.** Three
   tools and a resource is a small tax; it is not zero, and it grows every time someone adds "just
   one more tool". YELLOW-15 is the standing answer.
9. **RISK-8 — `copy … to stdout` is a read, is allowed, and does not return rows.** Measured: it
   comes back as a Node `Readable`, which `JSON.stringify` renders as stream internals. It is not a
   security problem — nothing is written — but it is a confusing output. Cheapest honest fix if it
   ever comes up: check that the result is an array and otherwise return a one-line explanation.
   Not worth pre-building.
10. **RISK-9 — AI-26 can silently empty this server.** Every table has RLS enabled with zero
    policies, and this works only because the `postgres` role has `rolbypassrls`. The moment AI-26
    adds policies and switches that URL to a non-bypassing role, `query` starts returning zero rows
    with no error at all — the worst possible failure mode for a tool whose job is to be trusted.
    `pnpm mcp:verify`'s "candidates = 60" assertion is what catches it, which is another reason that
    script is a deliverable rather than a one-time transcript.
11. **RISK-10 — AI-44 lands immediately after and will want to share something.** Resist until it
    exists: two MCP servers with one shared helper each is not a package. `CLAUDE.md`'s "extract a
    package when a second consumer exists, not before" applies, and the honest moment to re-read it
    is when `apps/mcp-posthog` is written, not now.
