# ai-eng-training

AI Engineering Training — Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui.

## Getting started

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

App runs at http://localhost:3000.

## Scripts

| Script             | What it does                                                       |
| ------------------ | ------------------------------------------------------------------ |
| `pnpm dev`         | Dev server                                                         |
| `pnpm build`       | Production build                                                   |
| `pnpm start`       | Serve the production build                                         |
| `pnpm typecheck`   | `tsc --noEmit`                                                     |
| `pnpm lint`        | ESLint (`lint:fix` to autofix)                                     |
| `pnpm format`      | Prettier write (`format:check` to verify)                          |
| `pnpm test`        | Vitest once (`test:watch`, `test:coverage`)                        |
| `pnpm check`       | typecheck + lint + format:check + test                             |
| `pnpm db:generate` | Generate migration SQL from `src/lib/db/schema/` — no connection   |
| `pnpm db:check`    | Validate the `drizzle/` migration folder — no connection           |
| `pnpm db:export`   | Print the full generated DDL to stdout — no connection             |
| `pnpm db:migrate`  | Apply `drizzle/` migrations (connects — see [Database](#database)) |
| `pnpm db:seed`     | Insert the demo dataset (connects — see [Database](#database))     |

## Layout

```
src/
  app/          App Router routes, layouts, route handlers
  components/   Shared React components
    ui/         shadcn/ui primitives (generated — edit freely, they are yours)
  hooks/        Client-side React hooks
  lib/          Framework-agnostic helpers (cn, formatters, clients)
  types/        Shared, app-wide types
  env.ts        Zod-validated environment variables
```

Import alias: `@/*` maps to `src/*`.

## Environment variables

Add the variable to the matching schema in `src/env.ts`, then to `.env.example`.
Anything the browser reads must be prefixed `NEXT_PUBLIC_`. Import `env` from
`@/env` instead of touching `process.env` directly — invalid config then fails
loudly at startup rather than silently at runtime.

## Database

Schema lives under `src/lib/db/schema/` (Drizzle ORM, one table per file); generated migrations
are committed under `drizzle/`. `drizzle.config.ts` declares no `dbCredentials`, so
`db:generate`, `db:check` and `db:export` never open a connection — only `db:migrate` and
`db:seed` do, against Postgres.

Two connection strings, both validated in `src/env.ts`:

- `DATABASE_URL` — the pooled connection (Supavisor, transaction mode). Nothing in this
  repo reads it yet; it is reserved for the runtime client a later change adds.
- `DIRECT_DATABASE_URL` — the direct connection. **Both `pnpm db:migrate` and `pnpm db:seed`
  use this one**, never the pooled URL: DDL and the migrator's advisory locks do not survive
  Supabase's transaction pooler.

```bash
cp .env.example .env.local   # fill in both URLs — supabase status prints the local defaults
pnpm db:migrate               # applies drizzle/*.sql, including the seeded pipeline_stages rows
pnpm db:seed                  # inserts the demo dataset: jobs, candidates, applications, …
```

`pnpm db:seed --dry-run` builds and prints the dataset's row counts without connecting to
anything — useful for a sanity check before pointing it at a real database.

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

Config lives in `components.json` (style `radix-nova`, Lucide icons, CSS variables).

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

Vitest + Testing Library, jsdom environment. Tests live next to their subject as
`*.test.ts(x)` under `src/`. Setup is in `vitest.setup.ts`.

## MCP

`.mcp.json` registers the [chrome-devtools MCP server](https://github.com/ChromeDevTools/chrome-devtools-mcp),
giving coding agents a real Chrome for navigation, DOM inspection, console logs,
network traces, and performance traces. Approve the server when your MCP client
prompts on first run.
