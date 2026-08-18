@AGENTS.md

# The product

This repository is coursework for a 20-day AI Engineering training programme. The product built
across every exercise is **TalentScout**, an AI recruiting copilot: **jobs**, **candidates**,
**applications**, **interviews**, **notes**.

Assume that domain when a request does not name one. A feature ticket without a stated user is a
recruiter's; the corpus is hiring documents; the voice surface is a candidate phone screen.

Read the "The project" section of `README.md` for why this domain was chosen and which day of the
programme each capability belongs to. Work is tracked in Linear under **TalentScout — AI Eng
Training**, one parent issue per day, sub-issues sized as one PR each.

# Working agreement

How work gets done here. These rules apply before any of the code conventions below, and they
apply to every task — a change being small is not an exemption.

## Ask rather than assume

Ask about **every choice the request and this repository do not already settle** — including
reversible ones, and including forks discovered mid-task. Filling a gap with a sensible default
and mentioning it afterwards is still an assumption; it just moves the surprise later.

- Batch the questions visible upfront and ask them before starting. A round trip is cheaper than
  rework.
- When a new fork appears mid-task, finish everything that does not depend on the answer, then
  stop and ask. The pause should cost as little as possible.
- Establish facts before offering options. "`.env.local` does not exist, so this check fails" is
  worth more than "this might not work."
- Never invent a name, path, type, or API shape the request did not describe. Leave it `unknown`
  and say so.
- Verify claims against the repository rather than recalling them. Read the installed package,
  run the command, check the file.

## Record project decisions in the README

`README.md` is where a decision about **this project** lives. When a change settles something the
repository did not previously state, update the README **in the same PR as the change itself** —
never as a follow-up. A README that lags behind the code is worse than one that stays silent,
because it is believed.

- **Decisions, not routine work.** Implementing a feature the README already describes settles
  nothing. Adding Postgres, choosing Inngest over a cron job, renaming a core entity, dropping a
  planned capability, or changing who the product is for all do.
- **Record the reason, not the event.** "Postgres with pgvector — the document corpus and the
  memory store both need vector search" survives re-reading. "Added a database" does not.
- **Edit, do not append.** When a decision is reversed, rewrite the entry so the README describes
  the project as it is now. The history lives in git.
- If a change settles nothing, leave the README alone. Padding it costs the same trust as letting
  it go stale.

## Comment only what the code cannot say

- **JSDoc on exported symbols stays.** It surfaces on hover at the call site, which the
  implementation alone cannot do. Every export in `src/lib/`, `src/types/`, and `src/env.ts`
  carries one — match that.
- Every other comment must earn its place by explaining a **why** that is invisible in the code:
  a workaround, an external constraint, a decision that looks wrong until explained. `src/env.ts`
  explains why literal `process.env.NEXT_PUBLIC_*` access is required; `src/app/api/status/route.ts`
  explains why the route must never be cached. Both are necessary; neither restates its code.
- Delete comments that paraphrase the line below them, narrate the obvious, or label sections. A
  comment written because the code is unclear is a bug report against the code — fix the code.
- No commented-out code. Git remembers it.

## Branch from origin/main

```bash
git fetch origin
git checkout -b <branch> origin/main
```

Always `origin/main` — never the local `main`, which drifts, and never whichever branch happens
to be checked out. **The single exception is an explicitly named base:** when the request says
which branch to start from, use that one.

Fetch first. Branching off a stale `origin/main` produces a diff full of other people's changes.

# Project conventions

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript 5.9 strict · Tailwind CSS v4 ·
shadcn/ui · Vitest + Testing Library · zod 4 · pnpm.

## Layout and naming

| What                | Where                                              |
| ------------------- | -------------------------------------------------- |
| Routes and layouts  | `src/app/`                                         |
| API route handlers  | `src/app/api/<segment>/route.ts`                   |
| Our components      | `src/components/<kebab>/<kebab>.tsx`               |
| shadcn primitives   | `src/components/ui/<kebab>.tsx`                    |
| Framework-free code | `src/lib/`                                         |
| Hooks               | `src/hooks/use-<kebab>.ts`                         |
| App-wide types      | `src/types/index.ts`                               |
| Env access          | `src/env.ts` (the only file reading `process.env`) |

- **Files are kebab-case, exports are PascalCase** for components (`data-card/data-card.tsx`
  exports `DataCard`) and camelCase for functions (`format.ts` exports `formatCurrency`).
- **Each of our components gets its own directory** holding the component and its test.
  shadcn primitives stay flat in `src/components/ui/` — that directory is generated but owned
  by us, so editing it is fine.
- **Feature-local types live beside the feature.** Only genuinely app-wide types belong in
  `src/types/index.ts`.

## Imports

- `@/*` maps to `src/*`. Always import through the alias — a deep relative import
  (`../../lib/x`) that crosses a directory is a defect.
- **No barrel files.** Import the module directly (`@/components/ui/button`), never through a
  re-exporting `index.ts`. Barrels defeat tree-shaking and, worse, let a `"use client"` module
  drag unrelated server code across the RSC boundary. `src/types/index.ts` is a real module that
  happens to be named `index.ts`, not a barrel.
- Import order is enforced by `@ianvs/prettier-plugin-sort-imports`; run `pnpm format` rather
  than hand-sorting.

## Components

- **Server Components by default.** Add `"use client"` only when the module itself needs state,
  effects, refs, or browser APIs — and push the boundary down to the smallest leaf that needs it.
- Props are typed inline via `React.ComponentProps<"tag">` intersections, as in
  `src/components/ui/button.tsx`. Prefer extending the underlying element's props over inventing
  a parallel prop set.
- Compose classes with `cn()` from `@/lib/utils`. Never build a class string by concatenation —
  it breaks both Tailwind class merging and the Prettier class sorter.
- Use the shadcn CSS variables (`bg-background`, `text-muted-foreground`) instead of hardcoded
  colours or spacing.
- `params` and `searchParams` are async in Next 16 and must be awaited.

## API routes

- One directory per endpoint under `src/app/api/`, containing `route.ts`, `schema.ts`, and
  `route.test.ts`.
- **Validate every input with zod at the boundary.** A route handler is a public HTTP endpoint;
  parse the body and the search params rather than casting them.
- Zod schemas and the types inferred from them live in `schema.ts`; `route.ts` holds handler
  logic only.
- Return `Response.json()`. Status codes: `400` failed validation, `401` unauthenticated,
  `403` unauthorised, `404` missing, `409` conflict, `422` semantically invalid, `500` unexpected.
- Never return a stack trace, an internal identifier, or a raw exception message to the client.
  Log the detail server-side and return a generic message.
- Live data needs `export const dynamic = "force-dynamic"` **and** `Cache-Control: no-store`;
  without both, Next prerenders the route at build time and serves it stale.

## Tests

- Co-located as `*.test.ts` / `*.test.tsx` beside the subject, under `src/`.
- Vitest + Testing Library, jsdom environment. Query by accessible role or label
  (`getByRole`) — reach for `getByTestId` only when nothing accessible identifies the element.
- Assert behaviour, not implementation. A test that would still pass with the feature deleted is
  worse than no test.

## Environment variables

- `src/env.ts` is the only module that may read `process.env`. Everything else imports `env`
  from `@/env`.
- Server-only values go in `serverSchema`; anything the browser needs must be prefixed
  `NEXT_PUBLIC_` and referenced literally so Next can inline it at build time.
- Every key added to a schema must also be added to `.env.example`, which is the deploy-time
  contract `/pre-deploy` checks against.

## Verification

`pnpm check` — typecheck, lint, format check, and tests. Run it before handing work back;
never leave the tree red.
