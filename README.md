# ai-eng-training

Next.js 16 (App Router) + TypeScript + Tailwind v4 + shadcn/ui.

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

## Scripts

| Script           | What it does                                |
| ---------------- | ------------------------------------------- |
| `pnpm dev`       | Dev server                                  |
| `pnpm build`     | Production build                            |
| `pnpm start`     | Serve the production build                  |
| `pnpm typecheck` | `tsc --noEmit`                              |
| `pnpm lint`      | ESLint (`lint:fix` to autofix)              |
| `pnpm format`    | Prettier write (`format:check` to verify)   |
| `pnpm test`      | Vitest once (`test:watch`, `test:coverage`) |
| `pnpm check`     | typecheck + lint + format:check + test      |

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
