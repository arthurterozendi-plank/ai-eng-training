---
name: parallel-review
description: Review the current branch with four specialist subagents running in parallel — bugs, performance, security, and conventions — then merge their findings into one severity-ordered report, apply the unambiguous fixes, and verify with pnpm check. Use after finishing a change, before opening a PR, or when asked to review a diff, branch, or set of files.
allowed-tools: Read, Glob, Grep, Bash, Edit, Write, Agent
---

# Parallel review

Four reviewers, one report. Each specialist reads the same diff through one lens and returns
findings only — none of them edit. **You** merge, fix, and verify.

| Agent                | Lane                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `review-bug-hunter`  | Logic errors, edge cases, null risks, races, RSC breakage, cache staleness |
| `review-performance` | Waterfalls, N+1, re-renders, memoization, Suspense, bundle size            |
| `review-security`    | Injection, authn/authz, secrets, unvalidated input, data exposure          |
| `review-conventions` | `CLAUDE.md` rules, accessibility, test quality                             |

## Step 1 — Resolve the target once

The specialists must all review the **same** thing. Resolve it here and state it explicitly in
each prompt; do not let four agents each guess.

If the caller named files, paths, or a PR, that is the target.

Otherwise:

```bash
git rev-parse --abbrev-ref HEAD
git diff main...HEAD --stat      # committed on this branch
git diff HEAD --stat             # uncommitted working tree
git status --short
```

Stop and report, without launching anything, when:

- the branch is `main` — there is nothing to review against;
- both diffs are empty — say so rather than inventing a target.

Name the resolved target in one line before launching: which branch, which files, whether
uncommitted work is included.

## Step 2 — Launch all four in one message

Send four `Agent` calls **in a single message** so they run concurrently. Four calls in four
messages run in series and cost four times the wall clock.

Each prompt carries: the resolved target, the changed file list, and the instruction to report
only. For example:

> Review the diff of branch `pr/foo` against `main`, including uncommitted work. Changed files:
> `apps/web/src/app/api/orders/route.ts`, `apps/web/src/app/api/orders/schema.ts`,
> `apps/web/src/components/order-list/order-list.tsx`. Report findings only — do not edit any
> file and do not run `pnpm check`; the caller applies fixes.

Do not review the diff yourself while they run — that is the duplication this skill exists to
avoid. Wait for all four.

If an agent returns nothing usable, say which lane came back empty in the final report. A silent
missing lane reads as "clean".

## Step 3 — Merge

1. **Deduplicate.** Same file, same line, same underlying problem reported by two lanes: keep
   one entry, keep the highest severity, and list both lanes in its tag — `[security, bug]`.
   Different problems on one line stay separate.
2. **Resolve contradictions.** When two lanes propose opposite changes — memoize versus simplify,
   cache versus force-dynamic — do not pick silently. Both go in **Needs a decision** with the
   tradeoff stated.
3. **Order by severity**, then by file. `critical` → `high` → `medium` → `low`.
4. **Drop anything below medium confidence.** The specialists are told not to emit it; drop it
   here if it arrives anyway.
5. **Sanity-check the loud ones.** Before acting on any `critical` or `high`, open the file and
   confirm the finding against the real code. A confident wrong finding costs more than a missed
   one, and you are the last check before an edit.

## Step 4 — Fix

**Fix directly** when the correct change is unambiguous and local:

- A clear bug with one obvious correction
- Missing `alt`, missing label, `<div onClick>` → `<button>`
- `<img>` → `next/image`, concatenated classes → `cn()`
- Missing `dynamic = "force-dynamic"` or `Cache-Control: no-store` on a live-data route
- Adding zod validation at a boundary that has none
- Sequential independent `await`s → `Promise.all`
- Deep relative import → `@/*`
- A missing JSDoc on a new export in `apps/web/src/lib/`, `apps/web/src/types/`, a `src/env.ts`,
  or `packages/db`
- A missing test for changed behaviour

**Report instead of fixing** when it is a judgment call:

- Architectural restructuring, or moving the server/client boundary across components
- Anything altering public API shape, database schema, or observable behaviour
- Caching strategy where the right freshness depends on product intent
- Authorization model changes — flag loudly; the policy is a human decision
- Anything two lanes disagree about, or where two reasonable fixes exist

Never widen scope beyond the reviewed diff. Unrelated problems go in **Beyond this diff**
unfixed.

## Step 5 — Verify

Once, after all fixes:

```bash
pnpm check
git diff --stat
```

If it fails, fix your own fallout or revert your change. Never hand back a red tree.

## Output

```
critical  apps/web/src/app/api/orders/route.ts:24  [security]
  Handler returns any order by id with no ownership check.
  Fails when: an authenticated user posts another user's orderId and reads that order.
  Needs a decision: scope the lookup to the session user — confirm that is the intended policy.
```

Then close with:

- **Fixed** — what you changed, and the `pnpm check` result
- **Needs a decision** — each judgment call with your recommendation
- **Beyond this diff** — pre-existing issues left alone
- **Lanes** — one line: which of the four reported findings, which came back clean

If all four lanes are clean, say so in one line and stop. No praise, no summary of what the diff
does — the author already knows.
