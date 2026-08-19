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

| Script             | What it does                                                          |
| ------------------ | --------------------------------------------------------------------- |
| `pnpm dev`         | Dev server                                                            |
| `pnpm build`       | Production build                                                      |
| `pnpm start`       | Serve the production build                                            |
| `pnpm typecheck`   | `next typegen` in the app, then `tsc --noEmit` in every workspace     |
| `pnpm lint`        | ESLint (`lint:fix` to autofix)                                        |
| `pnpm format`      | Prettier write (`format:check` to verify)                             |
| `pnpm test`        | Vitest once (`test:watch`, `test:coverage`)                           |
| `pnpm check`       | typecheck + lint + test, then format:check                            |
| `pnpm db:generate` | Generate migration SQL from `packages/db/src/schema/` — no connection |
| `pnpm db:check`    | Validate the migration folder — no connection                         |
| `pnpm db:export`   | Print the full generated DDL to stdout — no connection                |
| `pnpm db:migrate`  | Apply migrations (connects — see [Database](#database))               |
| `pnpm db:seed`     | Insert the demo dataset (connects — see [Database](#database))        |

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
  web/                    @talentscout/web — the Next.js application
    src/
      app/                App Router routes, layouts, route handlers
      components/         Shared React components
        ui/               shadcn/ui primitives (generated — edit freely, they are yours)
      hooks/              Client-side React hooks
      lib/                Framework-agnostic helpers (cn, formatters)
      types/              Shared, app-wide types
      env.ts              NODE_ENV and NEXT_PUBLIC_APP_URL, zod-validated
packages/
  db/                     @talentscout/db — Drizzle schema, migrations, seed, DB env
  eslint-config/          @talentscout/eslint-config — `base` and `next`
  typescript-config/      @talentscout/typescript-config — the tsconfig bases
```

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

| Workspace     | Owns                                  |
| ------------- | ------------------------------------- |
| `apps/web`    | `NODE_ENV`, `NEXT_PUBLIC_APP_URL`     |
| `packages/db` | `DATABASE_URL`, `DIRECT_DATABASE_URL` |

Ownership follows the code that reads the value, so a package carries its own contract instead
of depending on an application to validate it for it. A workspace that needs another's value
imports it (`@talentscout/db/env`) rather than reading the variable a second time.

Add the variable to the owning workspace's schema, then to the root `.env.example`. Anything the
browser reads must be prefixed `NEXT_PUBLIC_`. Import `env` instead of touching `process.env`
directly — invalid config then fails loudly at startup rather than silently at runtime.

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
- `DIRECT_DATABASE_URL` — the direct connection. **Both `pnpm db:migrate` and `pnpm db:seed`
  use this one**, never the pooled URL: DDL and the migrator's advisory locks do not survive
  Supabase's transaction pooler.

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

| Route         | Purpose                                             |
| ------------- | --------------------------------------------------- |
| `/`           | Home page                                           |
| `/api/status` | Liveness check — is the backend up and which build? |

```bash
curl -s http://localhost:3000/api/status
# {"status":"ok","environment":"development","uptimeSeconds":1,"timestamp":"..."}
```

`force-dynamic` + `Cache-Control: no-store`, so it is never prerendered or
cached — a cached health check reports stale liveness.

## Testing

Tests live next to their subject as `*.test.ts(x)` under the workspace's `src/`. Each workspace
configures its own Vitest: `apps/web` runs jsdom with Testing Library (setup in
`apps/web/vitest.setup.ts`), and `packages/db` runs the node environment with no DOM at all.

## MCP

`.mcp.json` registers the [chrome-devtools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp),
giving coding agents a real Chrome for navigation, DOM inspection, console logs,
network traces, and performance traces. Approve the server when your MCP client
prompts on first run.
