# AI-40 — Document module-level conventions in folder CLAUDE.md files

**Linear:** AI-40 · Type: Chore · Parent: AI-9 · Milestone: Week 1 — Use AI: Workflow
**Branch:** `arthurterozendi/ai-40-document-module-level-conventions-in-folder-claudemd-files`
(worktree `ai-eng-training-ai-40-module-claudemd`, based on `origin/main` at `09d0742`)
**Status:** specced; hardened rounds 1–3 (CHANGES_REQUESTED each; all sixteen findings
dispositioned in §7.1–7.3). The r3 BLOCKER — that the subtree-load premise was inferred rather
than measured — was settled by direct probe and the premise **holds**; §2 now cites the
experiment. Awaiting implementation. No blocking escalations.

---

## 0. Escalations

**None — proceeding autonomously.**

Nothing in this ticket is a one-way door: it adds two markdown files. No data migration, no
external contract, no security or authz decision, no cost. Every judgement call is recorded in
§7 and is reversible with a text edit.

Two things that _look_ like escalations and are deliberately not:

- **The root `CLAUDE.md` is not edited.** The ticket puts "rewriting the root CLAUDE.md" out of
  scope, and after the audit in §2 no root edit is _needed_ — every rule the root states stays
  true and stays where it is. One imprecision in the root's wording is recorded in §7 (D-7) as a
  follow-up, not fixed here, because the _action_ the root prescribes is correct.
- **The two existing skills overlap this content.** `.claude/skills/api-route/SKILL.md` and
  `.claude/skills/component/SKILL.md` already encode much of it. That is a real duplication
  problem, but it is a separate refactor with its own blast radius. §6 records the drift and
  recommends the follow-up; AI-40 does not touch the skills.

---

## 1. Goal

**Outcome:** an agent that opens any file under `apps/web/src/app/api/` or
`apps/web/src/components/` gets the module's local rules — and the local _failure modes_ — in
context, without the prompt having to restate them.

**User story:** as an engineer on the training, I want API and component conventions written
where the code lives so that an agent scaffolding in either folder follows the local rules
without being reminded in the prompt.

### In scope

| File                                | Governs                                              |
| ----------------------------------- | ---------------------------------------------------- |
| `apps/web/src/app/api/CLAUDE.md`    | Route handlers, their schemas and their tests        |
| `apps/web/src/components/CLAUDE.md` | Our components and the `ui/` primitives beneath them |

Plus a README line recording the convention tier this establishes (§5, slice 4) — required by
the working agreement in `CLAUDE.md`, "Record project decisions in the README".

### Out of scope

- Rewriting or restructuring the root `CLAUDE.md`.
- `src/lib`, `src/hooks`, `src/types`, `src/app` (pages/layouts) — no folder file for any of them.
- Editing `.claude/skills/*` (see §6) or any production code. **This ticket changes no `.ts`
  or `.tsx` file.** The inconsistencies found in §4 are documented as decisions, not fixed.

### Non-goals

- Making the folder files complete. They are deliberately partial: the root holds the rules,
  these hold what the root leaves out.
- Any _factual claim_ that is not already true of code in this repository: sections A–C must
  trace to a file cited in §4. The "do not" sections are exempt by construction — see §4.

---

## 2. How these files actually load — verified by probe, not inferred

**This is the premise the whole ticket rests on, and it was measured rather than reasoned about.**
Zero files sit directly in either governed directory — all three endpoints and all four
components are one level deeper — so **100% of both files' trigger surface is subtree reads.**
If loading were exact-directory-only, both files would be inert forever and the right answer
would be `.claude/rules/` instead.

The documentation does not settle it. The relevant sentence is:

> Claude also discovers `CLAUDE.md` and `CLAUDE.local.md` files in subdirectories under your
> current working directory. Instead of loading them at launch, they are included when Claude
> reads files in those subdirectories.

On its face that is **ambiguous between "files in that exact directory" and "files anywhere in
that directory's subtree"** — which is why it was probed rather than quoted.

**The probe.** In the session's working directory, two throwaway untracked files:

```
.harness-probe/CLAUDE.md             <- a unique sentinel string
.harness-probe/deep/nested-probe.ts  <- one level DEEPER, not a direct child
```

Reading `.harness-probe/deep/nested-probe.ts` caused `.harness-probe/CLAUDE.md` to be injected
into context as a system-reminder, quoted in full. All probe artifacts were deleted afterwards.

**Result — subtree semantics confirmed.** A `CLAUDE.md` in an _ancestor_ directory loads on
demand when a file anywhere in its _subtree_ is read, not only for files sitting directly in that
exact directory. So `apps/web/src/app/api/CLAUDE.md` loads when an agent reads
`api/jobs/route.ts`. The premise holds and D-2's rejection of `.claude/rules/` stands.

**Caveat found the same way, and worth more than the confirmation.** A first attempt at this
probe run from a _sibling worktree_ showed nothing, which would have read as a refutation. The
docs say subdirectory files are discovered "under your current working directory", and a sibling
worktree is not under the session cwd. **The mechanism is scoped to the session's working
directory**: an agent working from a different checkout root does not get these files at all.

Four consequences the implementer must design around:

1. **They are lazy, not automatic.** A session started at the repo root loads only the root
   `CLAUDE.md`. `apps/web/src/app/api/CLAUDE.md` enters context the first time Claude reads any
   file in that subtree. Reliable for _editing_ existing code and for
   scaffolding-after-reading-a-neighbour (which both skills' Step 1 already forces); unreliable
   for a cold write into a brand-new directory with no prior read anywhere in the subtree.
2. **They do not survive `/compact`.** Per the docs: nested `CLAUDE.md` files and rules with
   `paths:` frontmatter "are not re-injected" after compaction — "they reload the next time
   Claude reads a file in that subdirectory". A long session can therefore lose them silently
   partway through.
3. **Confirming a load has supported mechanisms.** `/context` lists what actually loaded under
   **Memory files**, and the `InstructionsLoaded` hook exists specifically to log which
   instruction files loaded, when, and why. Both beat asking the agent to introspect its own
   context. Slice 5 uses them.
4. **Length is the tax.** The docs target "under 200 lines per CLAUDE.md file" and note that
   longer files reduce adherence. These files are paid for on every read in the subtree.
   **Budget: target 140 lines each, hard cap 180**, counted with prose wrapped at 100 columns.
   The cap is set against what the §4 outlines actually cost, not against a round number: §4.2 is
   six sections, two tables and a fenced skeleton, and it does not fit in 120. §5 names the
   mandatory floor, the cut order and which sections are cuttable, so "which DoD gives way" is
   decided here rather than in the editor. **Prose wraps at 100 columns by hand**, as the root
   `CLAUDE.md` does: `prettier.config.mjs` sets `printWidth: 100` but leaves `proseWrap` at its
   default of `preserve`, so Prettier will not reflow markdown. Without the hand convention a
   line count is satisfiable with 250-character lines and stops measuring anything.

The mechanism is confirmed but still weaker than "the agent always knows" — points 1 and 2 are
real gaps. The mitigation is not more words: it is that the files stay short enough to be read
carefully when they do load.

`.claude/rules/` with `paths:` frontmatter was considered as the alternative mechanism. It has
the same laziness (path-scoped rules trigger on reading a matching file), and the ticket names
the two file paths explicitly. Not pursued — see D-2.

---

## 3. Root CLAUDE.md rule inventory — the no-repetition baseline

AC-3 ("neither file repeats a rule already stated in the root CLAUDE.md") is the sharpest
constraint in this ticket and the easiest to violate by accident. This is the diff baseline.
**Every line the implementer writes must be checked against this table.**

Line numbers are `CLAUDE.md` at `09d0742`.

### 3.1 Root `## Components` (L144–155) — off-limits

| ID   | Rule the root already states                                                                                                     |
| ---- | -------------------------------------------------------------------------------------------------------------------------------- |
| R-C1 | Server Components by default; `"use client"` only for state, effects, refs, browser APIs; push the boundary to the smallest leaf |
| R-C2 | Props typed inline via `React.ComponentProps<"tag">` intersections, per `ui/button.tsx`; prefer extending the element's props    |
| R-C3 | Compose classes with `cn()` from `@/lib/utils`; never concatenate class strings                                                  |
| R-C4 | Use shadcn CSS variables (`bg-background`, `text-muted-foreground`) over hardcoded colours/spacing                               |
| R-C5 | `params` and `searchParams` are async in Next 16 and must be awaited                                                             |

### 3.2 Root `## API routes` (L157–170) — off-limits

| ID   | Rule the root already states                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------- |
| R-A1 | One directory per endpoint under `apps/web/src/app/api/`, containing `route.ts`, `schema.ts`, `route.test.ts`        |
| R-A2 | Validate every input with zod at the boundary; parse body and search params rather than casting                      |
| R-A3 | Zod schemas and their inferred types live in `schema.ts`; `route.ts` holds handler logic only                        |
| R-A4 | Return `Response.json()`; status codes 400 / 401 / 403 / 404 / 409 / 422 / 500 with their meanings                   |
| R-A5 | Never return a stack trace, internal identifier, or raw exception message; log server-side, return a generic message |
| R-A6 | Live data needs `export const dynamic = "force-dynamic"` **and** `Cache-Control: no-store`                           |

### 3.3 Also already in the root — equally off-limits

Reviewers reliably miss these because they live under other headings. They are still repetition.

| ID   | Root section      | Rule                                                                                                                              |
| ---- | ----------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| R-L1 | Layout and naming | Where routes, our components, `ui/` primitives, lib, hooks, types and env live                                                    |
| R-L2 | Layout and naming | Files kebab-case; component exports PascalCase, function exports camelCase                                                        |
| R-L3 | Layout and naming | Each of our components gets its own directory holding the component and its test; `ui/` primitives stay flat and are ours to edit |
| R-L4 | Layout and naming | Feature-local types live beside the feature                                                                                       |
| R-I1 | Imports           | `@/*` is the current workspace's `src/*`; directory-crossing relative imports are a defect                                        |
| R-I2 | Imports           | Cross-workspace imports go by package name, declared `workspace:*`                                                                |
| R-I3 | Imports           | No barrel files; `src/types/index.ts` is not a barrel                                                                             |
| R-I4 | Imports           | Import order is enforced by Prettier — run `pnpm format`, do not hand-sort                                                        |
| R-T1 | Tests             | Tests co-located as `*.test.ts(x)` beside the subject                                                                             |
| R-T2 | Tests             | `apps/web` runs jsdom with Testing Library                                                                                        |
| R-T3 | Tests             | Query by accessible role or label; `getByTestId` only as a last resort                                                            |
| R-T4 | Tests             | Assert behaviour, not implementation                                                                                              |
| R-M1 | Comments          | JSDoc on exports in `src/lib/`, `src/types/`, `src/env.ts`, `packages/db`                                                         |
| R-M2 | Comments          | Every other comment must explain an invisible _why_; no restating, no commented-out code                                          |
| R-V1 | Verification      | `pnpm check` from the root before handing work back                                                                               |

### 3.4 The resolution: what the folder files are allowed to be

Given §3.1–3.3, almost every _rule_ is taken. So the folder files must not be rule lists. They
are three things the root cannot hold:

1. **One canonical worked example** per folder — a skeleton, not a restated rule. A template
   produces the behaviour AC-1 and AC-2 ask for more reliably than a sentence does, and copying
   a shape is not repeating a sentence.
2. **The decisions the root leaves open** — the questions two existing files in the repo answer
   differently (§4.3, §4.4). The root is silent on these; someone has to settle them.
3. **The "do not" list** — real failure modes, each traceable to a comment or a test assertion
   already in the repo. AC-4 makes this mandatory, and it is where agents actually go wrong.

Where the root states a rule (`force-dynamic` + `no-store`, zod at the boundary), the folder
file **shows it in the skeleton and says nothing about it in prose.** That is the line.

---

## 4. Content outline

Every item below was verified by reading the file cited. Nothing here is recalled.

Two rules govern how the outlines below become files:

- **Traceability applies to sections A–C only.** Those are factual claims about this repository:
  if one cannot be traced to real code, cut it. **Sections D and F are exempt by construction** —
  a failure mode is about code that is _not_ in the repo, which is the whole point of listing it.
  A D/F entry must instead carry either a citation **or** a stated consequence.
- **Each item lives in exactly one section.** Anything phrased as a failure mode belongs in D/F
  and is deleted from B/C; B/C keep only what is not one. The duplicates found at harden r2 are
  already resolved in the outlines below — do not reintroduce them.

The codebase governed by these files, in full:

```
apps/web/src/app/api/status/route.ts + route.test.ts          (no schema.ts — no input)
apps/web/src/app/api/jobs/route.ts + schema.ts + route.test.ts
apps/web/src/app/api/candidates/[id]/route.ts + schema.ts + route.test.ts
apps/web/src/components/job-card/          (server)
apps/web/src/components/candidate-profile/ (server)
apps/web/src/components/settings-form/     (client)
apps/web/src/components/theme-toggle/      (client)
apps/web/src/components/ui/button.tsx      (shadcn primitive)
```

### 4.1 `apps/web/src/app/api/CLAUDE.md`

**Section A — the skeleton.** One `GET` with a search-param schema, **structurally** adapted from
`jobs/route.ts` — search params, `Request`/`Response`, one `NO_STORE` constant applied to every
branch. That last part is deliberate: `jobs` is the **D-4 winner**. But `jobs` is the **D-3
loser**, so the skeleton must **not** reproduce its hand-mapped `issues`; its `400` branch carries
the D-3 shape instead — the exported `ErrorResponse` type populated with `z.treeifyError`. §3.4
calls the skeleton the highest-signal artifact in the file, so a skeleton that contradicts a
decision teaches the rejected shape louder than Section B corrects it. It must embody R-A2, R-A4,
R-A6 without narrating them. The skeleton has a `schema.ts` half as well as a `route.ts` half,
and the `schema.ts` half must **define** the contract it uses, not just import it:
`export type ErrorResponse = { error: string; issues?: unknown }`. `candidates/[id]/schema.ts:42-46`
declares it per route rather than sharing it, so a new endpoint re-declares it — without the
definition in front of them an agent gets an imported type with no shape and invents one, which
is exactly the contract D-3 exists to settle. Show:

- `Request` / `Response`, never `NextRequest` / `NextResponse` — all three routes do this, and
  it is what lets `route.test.ts` build a plain `new Request(...)`.
- `safeParse` and an early `400` **before any I/O**. Both route tests assert the database was
  never touched on a `400` (`expect(findManyJobs).not.toHaveBeenCalled()`).
- `try` / `catch` around the read, `console.error` with a `<METHOD> /api/<path>` prefix, generic
  body out.

**Section B — the local facts.** Net-new against §3; each is one line.

| Fact                                                                                                                                                                                                                          | Evidence                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Dynamic segments type their context with the Next 16 global `RouteContext<"/api/candidates/[id]">`                                                                                                                            | `candidates/[id]/route.ts:12`; Next docs `15-route-handlers.md:189` |
| zod 4 top-level formats: `z.uuid()`, `z.email()`, `z.url()` — not `z.string().uuid()`                                                                                                                                         | `candidates/[id]/schema.ts:5`; zod `^4.4.3`                         |
| Search params arrive as strings — numeric fields need `z.coerce`; parse `Object.fromEntries(new URL(request.url).searchParams)`                                                                                               | `jobs/schema.ts:14`, `jobs/route.ts:84-86`                          |
| A list endpoint caps its result set with an exported `MAX_*` constant. Never unbounded                                                                                                                                        | `jobs/schema.ts:4,14` and its JSDoc                                 |
| Project columns at the query and map the response field by field                                                                                                                                                              | `candidates/[id]/route.ts:31,53-83`                                 |
| `Date` becomes an ISO string at the wire boundary via `.toISOString()`                                                                                                                                                        | `candidates/[id]/route.ts:65-66`                                    |
| An endpoint that takes no input has no `schema.ts` — the documented exception to R-A1                                                                                                                                         | `status/` has only `route.ts` + `route.test.ts`                     |
| **A fact, not a convention:** no auth scheme exists and no ticket owns one, so routes ship unauthenticated with `// TODO: authorization` after validation. Do not invent a scheme, and do not read this as settled — see D-13 | `candidates/[id]/route.ts:26`                                       |
| `console.error` / `console.warn` are allowed; `console.log` / `console.debug` fail `/pre-deploy`                                                                                                                              | `.claude/skills/pre-deploy/scripts/check-console.sh`                |
| Errors use the exported `ErrorResponse` + `z.treeifyError`. **`jobs/route.ts` hand-maps `issues` instead — a known deviation, not the shape to copy**                                                                         | D-3; `candidates/[id]/schema.ts:42-46` vs `jobs/route.ts:92-95`     |
| `Cache-Control: no-store` goes on **every** response, 400/404/500 included. **`candidates/[id]/route.ts` sets it on the 200 only — a known deviation**                                                                        | D-4; `jobs/route.ts:15` vs `candidates/[id]/route.ts:85`            |

**Section C — testing a handler.** Net-new; R-T1..R-T4 say nothing about route handlers.

- Import `GET` through `@/` and call it directly. No HTTP server, no `next start`.
- `vi.mock("@talentscout/db/client")` built inside `vi.hoisted(...)`. This is **required, not
  stylistic**, for two stacked reasons the repo already documents: `db` throws
  `EnvValidationError` at module load when `DATABASE_URL` is unset under Vitest
  (`candidates/[id]/route.test.ts:8-11`), and `vi.mock`'s factory is hoisted above every `const`
  in the file (`jobs/route.test.ts:6-7`).
- A dynamic segment is called as `GET(request, { params: Promise.resolve({ id }) })`
  (`candidates/[id]/route.test.ts:73-75`).
- Silence an expected log with `vi.spyOn(console, "error").mockImplementation(...)` and assert it
  was called (`jobs/route.test.ts:157-168`).
- **Give the no-leak assertions teeth:** the fixture deliberately carries fields the projection
  drops (`resumeText`, `changedBy`) so the test fails if someone later spreads the row
  (`candidates/[id]/route.test.ts:22-23,164-176`).

**Section D — do not.** Mandatory (AC-4). Each entry is a failure mode with a consequence:

- Do not spread a database row into a response. `resumeText` is the RAG-sized body and
  `changedBy` is internal; both exist on rows the routes return.
- Do not put the error string from a caught exception into the response body — a connection
  error carries the connection string. `jobs/route.test.ts:159-165` asserts exactly this.
- Do not cast a search param instead of parsing it — they arrive as strings, so a bare cast makes
  `limit=abc` a `NaN` that reaches the query (`jobs/route.ts:84-86`, `jobs/route.test.ts:147-155`).
  Nothing is said here about request bodies: every handler in this repo is a `GET` and none calls
  `request.json()`, so a body rule would fail the traceability bar above. `/api-route` already
  covers the malformed-JSON branch for the first route that needs one.
- Do not reach for `NextRequest`/`NextResponse`, `res.status().json()`, or a Pages-router shape.
- Do not scaffold an auth check that the request did not describe, and do not silently ship an
  open endpoint — leave the TODO, say so in your report, and never call the result secured.
- Do not `fetch()` this app's own API route from a Server Component.
- Do not add `export const revalidate` / `fetchCache` / `dynamicParams` to a handler as "cache
  safety". They are unrelated to the two things R-A6 asks for.

### 4.2 `apps/web/src/components/CLAUDE.md`

**Section A — the skeleton.** A Server Component that embodies R-C2, R-C3, R-C4 silently, and
shows the one contract the root does not state: destructure `className`, merge it _last_ through
`cn(base, className)`, spread `...props` onto the root element. Every component in the repo does
this (`job-card.tsx:13-25`, `candidate-profile.tsx:63-68`, `ui/button.tsx:56-63`).

**Section B — the local facts.**

| Fact                                                                                                                                                               | Evidence                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------- |
| Private sub-components live unexported in the same file — they do not get their own directory                                                                      | `candidate-profile.tsx` holds `ApplicationSection`, `DetailRow`, `DetailLink`     |
| Our components use `data-*` for state a test asserts                                                                                                               | `job-card.tsx:44` `data-terminal`, asserted `job-card.test.tsx`                   |
| Props take rich types (`Date`, `PipelineStageKey`); the page converts, the component does not                                                                      | `candidate-profile.tsx:36` takes `Date`; `candidates/[id]/page.tsx:60` passes one |
| An absent optional field renders nothing — return `null`, do not render an empty row                                                                               | `candidate-profile.tsx:149-160`                                                   |
| An empty collection gets explicit copy, not a blank region                                                                                                         | `candidate-profile.tsx:88` "No applications yet."                                 |
| Bottom named export: `function X() {} … export { X }`. **`job-card.tsx` and `settings-form.tsx` use `export function` — a known deviation, not the shape to copy** | D-5; `ui/button.tsx:67`, `candidate-profile.tsx:184`                              |

**Section C — hydration and determinism.** The highest-value net-new content in either file:
three separate comments in the repo exist because someone was bitten. Four rules, each stated
positively with its reason — the mutation failure mode that used to sit here now lives in F only.

- Build `Intl.*Format` once at module scope, never per render — construction is not free
  (`candidate-profile.tsx:11-17`).
- `timeZone: "UTC"` is **required** on any formatter whose output is asserted. Without it the
  rendered day shifts with the machine's timezone: passes locally, fails in CI
  (`settings-form.tsx:43-49`).
- Never call `Date.now()` or `new Date()` during render. Server and client compute different
  values — a hydration mismatch and a flaky test (`settings-form.tsx:33-37`).
- Withhold browser-only state until mounted. `ThemeToggle` renders
  `aria-pressed={mounted ? isDark : undefined}` because the server cannot know the stored
  preference (`theme-toggle.tsx:38-40`, `hooks/use-mounted.ts`).

**Section D — the client boundary, concretely.** R-C1 states the rule; this states which of our
four components crossed it and why, which is what makes the rule usable:

| Component           | Boundary | Why                                                            |
| ------------------- | -------- | -------------------------------------------------------------- |
| `job-card`          | server   | renders props                                                  |
| `candidate-profile` | server   | renders props, sorts locally                                   |
| `theme-toggle`      | client   | `useState` + `useLayoutEffect` + `localStorage` + `matchMedia` |
| `settings-form`     | client   | `usePreferences` reads and writes `localStorage`               |

And the push-down that proves the rule: `settings/page.tsx` is a Server Component whose only
client content is `<SettingsForm />`.

**Section E — accessibility the tests actually assert.** Net-new; R-T3 covers the query side
only.

- A decorative glyph is `aria-hidden="true"` with an `sr-only` text equivalent beside it
  (`candidate-profile.tsx:131-132`, `theme-toggle.tsx:44-46`).
- Tabular data is a real `<table>` with `scope="row"` and an `sr-only` `<caption>` — `JobCard`'s
  own JSDoc explains why a `<ul>` of "Applied 3" strings does not bind the count to its stage for
  a screen reader (`job-card.tsx:6-12,38-39,47-48`).
- A labelled region uses `aria-labelledby` pointing at its heading (`candidate-profile.tsx:55,65`).

**Section F — do not.** Mandatory (AC-4):

- Do not add `"use client"` to a component that only renders props. Check the module itself, not
  its children — a Server Component may render a Client Component.
- Do not put `"use client"` on a page or layout to make a leaf interactive. Move the leaf out.
- Do not sort, `push`, `splice`, or otherwise mutate an array that arrived as a prop — copy
  first, and tie-break the sort so equal keys render deterministically instead of depending on
  input order (`candidate-profile.tsx:57-58,105-110`).
- Do not add `data-slot` or `cva` to one of our components; they belong to `ui/`.
- Do not make a clickable `<div>`. If it is clickable it is a `<button>`.
- Do not reach for `getByTestId` in a new test when a role or label exists.

### 4.3 Inconsistencies the two folder files must settle

The repo answers these three questions two different ways. The root is silent on all three, so
documenting them is net-new by definition — but it means picking a winner. Decided in §7
(D-3, D-4, D-5). **The losing files are not edited in this ticket** — so each deviation must be
named **inside the shipped folder file**, on the same line as the rule it breaks, not only here.
Copy-the-neighbour is the dominant agent behaviour and both skills' Step 1 mandates reading a
sibling; a rule whose nearest example contradicts it, silently, loses to the example. Naming the
dissenting file inline costs one clause and turns a contradiction into a known exception.

| Question                             | `jobs`                                          | `candidates/[id]`                                                          | Decision         |
| ------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------- | ---------------- |
| Error body shape                     | `{ error, issues: [{param,message}] }`          | `{ error, issues }` via `z.treeifyError`, typed `ErrorResponse`            | D-3 → candidates |
| `Cache-Control: no-store` on non-2xx | on every response                               | on the `200` only                                                          | D-4 → jobs       |
| Component export style               | `export function JobCard` (also `SettingsForm`) | `export { CandidateProfile }` at the bottom (also `ThemeToggle`, `Button`) | D-5 → bottom     |

---

## 5. Plan (slices)

Five slices. Each is one coherent, separately reviewable unit.

**Mandatory floor, and the cut order when the budget bites (§2, D-10).** Never cut: the skeleton,
the "do not" section, and the inline deviation clauses required by §4.3. Cut in this order until
the file fits — table rows first, lowest-value row first; then the worked example's inline
comments; then whole optional sections. **Cuttable sections:** §4.1 C (testing recipe) may lose
rows but not its `vi.hoisted` rationale; §4.2 B and E may lose rows; §4.2 D (the boundary table)
may collapse to one sentence naming the two client components and why. **Not cuttable:** §4.1 A
and D, §4.2 A, C and F.

### Slice 1 — `apps/web/src/app/api/CLAUDE.md`

Write the file to the §4.1 outline.

**DoD**

- [ ] File exists at `apps/web/src/app/api/CLAUDE.md`, ≤180 lines (target 140), prose wrapped at
      100 columns — Prettier will not do the wrapping (§2).
- [ ] Contains sections A–D of §4.1; section D ("do not") is present and non-empty.
- [ ] The skeleton's `400` branch carries the D-3 shape (`ErrorResponse` + `z.treeifyError`), not
      `jobs`' hand-mapped `issues`, and every response in the skeleton carries `no-store` (D-4).
- [ ] The skeleton's `schema.ts` half **defines** `ErrorResponse = { error: string; issues?: unknown }`
      rather than importing it from nowhere — the type is declared per route in this repo.
- [ ] Sections A–C: every factual claim traces to a file cited in §4.1. Section D is exempt; each
      of its entries carries a citation or a stated consequence (§4).
- [ ] No item appears in two sections; anything phrased as a failure mode is in D only (§4).
- [ ] Zero lines restate R-A1..R-A6 or R-L*/R-I*/R-T*/R-M*/R-V1 in prose (§3). The skeleton may
      _demonstrate_ them.
- [ ] `RouteContext<"...">`, `z.uuid()`/`z.coerce`, and the `vi.hoisted` mock rationale all appear.
- [ ] The D-3 and D-4 deviations are named inline, each naming the file that disagrees (§4.3).
- [ ] The auth line reads as a fact plus a pointer to D-13, not as a durable convention (D-13).
- [ ] `pnpm format` then `pnpm format:check` clean — the repo command, so plugin and config
      resolution match CI. Not a bare `prettier` invocation.

### Slice 2 — `apps/web/src/components/CLAUDE.md`

Write the file to the §4.2 outline.

**DoD**

- [ ] File exists at `apps/web/src/components/CLAUDE.md`, ≤180 lines (target 140), prose wrapped
      at 100 columns (§2). If it does not fit, apply the cut order above rather than dropping a
      mandatory section.
- [ ] Contains sections A–F of §4.2; section F ("do not") is present and non-empty.
- [ ] The hydration/determinism section (C) carries all four rules, each with its reason.
- [ ] The server/client split (D) names the four real components and matches the code, in a table
      or in the one-sentence collapsed form.
- [ ] Zero lines restate R-C1..R-C5 or R-L*/R-I*/R-T*/R-M*/R-V1 in prose (§3).
- [ ] Sections A–C and E: every factual claim traces to a file cited in §4.2. Section F is exempt;
      each of its entries carries a citation or a stated consequence (§4).
- [ ] No item appears in two sections; anything phrased as a failure mode is in F only (§4).
- [ ] The D-5 deviation is named inline, naming the two files that disagree (§4.3).
- [ ] `pnpm format` then `pnpm format:check` clean.

### Slice 3 — Non-repetition audit

The audit is the artifact that discharges AC-3. Doing it as its own pass is the point: the author
of a file is the worst reader of it.

**DoD**

- [ ] Every line of both new files checked against the §3 table.
- [ ] Any line that restates a root rule is deleted, not reworded.
- [ ] The PR body lists **only the rule IDs that were hit and deleted**, one line each. Silence on
      the rest carries the same information; enumerating all ~20 is padding.
- [ ] When nothing was hit, the PR body still says so — `audit run against §3; rules hit: none`.
      An empty list is indistinguishable from a skipped slice, and this slice is all of AC-3.

### Slice 4 — README record

**DoD**

- [ ] `README.md` records the convention tier in the Layout section: root `CLAUDE.md` holds
      repo-wide rules, folder `CLAUDE.md` files hold module-local detail and load when Claude
      reads any file in that **subtree** — the word `subtree` is required, since zero files sit
      directly in either governed directory and "in that directory" is the ambiguity §2 spent a
      round settling. Two or three lines, edited in place, not appended.
- [ ] The two new files appear in the README Layout tree.

### Slice 5 — Acceptance evidence + `pnpm check`

AC-1 and AC-2 are behavioural: they cannot be discharged by reading the diff. The probe below is
designed to test **the file**, not the loader — §2 says a cold write into a brand-new
subdirectory probably never loads the folder file, so a probe built that way would measure
Claude Code's memory mechanism and tell us nothing about what slices 1–2 wrote.

**Arrival.** Fresh session at the repo root, no convention text in the prompt. The first action is
the one both skills' Step 1 already mandates and any competent agent takes anyway: read one
existing sibling — `apps/web/src/app/api/jobs/route.ts` for AC-1,
`apps/web/src/components/job-card/job-card.tsx` for AC-2. That read is what pulls the folder file
into context (§2). This is the realistic arrival path, not a rigged one.

**The observable** — how the implementer knows the file loaded, best first:

1. `/context` lists what actually loaded, under **Memory files**. This is the supported check.
2. The `InstructionsLoaded` hook exists specifically to log which instruction files loaded, when,
   and why — use it if the run is scripted rather than interactive.
3. The session transcript shows the folder `CLAUDE.md` injected as a system-reminder after the
   sibling read (this is exactly what the §2 probe observed).

Do **not** discharge this by asking the agent to introspect and list its own context: that is
self-report about a mechanism, not observation of it.

**Pass bar.** The bar must be something **only the folder file supplies.** The root `CLAUDE.md`
loads unconditionally in every run, so a bar drawn from it would pass whether or not slices 1–2
exist and would measure the wrong artifact. Every item below was checked to appear **zero times**
in the root `CLAUDE.md`, and each traces to real code:

- **AC-1** — the generated endpoint types its handler params as plain `Request` (and
  `RouteContext<"...">` for a dynamic segment) rather than `NextRequest`; applies `z.coerce` to a
  numeric search param (`jobs/schema.ts:14`); bounds the result set with an exported `MAX_*`
  constant (`jobs/schema.ts:4`); and its `400` carries the D-3 shape — `ErrorResponse` populated
  with `z.treeifyError` (`candidates/[id]/schema.ts:42-46`). **The AC-1 prompt must ask for a
  _list_ endpoint taking a bounded numeric search param** (`limit`-shaped). Three of the four bar
  items exist only in that shape: a `GET /api/<x>/[id]` probe has no search param to coerce and no
  result set to bound, so two-thirds of the bar evaporates silently and the run closes on
  `Request`-vs-`NextRequest` alone — the same defect already fixed for AC-2 with its date
  requirement.
- **AC-2** — the generated component accepts `className`, merges it as the **last** argument to
  `cn()` and spreads `...props` onto the root element (`job-card.tsx:13-25`); and, **if it renders
  a date**, builds an `Intl` formatter at module scope with `timeZone: "UTC"`
  (`candidate-profile.tsx:11-17`). The AC-2 prompt must therefore ask for a component that
  displays a date, or that half of the bar is unfalsifiable.

**Confounder to record, not just avoid.** §6's own table says a skill activates when "judged
relevant to a prompt", and "scaffold an endpoint" is exactly that — `/api-route` and `/component`
already encode much of this content. **Every run records whether a skill activated.** A pass with
a skill active is evidence about the skill, not the folder file, and does not close the slice.

**Outcomes, and the one remediation round.**

| Outcome                                        | Meaning                                 | Action                                                                                                                                                                                                                                                                   |
| ---------------------------------------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Loaded, no skill active, meets the bar         | done                                    | Record the prompt, observable and verdict; slice closes                                                                                                                                                                                                                  |
| Loaded, meets the bar, **skill active**        | confounded                              | Re-run with the skill suppressed. A skill-assisted pass does not close the slice                                                                                                                                                                                         |
| Loaded + misses the bar                        | the file is defective                   | Revise slice 1 or 2 and re-run — **once**. Still missing → stop, record the gap verbatim, hand to the human                                                                                                                                                              |
| **Not loaded — probe misfire**                 | the run was wrong, the file is untested | Check the §2 caveats first: session cwd must be this checkout (a sibling worktree loads nothing), and the sibling read must have happened. Fix and re-run. **Do not edit the file**                                                                                      |
| **Not loaded — correct run, nothing injected** | **the §2 premise is falsified**         | **Escalate — do not ship.** Subtree loading is confirmed by the §2 probe, so this contradicts a measured result and means something in the model changed. Reopen D-2 (`.claude/rules/` with `paths:`) or re-place the files. This branch must never be silently absorbed |

One remediation round is the cap. AC-1/AC-2 are probabilistic (§8); tuning prose against a
sampled check past one round fits noise and inflates the file against D-10.

**DoD**

- [ ] AC-1 probe run per the arrival path above; prompt, observable, **whether a skill activated**,
      and verdict pasted in the PR body.
- [ ] AC-2 probe run the same way, with the same four fields, and with a prompt that asks for a
      component rendering a date (otherwise half the AC-2 bar cannot be tested).
- [ ] Every recorded run states which of the five outcomes it hit. A verdict without the
      observable is not evidence and does not close the slice.
- [ ] If any run lands on "**Not loaded — correct run, nothing injected**", the slice does not
      close: escalate, because that contradicts the §2 probe.
- [ ] At most one remediation round per AC; if a second would be needed, the gap is reported, not
      papered over.
- [ ] **Probe output is discarded.** Delete the generated endpoint and component directories by
      path after recording the verdict. §1 forbids `.ts`/`.tsx` changes in this PR. A throwaway
      worktree also works, but only if the probe **session is started inside it** — probing a
      sibling worktree from this branch's session puts the files outside the session cwd and
      yields a false "not loaded", the exact trap the §2 probe hit on its first attempt.
- [ ] `git status --short` shows only the intended `.md` files before the PR is opened.
- [ ] `pnpm check` green from the repo root. No `.ts`/`.tsx` changed, so this is a Prettier and
      no-regression gate.

## 6. The skills overlap — known drift, not fixed here

`.claude/skills/api-route/SKILL.md` (277 lines) and `.claude/skills/component/SKILL.md` (143
lines) already contain much of §4. They are a _third_ copy of these conventions, after the root
and the new folder files, and three copies drift.

They are not the same mechanism, which is why both can exist:

| Mechanism          | Activates when                                          | Holds       |
| ------------------ | ------------------------------------------------------- | ----------- |
| Skill              | invoked (`/api-route`) or judged relevant to a prompt   | a procedure |
| Folder `CLAUDE.md` | Claude reads any file in that directory, for any reason | the rules   |

The end state is that the folder files own the rules and the skills keep only the procedure —
usage, flags, path derivation, collision check, verification, report format — and defer for the
rest. **That refactor is not AI-40.** Recording the drift found while researching this spec:

- `api-route/SKILL.md:186-188` hand-writes `context: { params: Promise<{ id: string }> }` where
  the code and the Next 16 docs use the global `RouteContext<"...">`. Structurally compatible, so
  it typechecks — style drift, not a bug.
- `api-route/SKILL.md:109-110` repeats the root's imprecise caching rationale (see D-7).
- `component/SKILL.md:85` mandates a bottom named export; `job-card.tsx` and `settings-form.tsx`
  use `export function`. D-5 sides with the skill; the two files stay as they are.
- `component/SKILL.md:66` puts `data-slot` on a non-`ui/` component; no real component of ours
  does that.

**Recommended follow-up ticket:** trim both skills to procedure-only and point their "Step 1 —
Read the conventions" at the folder `CLAUDE.md`. Cheap, and it removes the third copy.

---

## 7. Assumptions and decisions log

Challenge any of these in review.

- 🟡 **D-1 — Paths resolve to `apps/web/`.** The ticket writes `src/app/api/CLAUDE.md` and
  `src/components/CLAUDE.md`; `apps/web` is the only Next application in the monorepo and the
  only workspace with either directory, so they are `apps/web/src/app/api/CLAUDE.md` and
  `apps/web/src/components/CLAUDE.md`. No ambiguity, recorded only so the paths are unarguable.

- 🟡 **D-2 — Folder `CLAUDE.md`, not `.claude/rules/` with `paths:` frontmatter.** The ticket
  names the mechanism, and the alternative is lazy in exactly the same way (§2), so it buys
  nothing. Rejected also because a rules file lives far from the code it governs, which is the
  one thing this ticket is trying to fix.

- 🟡 **D-3 — The error body is `candidates/[id]`'s shape:** an exported
  `ErrorResponse = { error: string; issues?: unknown }` in `schema.ts`, populated with
  `z.treeifyError(parsed.error)`. Rejected `jobs`' hand-mapped `[{param, message}]` because it is
  bespoke, and because `api-route/SKILL.md` already teaches `treeifyError` — siding with `jobs`
  would create a third variant rather than settle two. `jobs/route.ts` is left alone; it is
  working code and this is a docs chore.

- 🟡 **D-4 — `Cache-Control: no-store` goes on every response, including 400/404/500.** `jobs`
  does this via one `NO_STORE` constant; `candidates/[id]` sets it on the `200` only. Chose
  `jobs` because a cached `404` or `500` outlives the condition that caused it, and because one
  constant applied uniformly is easier to get right than remembering which branch needs it.
  Alternative rejected: "success responses only" is marginally less output for a real correctness
  hole. `candidates/[id]/route.ts` is left alone; a follow-up may align it.

- 🟡 **D-5 — Components use a bottom named export (`function X() {} … export { X }`).** Three of
  five real components and `ui/button.tsx` — the file the root itself names as the exemplar —
  already do this, and `component/SKILL.md` mandates it. `job-card.tsx` and `settings-form.tsx`
  deviate and are not changed here. Rejected picking `export function` on the grounds that it is
  the more common style generally: in this repo it is the minority, and consistency with the
  cited exemplar wins.

- 🟡 **D-6 — The folder files are worked example + open decisions + failure modes, not rule
  lists.** This is the central design call and the whole answer to the ticket's tension (§3.4).
  Where the root already states a rule, the folder file demonstrates it in the skeleton and says
  nothing in prose. Alternative rejected: a "quick reference" that summarises the root for
  convenience — that is precisely what AC-3 forbids, and it is how the root got long enough to
  stop being read carefully in the first place.

- 🟡 **D-7 — The root's caching rationale is imprecise; not corrected here.** The root says
  "without both, Next prerenders the route at build time and serves it stale." For **route
  handlers** that is no longer the mechanism: `node_modules/next/dist/docs/.../route.md` version
  history records "v15.0.0-RC — The default caching for `GET` handlers was changed from static to
  dynamic", and `15-route-handlers.md` states "Route Handlers are not cached by default." The
  _action_ the root prescribes is still right — `no-store` governs browser and CDN caching
  regardless, and `force-dynamic` is an explicit intent marker — so no agent is led into wrong
  behaviour. Correcting the root is out of scope and touches the file every agent loads, so it
  gets a follow-up rather than a silent edit. The folder file must not contradict the root: it
  demonstrates the rule in the skeleton and stays silent on the mechanism.

- 🟡 **D-8 — `dynamic` is still valid here because Cache Components is off.** Next 16 removes
  `dynamic`, `dynamicParams`, `revalidate` and `fetchCache` when `cacheComponents` is enabled.
  `apps/web/next.config.ts` is empty, so it is not enabled and R-A6 holds. Recorded because it
  makes R-A6 conditional on a config the folder file does not control; if `cacheComponents` is
  ever turned on, both the root and the folder file need revisiting.

- 🟡 **D-9 — A README edit is in scope.** The ticket does not mention it, but the working
  agreement in `CLAUDE.md` requires a README record in the same PR when a change settles
  something the repo did not state, and "module rules live in folder `CLAUDE.md` files" is
  exactly that. Kept to two or three lines in Layout (slice 4) — a record, not an essay.

- 🟡 **D-10 — 140-line target, 180-line cap per file, plus a stated cut order.** The Claude Code
  docs target under 200 lines and note longer files reduce adherence; these load on every read in
  the directory. **Revised at harden r1:** the original 120/160 collided with slices 1–2's own
  "contains all sections" checkboxes — §4.2 is six sections, two tables and a fenced skeleton and
  does not fit in 120, so the implementer would have faced two DoD boxes that cannot both pass.
  Raising the cap alone would have been a fudge, so §5 also names the mandatory floor and the cut
  order and marks which sections are cuttable. A third file was considered and rejected: splitting
  `src/components` into two memory files doubles the load cost for one directory and is exactly
  the fragmentation the ticket is arguing against.

- 🟢 **D-11 — Both files are written by hand, not generated from this spec.** Decided silently;
  reversible; no tooling exists for it and building some would cost more than the two files.

- 🟢 **D-12 — No folder file for `src/lib`, `src/hooks`, `src/types`, or `src/app`.** The ticket
  puts them out of scope and there is no evidence of agents getting them wrong.

- 🟡 **D-13 — "Ship unauthenticated, annotate with `// TODO: authorization`" is recorded as the
  repo's current state, not sanctioned as a convention.** Raised by harden r1. It is factually
  where the repo is (`candidates/[id]/route.ts:26`), and the `candidates` table holds names,
  emails, phones and full resume text — which is exactly why the database runs RLS deny-by-default
  with zero policies. Restating it as a rule in a docs chore would quietly make "open endpoint"
  the sanctioned default for every future route, and a docs chore is the wrong place to settle an
  authz posture. **Searched for the owning ticket and found none:** AI-26 is Postgres
  provisioning, AI-83 is pgvector, and `docs/specs/ai-34-domain-model.md:29` lists "authentication
  and multi-tenancy" as out of scope while naming an owner for pgvector and no one for auth. The
  20-day plan in `README.md` has no auth day. So the folder file says **no ticket owns this yet**
  rather than inventing an issue number. Not escalated: this ticket does not change the posture,
  it only describes it — but the description is worded so that the next person to touch auth is
  not told the question is closed.

### 7.1 Harden round 1 — disposition of every finding

The critic verified the citation trail and raised eight findings. All are design-level; none
disputed a fact. Dispositions, including what was declined:

| Finding                                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[BLOCKER]** Slice 4 probe contradicts §2, no failure branch              | **Accepted in full.** Slice 5 rewritten: realistic arrival (read a sibling first, per both skills' Step 1), so the probe tests the file rather than the loader; three named outcomes with distinct actions; one remediation round, capped. No tooling added                                                                                                                                                                                        |
| **[SHOULD]** No observable for "the file entered context"                  | **Accepted.** Slice 5 names it: transcript shows the folder file loading after the sibling read (`/context` lists it under Memory files); fallback is asking the agent to enumerate the `CLAUDE.md` files in its context                                                                                                                                                                                                                           |
| **[SHOULD]** Line cap collides with mandatory sections                     | **Accepted, both remedies.** Cap raised to 180 (target 140) _and_ §5 marks the cuttable sections plus a cut order with a never-cut floor. See D-10. Declined the implicit third option of a second components file                                                                                                                                                                                                                                 |
| **[SHOULD]** D-3/D-4/D-5 contradict neighbour code silently                | **Accepted — cheapest fix.** §4.3 now requires the dissenting file to be named inline in the shipped folder file, and slices 1–2 carry a DoD box for it. **Declined the alternative** of dropping the loser rules and documenting only the agreed subset: that leaves the three questions unsettled, and settling open decisions is one of the three things §3.4 says these files exist to do. A code-fix slice was not added — out of scope by §1 |
| **[SHOULD]** Auth posture set in a docs chore, absent from §7              | **Accepted.** Logged as D-13; §4.1 reworded to fact-plus-pointer. Searched for the owning ticket and found none, so the file will say "no ticket owns this yet" rather than name an invented issue                                                                                                                                                                                                                                                 |
| **[SHOULD]** Probe emits `.ts`/`.tsx` that §1 forbids                      | **Accepted.** Slice 5 requires the output be discarded (throwaway worktree or deletion by path) and `git status --short` to show only `.md` before the PR opens                                                                                                                                                                                                                                                                                    |
| **[NIT]** Slice 3 bundles two deliverables; per-ID enumeration is ceremony | **Accepted.** Split into slice 3 (audit) and slice 4 (README); the PR body now lists only the rule IDs hit and deleted                                                                                                                                                                                                                                                                                                                             |
| **[NIT]** DoD says `prettier --check` rather than the repo command         | **Accepted.** Slices 1–2 now route through `pnpm format` / `pnpm format:check`, matching `CLAUDE.md` → Verification and CI's config resolution                                                                                                                                                                                                                                                                                                     |

Net effect on scope: no new files, no new tooling, no code changes. Four slices became five by
splitting one, and the probe in the last slice went from unfalsifiable to bounded.

### 7.2 Harden round 2 — disposition of every finding

Round 2 raised no BLOCKER and re-raised nothing from round 1; the critic confirmed the r1 fixes
landed and independently verified the repo facts it argued from (GET-only handlers, zero
`request.json()` calls, `prettier.config.mjs` with no `proseWrap`). I re-verified all three
before acting. Round 3 is the cap, so nothing below is left partial.

| Finding                                                                                   | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[SHOULD]** Skeleton is `jobs` (the D-3 loser) and its error shape is unstated           | **Accepted in full.** §4.1 A now says the skeleton is _structurally_ `jobs` — and that its uniform `NO_STORE` is deliberate because `jobs` is the D-4 **winner** — but that its `400` branch carries the D-3 shape (`ErrorResponse` + `z.treeifyError`), not `jobs`' hand-mapped `issues`. Slice 1 gains one DoD box covering both halves. The critic is right that a skeleton contradicting a decision outweighs a table row correcting it                                                                                                                                                                                                              |
| **[SHOULD]** "No claim about code that does not exist" collides with mandated D/F entries | **Accepted in full** — same collision class as r1's line cap, and a real unsatisfiable-DoD pair. Traceability is now scoped to sections A–C (and E); D/F are **exempt by construction**, since a failure mode is by definition about code not in the repo, and each D/F entry must instead carry a citation **or** a stated consequence. §1's non-goal was reworded to match, since the collision originated there                                                                                                                                                                                                                                       |
| **[SHOULD]** `request.json()` line specifically                                           | **Accepted, cutting the JSON half** as the critic suggested. Verified independently: zero `request.json()` calls and no non-`GET` handler anywhere in `apps/web/src`. The entry now reads "do not cast a search param", which traces to `jobs/route.ts:84-86` and `jobs/route.test.ts:147-155`, and states explicitly that body rules are omitted because no handler has a body yet — with a pointer to `/api-route`, which already teaches the malformed-JSON branch. Nothing is lost                                                                                                                                                                   |
| **[SHOULD]** B/C and D/F duplicate each other (five pairs)                                | **Accepted; executed as deletion, not just as a rule.** One governing sentence added to the §4 preamble (each item in exactly one section; failure-mode phrasing lives in D/F), and all five pairs are already resolved in the outlines so the implementer does not re-derive them: "never spread a row" and "never `fetch()` our own route" cut from §4.1 B; `cva`/`data-slot` cut from §4.2 B; the mutation rule cut from §4.2 C with its citation and tie-break clause folded into F; the formatter/`timeZone` duplicate cut from §4.2 F, since C states those positively with the reasons that are their whole value and C is a not-cuttable section |
| **[NIT]** 180-line cap unenforceable — Prettier will not reflow prose                     | **Accepted.** Verified `proseWrap` is absent from `prettier.config.mjs`, so the default `preserve` applies. §2 now requires prose wrapped at 100 columns by hand, as the root `CLAUDE.md` does, and says why the count is meaningless without it. Both slice DoDs carry the clause and no longer say "after `pnpm format`", which implied a reflow that never happens                                                                                                                                                                                                                                                                                    |
| **[NIT]** "never `fetch()` our own route" reaches nobody in `api/`                        | **Accepted, resolved by the dedup above.** The row is gone from §4.1 B. It survives as a single D bullet rather than being deleted outright: the audience is thin but non-zero — `jobs/page.tsx` imports `loadOpenJobs` _from_ `route.ts`, so an agent editing that export is reading under `api/` and is exactly the person who could get it wrong. One line, in the section where failure modes belong                                                                                                                                                                                                                                                 |

Nothing was rejected this round. Net effect: no new sections, no new slices, no scope growth —
the outlines lost five duplicated items and gained three governing clauses.

### 7.3 Harden round 3 — disposition of every finding

| Finding                                                                                                        | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[BLOCKER]** Subtree-load mechanism asserted, not verified; both files' trigger surface is 100% subtree reads | **Accepted as a fair challenge, and settled empirically — the premise holds.** The critic was right that the doc sentence is ambiguous between exact-directory and subtree semantics, that §2 claimed "verified … not recalled" for a property the quote does not settle, and that zero files sit directly in either governed directory. A probe was run: `.harness-probe/CLAUDE.md` carrying a sentinel string plus `.harness-probe/deep/nested-probe.ts` one level deeper; reading the nested file injected the ancestor `CLAUDE.md` in full as a system-reminder. **Subtree semantics confirmed**, so `apps/web/src/app/api/CLAUDE.md` loads on a read of `api/jobs/route.ts`, and D-2's rejection of `.claude/rules/` stands. §2 was rewritten around the experiment — procedure, result, and the doc quote flagged as ambiguous on its face. Probe artifacts deleted; both trees clean |
| **[BLOCKER, second half]** Slice 5's "Not loaded" row swallows the falsifying result                           | **Accepted in full**, and still applied even though the probe makes the branch unlikely. The row is split: _probe misfire_ (wrong session cwd, or the sibling read never happened) → fix and re-run, do not edit the file; _correct run, nothing injected_ → **the §2 premise is falsified, escalate, do not ship**, reopen D-2 or re-place the files. A branch that can absorb a falsifying result does not belong in a plan regardless of how improbable it is                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **New in §2 — cwd scoping caveat**                                                                             | **Recorded, and it is the most useful thing the probe produced.** A first probe attempt run from a _sibling worktree_ injected nothing, which would have read as a refutation. The docs scope discovery to files "under your current working directory", and a sibling worktree is not under the session cwd. §2 now states that an agent working from a different checkout root gets neither file — and slice 5's misfire branch checks it first                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| **[SHOULD]** AC-1/AC-2 pass bars measure the root `CLAUDE.md`, not slices 1–2                                  | **Accepted in full.** The old bars were verbatim R-A2/R-A3/R-A5/R-A6 and R-C1, all of which load unconditionally, so a pass proved nothing. Both bars rewritten around folder-file-only content, and each candidate term was checked to appear **zero times** in the root before use (`NextRequest`, `coerce`, `MAX_`, `ErrorResponse`, `treeifyError`, `className`, `Intl`, `timeZone`, `RouteContext` — all zero) and re-verified against real code. AC-2 additionally requires a prompt asking for a date-rendering component, or the formatter half of its bar is unfalsifiable. The skill confounder the critic named is now a recorded field with its own outcome row: a skill-assisted pass does not close the slice                                                                                                                                                                 |
| **[SHOULD]** D-3 settles the error-body contract but nothing puts the shape in the shipped file                | **Accepted, one line as suggested.** §4.1 A now requires the skeleton's `schema.ts` half to _define_ `export type ErrorResponse = { error: string; issues?: unknown }`, with slice 1 carrying a DoD box. `candidates/[id]/schema.ts:42-46` declares it per route rather than sharing it, so a new endpoint re-declares it — an imported type with no visible shape is exactly how an agent invents its own and defeats D-3                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

Nothing was rejected this round. Net effect: §2 rests on an experiment instead of an inference,
the acceptance probe measures the artifact this PR actually ships, and no slice, section or file
was added.

---

## 8. Acceptance criteria → how each is verified

| #   | Criterion (verbatim from the ticket)                                                                    | Verified by                                                                                                                                                       | Slice |
| --- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| 1   | Scaffolding an API route in `src/app/api` validates with zod and sets caching headers unprompted        | Slice 5 probe: realistic arrival (sibling read first), `/context` observable, a pass bar drawn only from what the folder file supplies, skill activation recorded | 5     |
| 2   | A component request in `src/components` defaults to a Server Component and justifies any `"use client"` | Same probe design, same four recorded fields; prompt must ask for a date-rendering component                                                                      | 5     |
| 3   | Neither file repeats a rule already stated in the root CLAUDE.md                                        | Line-by-line audit against the §3 table; PR body lists only the rule IDs that were hit and deleted                                                                | 3     |
| 4   | Each file states what NOT to do, not only what to do                                                    | §4.1 section D and §4.2 section F exist, are non-empty, and every entry names a consequence                                                                       | 1, 2  |

AC-1 and AC-2 are probabilistic, not deterministic — CLAUDE.md is context, not enforcement. The
evidence standard is therefore "state what happened, including which of the five outcomes was
hit", not "assert it passed". Two ways a run can look green and mean nothing, both now designed
out: a bar drawn from the root `CLAUDE.md` (which loads unconditionally) would pass without the
folder files existing, and a pass with `/api-route` or `/component` active is evidence about the
skill. The ticket's own wording — "validates with zod", "defaults to a Server Component" — is
root-supplied behaviour, so §8 tests the folder file's _contribution_ to it rather than the
sentence verbatim.

---

## 9. Risks and land-mines

- **Repetition is the default failure.** Writing about API routes without restating R-A1..R-A6 is
  genuinely hard; the natural draft repeats half the root. Slice 3 exists because of this, and
  §3.3 exists because reviewers check the root's "API routes" section and forget Imports, Tests
  and Comments.
- **The mechanism is lazy (§2).** A green AC-1 run may be green because the agent read a
  neighbouring route, not because the file loaded. Evidence that does not distinguish the two is
  worthless.
- **Three copies of the same conventions (§6).** This ticket knowingly adds the third. Mitigated
  by the follow-up, not by this PR.
- **These files change agent behaviour repo-wide.** They are configuration, not documentation. A
  wrong line here is executed by every future agent in that directory — which is why every claim
  must trace to real code, and why D-3/D-4/D-5 pick an existing pattern rather than an ideal one.
- **Prettier rewrites markdown.** `.md` is not in `.prettierignore` and `pnpm check` runs
  `prettier --check .`. Prose is not reflowed (`proseWrap` defaults to preserve), but tables,
  list markers, code-fence info strings and trailing whitespace are normalised — hand-aligned
  tables will be rewritten. Run `pnpm format` before `pnpm check`.
- **Documenting a rule the code violates.** D-3, D-4 and D-5 each pick a winner between two live
  patterns, so on merge the docs describe code that partly disagrees with them. Recorded in §4.3
  so the deviation is visible rather than discovered.
- **`next dev` rewrites `AGENTS.md`.** The `<!-- BEGIN:nextjs-agent-rules -->` block in
  `AGENTS.md` and `apps/web/AGENTS.md` is regenerated on every `next dev`. Do not fight it, and
  do not create sibling `AGENTS.md` files in the two new directories — the ticket asks for
  `CLAUDE.md`, and a generated block would land on top of anything else put there.

### §7.4 — Harden round 4 dispositions

Applied directly rather than through another author round: each finding arrived with its fix
already specified, and no design judgement was left to exercise.

| Finding                                                               | Disposition                                                                                                                                                      |
| --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **[SHOULD]** AC-1 bar unfalsifiable unless the prompt fixes the shape | **Accepted.** Slice 5 now requires the AC-1 prompt to ask for a list endpoint with a bounded numeric search param; without it `z.coerce` and `MAX_*` cannot fail |
| **[NIT]** "throwaway worktree" contradicts the §2 cwd caveat          | **Accepted.** Delete-by-path is now the default; a worktree is allowed only if the probe session starts inside it                                                |
| **[NIT]** Slice 4's README wording reproduces the settled ambiguity   | **Accepted.** The README must say `subtree`, not "that directory"                                                                                                |
| **[NIT]** Slice 3 emits nothing when the audit is clean               | **Accepted.** An empty audit still writes `rules hit: none`                                                                                                      |

**Loop status.** Four critique rounds against a default `HARDEN_MAX_ROUNDS` of 3. Round 3's
BLOCKER was refuted empirically by the §2 probe rather than argued down, which is why the loop was
extended by one confirming round. Round 4 returned no BLOCKER. The literal verdict never reached
`APPROVED`; convergence here is by severity, and the residue is the four one-clause fixes above.
