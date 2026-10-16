# ai-eng-training

A Turborepo monorepo on pnpm workspaces: Next.js 16 (App Router) + TypeScript + Tailwind v4 +
shadcn/ui, with Drizzle ORM in its own package.

## The project

This repository is coursework for a 20-day AI Engineering training programme, and the product
built across all of it is **TalentScout** — an AI recruiting copilot.

One product carries every exercise, so the work compounds instead of producing twenty
disconnected demos. The domain is **jobs**, **candidates**, **applications**, **interviews** and
**notes**, and it was chosen because the hardest days of the programme fall out of it naturally:

| Day | Needs                                   | TalentScout supplies                                       |
| --- | --------------------------------------- | ---------------------------------------------------------- |
| 5   | A real database and an analytics funnel | Jobs/candidates/applications schema, the apply funnel      |
| 9   | Data worth visualising                  | Hiring funnel, time-to-hire, source quality                |
| 13  | A 50+ document corpus                   | Resumes, job descriptions, interview guides, policies      |
| 14  | Scraping and browser goals              | Job boards and company careers pages                       |
| 16  | Voice **and** video                     | AI phone screen; recorded video-interview analysis         |
| 17  | Job posting / invoice / email schemas   | Postings, agency fee invoices, candidate email threads     |
| 18  | A long pipeline with human approval     | Application intake → extract → recruiter review → store    |
| 20  | A startup brief to design against       | Brief C (sales intelligence) maps almost 1:1 onto the code |

Work is tracked in Linear under the project **TalentScout — AI Eng Training**: one milestone per
week, one parent issue per day, and sub-issues sized so each is a single PR.

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

App runs at http://localhost:3000.

`.env.local` stays at the repository root and serves every workspace. Next.js only reads `.env`
files from its own project directory and never from a parent, so `apps/web` and `packages/db`
are both launched through `dotenv -e ../../.env.local --`. One file to edit, no copies to drift.

## Scripts

Run these from the repository root. Turbo fans each one out to the workspaces that define it and
caches the results, so re-running with nothing changed is nearly instant.

| Script             | What it does                                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`         | Dev server                                                                                                       |
| `pnpm build`       | Production build                                                                                                 |
| `pnpm start`       | Serve the production build                                                                                       |
| `pnpm typecheck`   | `next typegen` in the app, then `tsc --noEmit` in every workspace                                                |
| `pnpm lint`        | ESLint (`lint:fix` to autofix)                                                                                   |
| `pnpm format`      | Prettier write (`format:check` to verify)                                                                        |
| `pnpm test`        | Vitest once (`test:watch`, `test:coverage`)                                                                      |
| `pnpm check`       | typecheck + lint + test, then format:check                                                                       |
| `pnpm db:generate` | Generate migration SQL from `packages/db/src/schema/` — no connection                                            |
| `pnpm db:check`    | Validate the migration folder — no connection                                                                    |
| `pnpm db:export`   | Print the full generated DDL to stdout — no connection                                                           |
| `pnpm db:migrate`  | Apply migrations (connects — see [Database](#database))                                                          |
| `pnpm db:seed`     | Insert the demo dataset (connects — see [Database](#database))                                                   |
| `pnpm mcp:verify`  | Prove the `talentscout-db` MCP server's read-only guarantee against a live database (connects — see [MCP](#mcp)) |

To work in one workspace, filter: `pnpm --filter @talentscout/web test`.

Formatting is the one task Turbo does not fan out. Prettier's import-sort and Tailwind-class
plugins need a single shared config and one view of the tree, so `pnpm format` is one root pass
over everything.

## Layout

The repository is a Turborepo monorepo because several of the deployable surfaces the programme
builds against one product share a contract: the later days add a scraper, a long-running
extraction pipeline and a voice service, and each of those writes against the same schema under
the same lint and TypeScript rules as the web app. A single Next.js project would have forced
either duplication or a deep-relative import mess between them.

Belonging to the same programme is not what earns a surface a place here; one deliberately does
not share that contract and lives in its own repository, as [Related
repositories](#related-repositories) explains.

```
apps/
  mcp-db/                 @talentscout/mcp-db — stdio MCP server over the database (see MCP)
  mcp-posthog/            @talentscout/mcp-posthog — stdio MCP server over PostHog analytics (see MCP)
  web/                    @talentscout/web — the Next.js application
    src/
      app/                App Router routes, layouts, route handlers
        api/
          CLAUDE.md       Route handler conventions
      components/         Shared React components
        CLAUDE.md         Component conventions
        ui/               shadcn/ui primitives (generated — edit freely, they are yours)
      hooks/              Client-side React hooks
      lib/                Framework-free code (cn, formatters, the logger, data loaders)
      types/              Shared, app-wide types
      env.ts              NODE_ENV and NEXT_PUBLIC_APP_URL, zod-validated
packages/
  db/                     @talentscout/db — Drizzle schema, migrations, seed, DB env
  eslint-config/          @talentscout/eslint-config — `base` and `next`
  typescript-config/      @talentscout/typescript-config — the tsconfig bases
```

`apps/mcp-db` and `apps/mcp-posthog` have no build or start script and nothing imports them, but
they are deployed — to every engineer's Claude Code, through `.mcp.json` — which is what
"deployable" means here; the CLI below is this layout's other deliberate exception, decided the
opposite way.

**Two convention tiers.** The root `CLAUDE.md` holds rules that apply everywhere; the two folder
`CLAUDE.md` files above hold the module-local detail it leaves out, and load when Claude reads any
file in that folder's **subtree** — no _source_ file sits directly inside either.

Import alias: `@/*` maps to the **current workspace's** `src/*`. Across workspaces, import by
package name — `@talentscout/db/schema/jobs` — never by a relative path that climbs out of one
workspace into another. Turbopack transpiles workspace packages automatically, so no
`transpilePackages` entry is needed.

Only what a second workspace would genuinely share was extracted. `packages/db` exists because
the schema is the contract every later surface writes against; the ESLint and TypeScript configs
exist so a new workspace inherits the rules instead of re-deciding them. There is deliberately
no shared Tailwind package: Tailwind v4 has no JS config, and the theme lives in a `globals.css`
that `shadcn add` rewrites — a package would only fight that. Everything else stays inside its
single caller until a second one appears.

## Related repositories

| Repository        | Where                                                 | What it is                                                  |
| ----------------- | ----------------------------------------------------- | ----------------------------------------------------------- |
| `talentscout-cli` | [arthurterozendi-plank/talentscout-cli][cli] (public) | The Week 2 CLI chatbot, and the Day 7 tool sandbox after it |

[cli]: https://github.com/arthurterozendi-plank/talentscout-cli

Clone it beside this repository — the two are siblings, and nothing links them at the filesystem
level.

The CLI is the deliberate exception to the layout above: it lives in its own repository rather
than under `apps/`. Day 4 of the programme practises switching between workspaces, which is only
a real exercise when the two are genuinely separate — its own lockfile, its own lint and
TypeScript rules, its own CLAUDE.md. An `apps/cli` directory would have inherited all three from
this repository and taught nothing.

It shares no code with this repository, and the tooling could not be shared even if it should be:
`@talentscout/eslint-config` and `@talentscout/typescript-config` are private and linked with
`workspace:*`, so they are unreachable across a repository boundary. The CLI also runs
`moduleResolution: "nodenext"` where the web app runs `bundler`, which changes how its imports
must be written — a rule that contradicts this repository's rather than extending it.

If the CLI later needs the hiring schema, `@talentscout/db` gets published rather than reached
into.

## Environment variables

Each workspace validates the keys it owns, in its own `src/env.ts` — the only module in that
workspace allowed to touch `process.env`:

| Workspace          | Owns                                                                 |
| ------------------ | -------------------------------------------------------------------- |
| `apps/web`         | `NODE_ENV`, `NEXT_PUBLIC_APP_URL`                                    |
| `packages/db`      | `DATABASE_URL`, `DIRECT_DATABASE_URL`                                |
| `apps/mcp-posthog` | `POSTHOG_API_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` |

Ownership follows the code that reads the value, so a package carries its own contract instead
of depending on an application to validate it for it. A workspace that needs another's value
imports it (`@talentscout/db/env`) rather than reading the variable a second time.

Add the variable to the owning workspace's schema, then to the root `.env.example`. Anything the
browser reads must be prefixed `NEXT_PUBLIC_`. Import `env` instead of touching `process.env`
directly — invalid config then fails loudly at startup rather than silently at runtime.

**Developer-tool keys are local-only.** `.env.example` has two sections, split by a line reading
exactly `# @local-only`. Keys above it are the deploy contract: `/pre-deploy` fails when any of
them has no value. Keys below it are read only by tools that run on an engineer's machine — an
MCP server's credentials — and never by anything deployed, so the gate does not require them. The
reason is what such a key usually is: a developer's personal API key. Requiring it to deploy would
force a deploy environment to hold one person's credentials just to pass a check, which is worse
than the drift it guards against. Local-only keys are still declared, so the drift check still
reports a schema key that appears in neither section.

`apps/mcp-posthog` is the one exception to failing at startup: `.mcp.json` launches it for every
engineer, including ones with no PostHog key yet, and a server that dies at launch shows up in
Claude Code as a bare "failed". So it always starts, and every tool call it cannot make names the
missing or invalid keys instead. Its three keys ship empty in `.env.example`'s `# @local-only`
section: a developer tool's credentials, which a deploy never requires.

## Database

Everything database-related lives in `packages/db`: schema under `packages/db/src/schema/`
(Drizzle ORM, one table per file), committed migrations under `packages/db/drizzle/`, and the
migrate and seed scripts under `packages/db/scripts/`. It is a package rather than a folder in
the app because the schema is the contract every future surface writes against, and none of it
is framework-specific.

`packages/db/drizzle.config.ts` declares no `dbCredentials`, so `db:generate`, `db:check` and
`db:export` never open a connection — only `db:migrate` and `db:seed` do, against Postgres.

Two connection strings, both validated in `packages/db/src/env.ts`:

- `DATABASE_URL` — the pooled connection (Supavisor, transaction mode). `packages/db/src/client.ts`
  reads it to build `db`, the runtime client every request-path query goes through. Its pool is
  cached on `globalThis` so Next's hot reload cannot leak a connection per edit.
- `DIRECT_DATABASE_URL` — the direct connection. **`pnpm db:migrate`, `pnpm db:seed`, and the
  `talentscout-db` MCP server (see [MCP](#mcp)) all use this one**, never the pooled URL: DDL, the
  migrator's advisory locks, and the MCP server's own read-only guarantees are all session-scoped
  and do not survive Supabase's transaction pooler. The MCP server reads inside a read-only
  transaction and cannot write, which is what keeps this section's "the seed has no reset path"
  safety story coherent even though `DIRECT_DATABASE_URL` may point at the hosted project. Read-only
  prevents damage, not disclosure, though: pointing this key at a database holding real candidates
  sends their names, emails and phone numbers into whatever agent context reads them.

```bash
cp .env.example .env.local   # fill in both URLs — supabase status prints the local defaults
pnpm db:migrate               # applies drizzle/*.sql, including the seeded pipeline_stages rows
pnpm db:seed                  # inserts the demo dataset: jobs, candidates, applications, …
```

`pnpm db:migrate --dry-run` lists the migration files present in `drizzle/` without opening a
connection — it never reads which of them are already applied, so it is a folder listing, not a
plan. `pnpm db:seed --dry-run` builds and prints the dataset's row counts without
connecting to anything. Both are useful for a sanity check before pointing either at a real
database.

**The seed has no reset path — deliberately.** It refuses with a non-zero exit and names every
already-populated table (`jobs`, `candidates`, `applications`, `application_stage_transitions`,
`interviews`, `notes`) rather than emptying or overwriting anything, and there is no `--force`
or `--clean` flag that would make it do otherwise. `DIRECT_DATABASE_URL` may point at the hosted
Supabase project, and a table-emptying code path is a standing risk to real data that this repo
does not need: to re-seed locally, use the Supabase CLI's own local re-initialisation workflow,
which re-runs every migration against a freshly emptied database. Hosted is seeded once.

## Analytics

The hiring funnel is six named events — `job_viewed`, `application_started`, `resume_uploaded`,
`application_submitted`, `application_stage_changed`, `offer_made` — validated by
`apps/web/src/lib/analytics/` (`properties.ts`, `events.ts`, `capture.ts`). The full contract,
including the per-event property table, lives in
[`docs/specs/ai-45-funnel-analytics.md`](docs/specs/ai-45-funnel-analytics.md); this section
records only the decisions.

**Every name is `object_action`: lowercase snake_case, at least two segments, past tense, no
namespace prefix.** Formally, the final segment must end in `ed` or appear in an explicit
irregular allow-list — today just `made`, for `offer_made` — so a new event can't be added
without the review that extending that list forces.

**Every property is a uuid or a member of a closed enum — never free text, and that is structural,
not filtered.** No event property has a type that could hold a candidate's name, email address or
résumé text, so none of the three is stripped out of an event; each is unrepresentable by
construction. `candidate_id` is deliberately never sent either: an event's job id and application
id are pseudonymous keys that only this database can join back to a person.

**`captureAnalyticsEvent(event, sink)` takes its sink as an explicit argument**, which is the
entire seam between this catalog and wherever an event actually goes. This repository ships the
validated catalog and the one choke point every event passes through before it leaves the
process; it adds no PostHog dependency, no env key and no client init. Wiring a live sink — a
PostHog browser client, its env key, and the surfaces that would actually call
`captureAnalyticsEvent` — is separate, not-yet-started work.

**Renaming an event is not retroactive.** Once a name has been captured, historical rows keep the
old name forever — a rename does not rewrite them, it splits one funnel into two spellings. Get
the name right before the first real event ships.

## Adding shadcn/ui components

```bash
pnpm dlx shadcn@latest add dialog
```

Run it from `apps/web` — config lives in `apps/web/components.json` (style `radix-nova`, Lucide
icons, CSS variables), and the generated files land in `apps/web/src/components/ui/`.

## Theming

Light and dark are both first-class. `globals.css` carries the full shadcn variable set under
`:root` and a second set under `.dark`, and `@custom-variant dark (&:is(.dark *))` makes every
`dark:` utility key off that class. An inline script the root layout renders puts that class on
`<html>`, and the toggle maintains it thereafter; the recruiter's choice is persisted
client-side in `localStorage` under `talentscout-theme`.

The class is applied by an inline `<script>` in `<head>`, rendered from `THEME_INIT_SCRIPT` in
`apps/web/src/lib/theme.ts`. The browser runs it synchronously while parsing
the document, so the first paint is already in the right theme instead of flashing light and
correcting after hydration — which is also why `<html>` carries `suppressHydrationWarning`. A
cookie would let the server render the theme instead, but reading one in the root layout opts the
whole app out of static prerendering, and nothing server-side needs to know the theme.

The script only ever toggles one class, never assigns `className`: `<html>` also carries the font
classes, so overwriting the list would render the page unstyled. A stored value that is not a
theme falls back to the operating system's preference, then to light.

**No `next-themes`.** It solves the same problem, but the flash-prevention and hydration
mechanics have to be understood here regardless — the layout's `suppressHydrationWarning` is
unexplainable without them — and the app already owns that story through
`apps/web/src/hooks/use-mounted.ts`. The whole feature is one module and one button.

The system preference seeds the default only. Once a recruiter picks a theme, changing the OS
setting no longer moves the app.

## Routes

| Route         | Purpose                                                         |
| ------------- | --------------------------------------------------------------- |
| `/`           | Home page                                                       |
| `/api/status` | Health check — can the backend reach its database, which build? |

```bash
curl -si http://localhost:3000/api/status
# 200 {"status":"ok","database":"ok","environment":"development","uptimeSeconds":1,"timestamp":"..."}
# 503 {"status":"unhealthy","database":"unreachable","correlationId":"...","environment":...}
```

It runs `select 1` over the pooled `DATABASE_URL` — the path every request takes — bounded by the
same 5-second deadline as feature reads (see [Failure handling](#failure-handling)). A refused or
failing connection reports `database: "unreachable"`, one slower than the deadline `"timeout"`,
both with **`503`**, not the `500` the API routes use for unexpected errors: the handler did its
job, which is reporting a dependency down, and monitors and load balancers read `503` as
"temporarily unavailable" where a `500` would look like the check itself crashing.

`force-dynamic` + `Cache-Control: no-store` on both outcomes, so it is never prerendered or
cached — a cached health check reports stale liveness, and a cached "ok" during an outage is the
worst answer it could give.

## Failure handling

The candidate profile (`/candidates/[id]` and `GET /api/candidates/[id]`) is the feature taken all
the way: a recruiter who hits a failure sees what happened and a way to try again, and the engineer
they report it to can find the exact log line. `/jobs` predates it and has an inline retry but no
correlation id.

How to tell a hardened feature is broken lives in **`docs/runbooks/`**, one file per feature —
[`candidate-profile.md`](docs/runbooks/candidate-profile.md) is the first. Runbooks are kept apart
from `docs/specs/` because a spec records a ticket's design as it was built and is not revisited,
while a runbook has to describe the system as it runs now and changes whenever the failure
behaviour does; this README records the decisions behind that behaviour, not the procedure for
diagnosing it. Production hardening (AI-122) extends the folder as more features get this
treatment.

- **One JSON line per failure, no logging dependency.** `logServerError` in
  `apps/web/src/lib/logger.ts` writes `level`, `message`, `correlationId`, `time`, the error's
  name, message, code and stack, and any context, as a single line through `console.error`. Next
  and Vercel capture stderr as-is, and a JSON line is searchable by id without a library to keep
  current.
- **A correlation id ties what the client saw to that line.** A random uuid is created where the
  failure is caught. The API's `500` returns it as `correlationId`; the page shows it as
  "Reference: …" under the explanation. It is opaque by construction — the detail, which can name
  hosts and ports, stays in the log.
- **Every database read gets 5 seconds, enforced in the app.** `withDatabaseTimeout`
  (`apps/web/src/lib/database-timeout.ts`) is the only deadline that bounds the whole wait a
  recruiter sees — pool queue, connect (postgres.js defaults to 30 s) and statement — and needs no
  change to the shared `packages/db` client. It releases the _request_, not the connection: the
  abandoned read holds its pooled connection until Postgres answers. It does not cancel the query,
  because postgres.js 3.4.9's `Query.cancel()` drops the promise that rejects when the cancel
  connection fails, which would surface as an unhandled rejection exactly when the database is in
  trouble.
- **Load failures are handled on the page; render errors by the boundary.** In production Next
  replaces a Server Component error's message before it reaches `error.tsx`, so a boundary cannot
  tell a timeout from an outage. The page therefore catches its own load and says which it was; a
  segment `error.tsx` catches anything thrown after a successful load and quotes Next's `digest`,
  the id Next prints beside the error in its own server log. `notFound()` is called outside the
  load's `try`, since it works by throwing.

## Testing

Tests live next to their subject as `*.test.ts(x)` under the workspace's `src/`. Each workspace
configures its own Vitest: `apps/web` runs jsdom with Testing Library (setup in
`apps/web/vitest.setup.ts`); `packages/db`, `apps/mcp-db` and `apps/mcp-posthog` run the node
environment with no DOM at all — both MCP servers' `vitest.config.mts` is copied from
`packages/db`'s, the pattern to copy for the next workspace with no browser code.

## MCP

`.mcp.json` registers three servers.

[chrome-devtools](https://github.com/ChromeDevTools/chrome-devtools-mcp) gives coding agents a
real Chrome for navigation, DOM inspection, console logs, network traces, and performance traces.

`talentscout-db` (`apps/mcp-db`) gives an agent the live database instead of the schema files it
would otherwise have to guess from: `query` runs arbitrary SQL, `schema` and `describe-table` read
the Postgres catalog directly — so triggers, enum types and FK delete actions that no Drizzle file
describes are visible too — and the `talentscout://tables` resource lists every table with its
column and row counts. It is **read-only by construction, not by prompt instruction**: the SQL you
send runs inside `BEGIN READ ONLY` over the extended query protocol, which is what stops a payload
like `commit; drop table jobs` from smuggling a second statement past the transaction — a bare
`BEGIN READ ONLY` alone does not catch that. Read-only means no writes, not no side effects — a
statement can still take a lock, signal another backend, or (on a self-hosted Postgres where
`DIRECT_DATABASE_URL` names a real superuser, not this project's Supabase role) run a program via
`COPY … TO PROGRAM`, which `BEGIN READ ONLY` does not refuse because it writes nothing to the
database — so every call resets session state and releases advisory locks before it runs. `query`
results are capped at 100 rows by default, with the exact total always stated and a per-call
`maxRows` override up to 1000.

`talentscout-posthog` (`apps/mcp-posthog`) lets an agent check instrumentation against what
PostHog actually recorded instead of taking an engineer's word for it — the verify half of the
instrument-then-verify loop. `check-event-fired` answers whether an event arrived in the last N
minutes, `get-events` lists recent events with their full properties, and
`get-event-definitions` lists every defined event with the properties PostHog has seen on it. Its
design rests on one rule: **a failure is never an empty answer.** An invalid key, a missing scope,
a rate limit, a timeout or an unreadable response is a tool error that says it concluded nothing;
`NOT FIRED` comes only from a count PostHog actually returned as zero, and every query bypasses
PostHog's result cache, because a cached zero is a false negative. Events are read through
PostHog's HogQL `/query` endpoint, the documented replacement for its deprecated events API, with
every caller-supplied string bound as a placeholder value rather than spliced into the query. It
needs a personal API key with `query:read`, `event_definition:read` and
`property_definition:read`, and whatever PostHog holds reaches the agent's context — so
autocapture, which records form input outside the event catalog, must stay off in the project it
reads. Rationale and the live-verification checklist: `docs/specs/ai-44-posthog-mcp.md`.

Approve each server when your MCP client prompts on first run.
