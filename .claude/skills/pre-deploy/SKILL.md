---
name: pre-deploy
description: Run this repo's pre-deploy gate — TypeScript type-check, the Vitest suite, a console.log scan over src/, and an environment-variable check against .env.example — then report a pass/fail summary. Use before deploying, before opening a release PR, or when asked whether the project is ready to ship.
allowed-tools: Read, Glob, Grep, Bash
---

# Pre-deploy gate

Four independent checks. **Run all four even when an early one fails** — a single report
listing every problem is worth more than the first one you hit.

Do not fix anything unless the caller asks. This skill reports; it does not edit.

## The checks

Run each from the repository root and keep its exit code and output.

### 1. Type-check

```bash
pnpm typecheck
```

`tsc --noEmit`. On failure, quote the first few `error TS####` lines with their file and line —
not the whole compiler dump.

### 2. Test suite

```bash
pnpm test
```

`vitest run` over `src/**/*.{test,spec}.{ts,tsx}`. On failure, report the failing test names and
the assertion that broke. Zero collected tests is a **failure**, not a pass — it means the suite
did not run.

### 3. `console.log` scan

```bash
bash .claude/skills/pre-deploy/scripts/check-console.sh
```

Fails on `console.log` and `console.debug` anywhere in `src/`, excluding `*.test.ts(x)` and
`*.spec.ts(x)`. `console.error` and `console.warn` pass — they are the only failure channel a
Server Component or route handler has.

The script prints `file:line` for every hit. Report them all.

### 4. Environment variables

```bash
bash .claude/skills/pre-deploy/scripts/check-env.sh
```

Every key declared in `.env.example` must resolve to a non-empty value, looked up in the process
environment, then `.env.production.local`, `.env.local`, `.env` — Next.js precedence order. The
script parses those files rather than sourcing them, so a malformed env file cannot execute.

It also emits a `WARN` for any key `src/env.ts` validates that `.env.example` never declares.
A warning does not fail the gate, but it is real drift: whoever deploys will not know to set it.

**Expect this check to fail on a fresh clone.** `.env.local` is gitignored, so a machine that has
never run the app locally has nothing to satisfy `.env.example`. That is the check working, not a
bug — say so plainly in the report rather than waving it through.

## Report

Emit exactly this shape:

```
PRE-DEPLOY: FAIL

  PASS  typecheck      tsc --noEmit clean
  PASS  tests          31 passed, 0 failed
  FAIL  console.log    2 hits in shipped source
  FAIL  env            unset: NEXT_PUBLIC_APP_URL

console.log
  src/app/page.tsx:14
  src/lib/format.ts:8

env
  NEXT_PUBLIC_APP_URL declared in .env.example, not found in the environment or any .env file
```

Rules for the report:

- The verdict is `PASS` only when **all four** checks pass. Any failure makes it `FAIL`.
- Never soften a failure. "Tests mostly pass" is not a result.
- Never report a check you did not run. If a command could not execute — `pnpm` missing,
  dependencies not installed — that check is `ERROR`, the verdict is `FAIL`, and you say why.
- Detail sections only for failing checks. A passing gate is five lines and nothing else.

## What this deliberately does not run

`pnpm check` also runs `pnpm lint` and `pnpm format:check`. Those are code-quality gates, not
deploy gates, and they are already enforced in the normal verification loop. If the caller wants
the full sweep, tell them to run `pnpm check` — do not silently add it here.
