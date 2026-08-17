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
