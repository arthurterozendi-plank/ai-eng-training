# AI-45 — Track the hiring funnel with analytics events

**Linear:** AI-45 · Type: Feature · Parent: AI-10 (Day 5) · Milestone: Week 1 — Use AI: Workflow
**Depends on:** AI-27 (PostHog setup — **still Todo, zero code**), AI-34 (domain model — done)
**Blocks:** AI-46 (analytics gap audit), and read by AI-63 (NL-to-dashboard, Day 9)
**Branch:** `feat/ai-45-funnel-analytics` (worktree `AI-ENG-Training-ai-45`, based on `origin/main` at e46eee5)
**Status:** revised after harden round 1 (`CHANGES_REQUESTED`); every finding's disposition is in §6.

---

## 1. Problem statement

A recruiting lead asked to name the leaking stage today can only guess. `application_stage_transitions`
records what happened _inside_ the pipeline once a candidate is in it, but the pipeline's mouth — a job
being read, a form being opened, a resume being attached, a submit succeeding — leaves no trace at all.
Drop-off before `applied` is invisible, and drop-off after it is reconstructable only by hand.

This ticket does not fix that by adding a page. It fixes it by **deciding, once, what the six funnel
events are called, what they may carry, and which domain acts do and do not emit them**, and shipping
that decision as typed, tested, executable code rather than as a paragraph. AI-46 audits against this
catalog; AI-63 generates dashboards from these names and properties.

### The hard constraint: neither end of AC 1 exists

| Missing                        | Evidence                                                                                                                                                                                                                                                                                |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **The destination (AI-27)**    | No `posthog-js` / `posthog-node` in any `package.json` or the lockfile; no `NEXT_PUBLIC_POSTHOG_KEY` in `apps/web/src/env.ts` or `.env.example`; `grep -ri posthog` over all source returns nothing. No cloud project exists.                                                           |
| **The source (no apply flow)** | `apps/web/src/app/` holds `page.tsx`, `jobs/page.tsx`, `candidates/[id]/page.tsx`, `settings/page.tsx` and three API routes. There is no `jobs/[id]` route — `JobCard` is not even a link — no application form, no upload, no submit action, no stage-change control, no offer action. |

So AC 1 — "a full apply flow walked on localhost … all six events appear in PostHog in order" — is
**not verifiable by this ticket, by any amount of work inside this ticket's scope.** §1.2 states exactly
what is verified instead and what stays owed.

### 1.1 Acceptance criteria (verbatim from the ticket)

1. Given a full apply flow walked on localhost, when it completes, then all six events appear in
   PostHog in order
2. Event names follow one documented convention (`object_action`, past tense) with no exceptions
3. Every event carries job id, source, stage and actor role where those apply
4. No candidate name, email or resume content appears in any event property
5. Edge case: an abandoned application still emits its earlier events, so partial funnels are
   measurable

### 1.2 What each AC is verified against here

| AC  | Verified now, offline, inside `pnpm check`                                                                                                                                                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Partially — the emission half only.** A funnel-walk test pushes one of each event through the real capture path into a recording sink and asserts the recorded names equal the ordered catalog exactly. The **"appear in PostHog"** half is not verifiable and is not claimed. See §1.3.                                                          |
| 2   | Fully. A table-driven conformance test over the catalog asserts every name matches `^[a-z]+(?:_[a-z]+)+$`, that its final segment ends in `ed` or is in an explicit irregular allow-list, that names are unique, and that there are exactly six — so a seventh event cannot be added without the test going red and forcing this document's review. |
| 3   | Fully. A test asserts `job_id` and `actor_role` are required on all six, `source` on the five other than `job_viewed`, both id properties on exactly the events of §3.3, and `stage` on the three that have a stage.                                                                                                                                |
| 4   | Fully, and **structurally rather than by filtering**: every property is a uuid or a member of a closed enum, so a name, an email or resume prose is _unrepresentable_. Asserted three ways in §5 slice 2.                                                                                                                                           |
| 5   | Fully at the contract level. Pre-submit events are provably satisfiable with no server-assigned identifier, and an abandonment walk records exactly the events that already happened.                                                                                                                                                               |

### 1.3 What stays owed after this ticket

AC 1's second half needs three things, none of which is AI-45's:

1. **A provisioned PostHog cloud project and key** — AI-27, and a human with the account.
2. **A sink wired to that project** — AI-27 ships the browser client; nothing currently owns the
   one-line `AnalyticsSink` adapter over it, and this ticket deliberately does not add it (🔴 #2).
3. **Six surfaces to emit from** — the apply flow. None exists; see §3.5 for who owns each.

**The PR for this ticket must not claim AC 1.** It claims AC 2–5 and the emission half of AC 1.

### 1.4 The central fork, and how it is resolved

> **Should AI-45 build a minimal apply flow so that AC 1 becomes walkable?**
> **No.** The contract ships; no product UI ships; no event is wired.

Three options were weighed:

- **(A) Contract only — chosen.** Catalog, property vocabulary, capture choke point, emission rules,
  all tested offline. Zero call sites.
- **(B) Contract + a minimal apply flow.** Rejected. A walkable flow means a job detail route, an
  application form, file upload with somewhere to put the file, a submit write path, a stage-change
  control and an offer action — six surfaces, spanning Day 18 (AI-110/112/113/114) and Day 22
  (AI-107). Every line of it would be rewritten by those tickets, and the resume upload alone forces a
  storage-and-PII decision that is a genuine one-way door this ticket has no mandate to open. Building
  a week-1 throwaway to satisfy a checkbox is the definition of the scope creep the harden pass exists
  to catch.
- **(C) Contract + wire the surfaces that already exist.** Rejected on the evidence, which contradicts
  the intuition behind it. There is no per-job route, so `job_viewed` has no honest call site: emitting
  it per `JobCard` in the `/jobs` list would record six impressions per page load as six job views and
  would permanently poison the funnel's top-of-funnel denominator — on a name that cannot be renamed
  afterwards. And there is no stage-change write path at all: the only stage transitions in existence
  are historical seed rows, so "wiring" them would mean backfilling analytics events with fabricated or
  `now()` timestamps. A wrong call site is worse than no call site, because a missing event is visible
  to AI-46's audit and a wrong one is not.

The decisive argument for (A): **the durable deliverable of this ticket is a contract, and a contract's
value is that it is fixed before its callers exist.** The ticket says so itself — "a documented naming
convention", "properties for job id, source, stage and actor role" — and AC 2 is a statement about
names, not about pages. The repo already accepts a contract with no reader for exactly this reason
(`DATABASE_URL` shipped in `.env.example` with nothing reading it, AI-34 §6 🟡 #23); what it rejects is
speculative _code_ that its first real consumer will rewrite (AI-34 harden round 1 finding 9,
`client.ts`). The catalog is the former. The seam is drawn so that it stays the former: see §4.

---

## 2. Verified facts this plan rests on

Measured in this worktree on 2026-08-24, not recalled. Facts marked **(run)** were executed.

- **(run) Nothing PostHog-related exists.** `grep -ri "posthog\|analytics\|telemetry"` across all
  source, config and manifests returns only prose in `docs/specs/ai-43-database-mcp.md` (which names
  AI-44's future `apps/mcp-posthog`), one README table row, and seed résumé text. No dependency, no env
  key, no module.
- **(run) `zod@4.4.3` is installed** and `z.strictObject` rejects an unknown key, `z.uuid()` rejects
  `"Ada Lovelace"`, `z.enum(...)` rejects an email address, `.options` is readable off both,
  `.nullable()` works, and `z.discriminatedUnion("name", …)` rejects an unlisted discriminant. All five
  behaviours the AC 4 tests depend on were executed against the installed package.
- **(run) A closed enum can be derived from the database schema with no runtime import.**
  `import type { applicationSource } from "@talentscout/db/schema/enums"` followed by
  `["careers_site", …] as const satisfies readonly (typeof applicationSource.enumValues)[number][]`
  typechecks, and `["postcard"] as const satisfies …` fails with `TS2322`. This is the fact §4's
  bundle-safety argument rests on: the import is erased, so no client bundle pulls in
  `drizzle-orm/pg-core`.
- **(run) `z.enum(PIPELINE_STAGE_SEED.map((s) => s.key))` infers exactly `PipelineStageKey`**, not
  `string` — proven with a `@ts-expect-error` probe. Used in the tests, where a runtime drizzle import
  is free.
- **(run) Every application's first stage transition is a real row with `from_stage = null`, written at
  the same moment the application is created — and the database records that _nobody performed it_.**
  This is the fact BLOCKER 1's resolution rests on, and it was re-verified rather than taken from the
  critique. `packages/db/src/seed-data.ts` builds transitions with
  `const fromStage = step === 0 ? null : path[step - 1]`, and sets both
  `changedBy: fromStage === null ? null : …` and `reason: fromStage === null ? null : …`. Every one of
  the thirteen `PATH_LIBRARY` shapes in `packages/db/src/seed-data-content.ts` begins with `applied`,
  so the first transition is always `null → applied`. `NewApplicationStageTransition`'s JSDoc says
  "`fromStage` is nullable (null on an application's first transition)", and the table's only related
  constraint is `from_stage IS NULL OR from_stage <> to_stage`.
- **`apps/web` already imports from `@talentscout/db` by package name** in both a Server Component
  (`candidate-profile.tsx` imports `PIPELINE_STAGE_SEED`) and a schema module
  (`api/candidates/[id]/schema.ts` imports `type PipelineStageKey`), and
  `candidate-profile.test.tsx` exercises that import under jsdom. The cross-workspace import and its
  test-time behaviour are both precedented.
- **`@talentscout/db` exports `"./*": "./src/*.ts"`**, so `@talentscout/db/schema/enums` and
  `@talentscout/db/schema/pipeline-stages` are both importable.
- **`applicationSource.enumValues` is** `careers_site, referral, linkedin, job_board, agency, email,
import`. **`PIPELINE_STAGE_SEED` keys are** `applied, screening, interview, offer, hired, rejected,
withdrawn`, with `offer` at position 4 and `hired`/`rejected`/`withdrawn` terminal. Nothing in the
  schema prevents leaving a terminal stage — the only constraint is `from <> to` — which is what makes
  the re-offer risk in §7 real rather than theoretical.
- **There is no authentication, session or user concept anywhere in this repository.**
  `application_stage_transitions.changedBy` and `interviews.interviewerName` are nullable/free-text
  names, `apps/web/src/app/api/CLAUDE.md` records "no auth scheme exists yet and no ticket owns one",
  and every route ships with a `// TODO: authorization`. This is the fact BLOCKER 2's resolution rests
  on.
- **`apps/web` vitest collects `src/**/*.{test,spec}.{ts,tsx}` under jsdom**, so every module here must
  live under `src/` to be tested.
- **`.claude/skills/pre-deploy/scripts/check-console.sh` fails on `console.log`/`console.debug`
  anywhere in `apps/*/src` and `packages/*/src`; `console.error` and `console.warn` are allowed** —
  which is what the capture path's drop-and-log branch uses.
- **(run) `.claude/skills/pre-deploy/scripts/check-env.sh` warns about any key matching `^\s*KEY: z\.`
  in a `src/env.ts` that is missing from `.env.example` — and it separately FAILs, exiting 1, when a
  declared key has no value.** Executed here: it prints
  `FAIL: unset or empty: NEXT_PUBLIC_APP_URL DATABASE_URL DIRECT_DATABASE_URL` and exits 1, because no
  `.env.local` exists in this worktree. That branch is unrelated to this ticket and will fire whatever
  the implementer does. **The guard slice 5 relies on is the `WARN:` line only**, which the drift check
  still emits (or does not) regardless of the FAIL — so a red exit here is not a failed DoD. This
  ticket adds no env key, so no `WARN:` line must appear.
- **Next 16.3.1 provides `instrumentation-client.ts`** (`src/` root, runs after document load and
  before hydration) and an `onRouterTransitionStart` hook. This is where AI-27's client init and sink
  registration belong. Read from
  `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`.
- **Current published versions, for AI-27's benefit, not used here:** `posthog-js@1.418.12`,
  `posthog-node@5.51.1`. `posthog-node`'s capture queues and its flush is asynchronous — the fact §4's
  sink signature accounts for.
- **`apps/web/src/lib/` is flat today** (`format.ts`, `theme.ts`, `utils.ts`, plus tests) and contains
  no subdirectory and no folder `CLAUDE.md`.

---

## 3. The contract

### 3.1 The naming convention (AC 2)

> **Every analytics event name is `object_action`: lowercase snake_case, singular object, past-tense
> verb last, no prefix, no version suffix.**
>
> Formally, a name must match `^[a-z]+(?:_[a-z]+)+$` — at least two segments — and its **final**
> segment must be a past-tense verb: it ends in `ed`, or it appears in an explicit irregular
> allow-list, which today holds exactly one entry, `made`. Everything before the final segment is the
> object, and a compound object (`application_stage`) is written out rather than abbreviated.

Three sub-decisions inside that rule, made here and not revisited:

- **No namespace prefix** (`ts_`, `app_`, `talentscout_`). PostHog already separates its own events with
  a `$` prefix (`$pageview`, `$autocapture`), so ours need no second separator, and a prefix is a
  permanent five-character tax on every query, funnel definition and dashboard AI-63 generates.
- **The irregular allow-list is a ratchet, not a convenience.** Adding a verb to it is a change to this
  document and to the README, which is precisely the review moment a new event should trigger.
- **Past tense is enforced mechanically, not by inspection.** `job_view`, `job_viewing` and
  `viewJob` all fail the conformance test. That is what "with no exceptions" in AC 2 means here.

### 3.2 The six events, and the two emission rules

| Event                       | Ticket wording        | Fires when                                                            |
| --------------------------- | --------------------- | --------------------------------------------------------------------- |
| `job_viewed`                | job viewed            | a viewer opens one job's detail surface                               |
| `application_started`       | application started   | the apply form is opened for a job                                    |
| `resume_uploaded`           | resume uploaded       | a résumé file finishes attaching to that draft                        |
| `application_submitted`     | application submitted | the submit succeeds and the `applications` row exists                 |
| `application_stage_changed` | stage changed         | an application is moved **out of one stage into another** — see below |
| `offer_made`                | offer made            | that same move targets `offer` — see below                            |

That table's order is the ordered catalog, and it is the order AC 1 means by "in order". It is stored
**once**, as the catalog itself; there is no second ordering constant.

**Why `application_stage_changed` and not `stage_changed`.** The object must be unambiguous, and more
than one thing in this domain has a stage-like attribute — `jobs.status`, `interviews.status`. The
underlying table is `application_stage_transitions`. `stage_changed` would be the only name in the
catalog whose object could not be identified from the name alone, which is exactly the exception AC 2
forbids.

Both rules below are encoded in one function, `eventsForStageTransition`, which maps a written
transition row to the list of events it emits. Neither is left as a paragraph for a call site to
honour.

#### Rule 1 — the entry transition emits nothing

> A transition with `from_stage = null` — an application entering the pipeline — emits **no events at
> all**. `application_submitted` is the entry event. `eventsForStageTransition` returns `[]`, and
> `application_stage_changed` **requires a non-null `from_stage`**, so a hand-built entry event also
> fails to parse.

This is BLOCKER 1's resolution, and it is enforced twice on purpose: once in the function, once in the
schema. Three independent reasons, in descending order of force:

1. **The alternative destroys the funnel's most important measurement.** Every application's first
   transition is `null → applied`, written in the same act as the `applications` row (§2, measured). If
   it emitted, then `application_submitted` and `application_stage_changed` would fire together for
   every application forever, the step-4-to-step-5 conversion rate would be a permanent 100%, and "how
   many submitted applications actually get moved out of `applied`?" — the single question the bottom
   half of this funnel exists to answer — would become unaskable.
2. **The database already says nobody performed it.** The seed writes `changedBy: null` and
   `reason: null` for exactly the `from_stage === null` row. `actor_role` is required on
   `application_stage_changed`; emitting the entry transition would force a call site to invent an
   actor for an act the domain model explicitly records as having none.
3. **It makes `application_stage_changed` mean one thing:** a recruiter (or the Day 18 pipeline) moved
   this application. That is the recruiting lead's question. The entry row is bookkeeping that keeps
   AI-34's transition log complete, not a recruiter action.

The cost is that the transition log and the event stream are no longer one-to-one: a consumer counting
`application_stage_changed` will find one fewer event per application than there are transition rows.
Recorded in §7 so AI-46 and AI-63 do not read it as a gap.

#### Rule 2 — the offer fan-out

> A transition into `offer` emits **exactly two events, in this order**: `application_stage_changed`
> with `stage = "offer"`, then `offer_made`. `offer_made` is never emitted on its own, and never for
> any other target stage.

`offer` is pipeline stage 4, so moving an application into it is _both_ a stage change _and_ the offer
being made, and the ticket requires both events to exist (AC 1 names six). The cost is that a funnel
built on both events double-counts the offer step; that is a dashboard-authoring hazard, recorded in
§7, and it is cheaper than either alternative — dropping the stage-change event at `offer` would leave
a hole in AI-46's audit, and deriving `offer_made` at query time contradicts AC 1's "all six events
appear".

### 3.3 The property contract (AC 3, AC 4)

**The rule that makes AC 4 structural:** _every property is a uuid or a member of a closed enum._ There
is no free-text property in the catalog and no mechanism to add one without editing this rule, the
schemas and the tests together. A candidate's name, email address or résumé prose is therefore not
filtered out — it is unrepresentable.

Shared vocabulary:

| Property               | Type                                                       | Derived from                   |
| ---------------------- | ---------------------------------------------------------- | ------------------------------ |
| `job_id`               | uuid                                                       | `jobs.id`                      |
| `application_id`       | uuid                                                       | `applications.id`              |
| `application_draft_id` | uuid, minted in the browser                                | nothing — see AC 5 below       |
| `source`               | closed enum, 7 values                                      | `applicationSource.enumValues` |
| `stage` / `from_stage` | closed enum, 7 values                                      | `PIPELINE_STAGE_SEED` keys     |
| `actor_role`           | closed enum: `visitor`, `candidate`, `recruiter`, `system` | this document — see below      |

Per event:

| Event                       | `job_id` | `source`     | `stage`           | `actor_role` | `application_draft_id` | `application_id` |
| --------------------------- | -------- | ------------ | ----------------- | ------------ | ---------------------- | ---------------- |
| `job_viewed`                | required | **optional** | —                 | required     | —                      | —                |
| `application_started`       | required | required     | —                 | required     | required               | —                |
| `resume_uploaded`           | required | required     | —                 | required     | required               | —                |
| `application_submitted`     | required | required     | required          | required     | required               | required         |
| `application_stage_changed` | required | required     | required (`to`)   | required     | —                      | required         |
| `offer_made`                | required | required     | literal `"offer"` | required     | —                      | required         |

**`—` means the property is not in that event's schema at all**, and because every schema rejects
unknown keys, passing it makes the event fail to parse. `source` on `job_viewed` is the one genuinely
optional property in the catalog. `application_stage_changed` additionally carries `from_stage`,
required and non-null (§3.2 Rule 1).

**`actor_role` is established by the _surface_, not by a session.** This is BLOCKER 2's resolution, and
it is the rule that makes every value honest in a repository with no authentication (§2):

| Value       | Means                                                                       |
| ----------- | --------------------------------------------------------------------------- |
| `visitor`   | a public, unauthenticated surface — the actor's identity is not established |
| `candidate` | a candidate-facing surface behind an authenticated candidate session        |
| `recruiter` | the internal recruiter application                                          |
| `system`    | an automated pipeline acting with no human in the loop (Day 18)             |

`visitor` is added rather than making `actor_role` optional on `job_viewed`, and rather than letting
the first call site hard-code `"candidate"`:

- **A required property with an explicit "not established" value is unambiguous.** An optional property
  conflates "we could not know" with "the call site forgot" — and the two want opposite fixes.
- **It is the reversible direction.** Relaxing a required property to optional later costs nothing;
  tightening an optional one to required leaves a permanent hole in history. Likewise, _adding_ a value
  to a vocabulary is cheap — new values simply appear from a date onward — whereas redefining one that
  has already been emitted is the un-rewritable case the critique correctly identified.
- **It stays truthful after auth arrives.** An authenticated candidate becomes `candidate`; an
  anonymous one stays `visitor`. No rename is needed at the one moment the door would otherwise close.
- **It avoids a second carve-out on one event.** `source` is already optional on `job_viewed`; making
  `actor_role` optional there too would say the event does not fit the contract.

**The honest consequence, which corrects an earlier claim in this spec:** until an authenticated
surface exists, _every_ candidate-side event — `job_viewed`, `application_started`, `resume_uploaded`,
`application_submitted` — carries `visitor`, and `candidate` has no producer at all. `actor_role`
therefore **cannot** exclude internal recruiter previews from top-of-funnel traffic today; an earlier
draft of this document claimed it could, and that was wrong. Recorded as a Risk in §7.

Reading of "where those apply" (AC 3):

- **`stage` is absent from the first three** because no `applications` row exists yet, so there is no
  stage to report. Inventing `stage: "applied"` before a row exists would make the funnel's first three
  steps indistinguishable from its fourth in any stage breakdown.
- **`source` is optional on `job_viewed` alone.** The discriminator is _commitment_, not the existence
  of a row — no `applications` row exists at `application_started` or `resume_uploaded` either, which
  is §3.4's whole argument. From `application_started` onward the flow has committed to creating an
  application, and that application will carry a `source` column, so the value is **determined** even
  though the row is not yet written. A job view carries no such commitment: most views never become an
  application at all, so there is nothing yet whose source it could be. It is optional rather than
  absent so that an arrival which _does_ carry an attribution signal — a `?src=linkedin` careers link —
  can still be counted at the top of the funnel. PostHog attaches `$referrer`, `$current_url` and UTM
  parameters to every event by itself — that is AI-27's init, and nothing here should duplicate it.
- **`stage` on every event that has one means "the stage as of this event"**, so one breakdown works
  across the whole funnel. `from_stage` is the extra property, not `to_stage`.
- **`from_stage` is required and non-nullable**, which is Rule 1 enforced a second time in the schema.
- **`offer_made.stage` is the literal `"offer"`**, not the general stage enum. It is redundant by
  construction, and that is the point: it makes an `offer_made` on any other stage a type error and a
  failed parse.

### 3.4 Why AC 5 falls out of `application_draft_id`

This is the load-bearing design decision. If `application_started` required a database-assigned
`application_id`, an abandoned application could never emit it — there is no row — and "partial funnels
are measurable" would be structurally false. So the pre-submit half of the funnel is keyed by a **uuid
the browser mints when the flow opens**, and `application_submitted` is the single event carrying
**both** that draft id and the server-assigned `application_id`. That one event is the stitch between
the anonymous half and the durable half.

Consequences, both stated so the first call site does not have to rediscover them: the draft id must
survive a reload for the whole flow (session-scoped storage, the call site's problem); and
`application_started` and `resume_uploaded` **reject** an `application_id` property outright, so the
abandonment-safe shape cannot be quietly undone later.

**Server-created applications emit nothing before `application_stage_changed`.** `applications.source`
is `notNull().default("careers_site")` and the enum carries `import`, `agency` and `email` (§2), so
application rows exist that no browser flow ever produced — and §3.5 names AI-112 as a real creator of
exactly those. They have no minted draft id, so the rule is:

> `application_submitted` fires **only on a candidate-initiated browser submit**. An application
> created server-side — a bulk import, an agency feed, an emailed CV — emits no funnel event at all
> until its first real stage change, where it enters the stream as `application_stage_changed` like
> any other.

The discriminator is **how the row was created, not what its `source` says**: a candidate who clicks
through from LinkedIn and fills in the form is a browser submit carrying `source: linkedin`, and it
emits. `import`, `agency` and `email` are simply the sources where server creation is expected.

The alternative — making `application_draft_id` optional on `application_submitted` so server-created
rows can emit it too — was rejected for the same reason Rule 1 exists. The four pre-submit events
measure one candidate journey; a bulk import of five hundred rows never viewed a job, started a form
or uploaded anything, so counting it as a submit would push `resume_uploaded` → `application_submitted`
conversion above 100% and make the step meaningless. Keeping the draft id **required** is what holds
AC 5's join together, and it is only affordable because of this rule. The accepted cost — submit counts
undercount total applications — is recorded in §7.

### 3.5 Emit points — where each event will be wired, and by whom

No event is wired in this ticket. This table is the honest register of what is missing; it is the
input AI-46's gap audit needs, and it is deliberately not encoded in code, because a prose field on a
catalog entry would assert nothing a test could check.

| Event                       | Surface required                  | Exists today?                                      | Owner                                                                                         |
| --------------------------- | --------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `job_viewed`                | a per-job detail route            | **No.** `/jobs` is a list; `JobCard` is not a link | **unknown** — no backlog issue names a job detail page                                        |
| `application_started`       | an apply form                     | **No.**                                            | **unknown** — no backlog issue names an apply form                                            |
| `resume_uploaded`           | a résumé upload control + storage | **No.**                                            | **unknown** — AI-107 (Day 22) consumes uploaded résumés; the upload surface itself is unnamed |
| `application_submitted`     | a submit write path               | **No.**                                            | **unknown**; AI-112 (Day 18) stores approved applications                                     |
| `application_stage_changed` | the first stage-change writer     | **No.** Transitions exist only as seed rows.       | **AI-112** — named as the first real writer by AI-34 §3.6                                     |
| `offer_made`                | the same writer                   | **No.**                                            | **AI-112**, via Rule 2                                                                        |

Four rows say `unknown` because they are unknown. Naming a plausible issue number would be inventing
one, which the working agreement forbids.

---

## 4. File layout and the AI-27 seam

| Path                                       | What                                                                                                            | Why here                                                                                                                                           |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/lib/analytics/properties.ts` | the shared property vocabulary and its zod schemas                                                              | CLAUDE.md: framework-free code → `src/lib/`. Three modules earn a subdirectory; the existing flat files do not become a precedent against one.     |
| `apps/web/src/lib/analytics/events.ts`     | the ordered catalog, the convention constants, the per-event strict schemas, and the two emission rules of §3.2 | the contract itself, plus the one derivation over it — kept together because the rules are statements _about_ the catalog and share its vocabulary |
| `apps/web/src/lib/analytics/capture.ts`    | `AnalyticsSink`, `captureAnalyticsEvent(event, sink)`                                                           | the single runtime choke point where an event is validated before it leaves the process                                                            |
| `…/*.test.ts` beside each                  | co-located tests                                                                                                | CLAUDE.md, and vitest only collects under `src/`                                                                                                   |
| `README.md`                                | a new **Analytics** section                                                                                     | the working agreement: a decision about this project lives in the README, in the same PR                                                           |
| `docs/specs/ai-45-funnel-analytics.md`     | this file                                                                                                       | —                                                                                                                                                  |

**Three modules, not four.** An earlier draft had a fourth holding a `FUNNEL_ORDER` constant and the
fan-out rule. `FUNNEL_ORDER` was the catalog stored a second time, so it is gone; with it gone, the
remaining function is a one-line derivation over the catalog and belongs beside it.

**Not a package.** CLAUDE.md: extract when a second consumer exists. There is one consumer
(`apps/web`) and, today, zero call sites inside it. If a second surface ever needs to emit — a server
worker, say — that is the moment to extract, not now.

**No folder `CLAUDE.md` under `src/lib/`.** AI-40 settled which folders carry one; adding a third here
is scope creep, and the JSDoc plus the README section carry the same information at the call site.

### The seam: this ticket adds no PostHog dependency and no env key

`captureAnalyticsEvent(event, sink)` takes the sink **as an explicit argument**. That single decision
is what keeps AI-45 out of AI-27's ticket:

- **No `posthog-js` dependency**, so no bundle, no `NEXT_PUBLIC_POSTHOG_KEY` in `apps/web/src/env.ts`,
  no `.env.example` line. AI-27 owns all four, and two tickets owning the same env key is a merge
  conflict and a double-init waiting to happen.
- **Every test runs with a recording function**, no PostHog mock, no network, no key.
- **AI-27's wiring is one adapter**, in `src/instrumentation-client.ts` or beside its client module:
  a function of `(name, properties)` that calls `posthog.capture`, plus whatever ergonomic wrapper it
  wants over `captureAnalyticsEvent`. That wrapper belongs with the client because the client owns its
  own lifecycle.

**The sink's signature is `(name, properties) => void | Promise<void>`, and `captureAnalyticsEvent`
always returns `void`.** This is the public contract AI-27 and AI-112 will code against, so it is
settled here rather than discovered later:

- Two of the six events are **server-emitted by design** (§3.5, owner AI-112), and a server adapter
  over `posthog-node` is asynchronous. A sink typed `=> void` would accept an `async` function
  silently — TypeScript permits it — and its rejection would escape `captureAnalyticsEvent`'s
  `try`/`catch` as an unhandled promise rejection, defeating the one guarantee the choke point exists
  to provide (🟡 #17).
- So `captureAnalyticsEvent` handles **both** failure modes: it catches a synchronous throw, and when
  the sink returns a thenable it attaches a rejection handler. Callers are never affected by the
  difference, because the return type stays `void` in both cases.
- The alternative — declaring `=> void` and documenting "async adapters must catch internally" — was
  rejected: it is a rule the type system permits violating, which is the same class of thing as a DoD
  check that cannot fail.

**Rejected: a module-level `setAnalyticsSink(sink)` singleton.** It reads better at a call site, but
module state in a Next app is shared across concurrent server requests, so a server-side emitter would
either leak a sink between requests or need a second API anyway. An explicit parameter has no such
hazard and costs the eventual call site nothing, because AI-27's wrapper closes over the sink once.

**Rejected: builder functions** (`buildJobViewedEvent(...)`). Six functions of pure ceremony. The
discriminated union already makes `{ name, properties }` compile-time-checked at the call site.

---

## 5. Plan (slices)

Every DoD item below is a check that can go red. Items that cannot fail **today** — because the thing
they guard is already enforced by the type system, or guards a deviation rather than a bug — are marked
**(regression guard)** with the specific edit that would make them fail. Anything carrying neither a
present failure mode nor that marker does not belong in a DoD.

Slices name **event names, property names, types and required/optional** — the contract. They
deliberately do not name export identifiers, refinement expressions or test fixture strings; those are
the implementer's against real code, and the DoD statements already pin the observable behaviour.

Slices 1 → 2 → 3 → 4 are strictly ordered by import dependency. Slice 5 can be written in parallel with
any of them. **Nothing waits on the two 🔴 escalations** — see §6 for why.

1. [ ] **Property vocabulary and the closed-enum rule** — `apps/web/src/lib/analytics/properties.ts`
       holding the uuid, source, stage and actor-role property schemas of §3.3 and their inferred
       types. The two database-derived vocabularies use **type-only** imports plus
       `as const satisfies readonly …[]`, never a runtime import (§2, bundle safety). JSDoc on every
       export, per CLAUDE.md.
       **DoD:** `pnpm check` green; a test asserts the source vocabulary is set-equal to a _runtime_
       import of `applicationSource.enumValues`, and the stage vocabulary set-equal to the
       `PIPELINE_STAGE_SEED` keys — red the day a value is added to either database enum and not here;
       each uuid property's schema rejects a personal name, an email address, an empty string and the
       literal string `"undefined"`, and accepts a generated uuid; the actor-role schema accepts
       exactly the four roles of §3.3 and rejects an unlisted one; a `@ts-expect-error` line proves the
       `satisfies` derivation rejects a string literal that is not a database source value — red if the
       derivation is ever loosened to `string[]`.

2. [ ] **Catalog, naming convention, per-event schemas** — `events.ts` holding the ordered catalog
       `ANALYTICS_EVENT_NAMES` (the six of §3.2, in that order, stored once), the name-pattern and
       irregular-verb constants, a per-name map of property schemas, a discriminated union over `name`,
       and the per-event types. Every properties schema rejects unknown keys.
       **DoD:** `pnpm check` green, plus these tests —
       **(AC 2)** table-driven over `ANALYTICS_EVENT_NAMES`: every name matches the documented pattern,
       has ≥ 2 segments, and its final segment ends in `ed` or is in the irregular allow-list; names are
       unique; there are exactly six. Red on a typo, a camelCase name, a present-tense verb, or a
       seventh event added without revisiting this document.
       **(AC 4, values)** table-driven over _every event × every property_: substituting a personal
       name, and separately an email address, for that property's value makes parsing fail. Red the
       moment any property is typed as an unconstrained string.
       **(AC 4, unknown keys)** for every event, a valid payload plus a `candidate_email` key fails.
       Red if any schema is written without unknown-key rejection.
       **(AC 4, property names)** no property name in any event matches
       `/(name|email|phone|resume|letter|address|body|summary|text|file|url)/`. Red if someone adds
       `file_name` — the specific trap, because a résumé filename usually _is_ the candidate's name.
       **(AC 3)** `job_id` and `actor_role` parse as required on all six; `source` required on the five
       other than `job_viewed` and optional there; `stage` required on exactly
       `application_submitted`, `application_stage_changed`, `offer_made`; **`application_draft_id`
       required on exactly `application_started`, `resume_uploaded` and `application_submitted`, and
       rejected on the other three; `application_id` required on exactly `application_submitted`,
       `application_stage_changed` and `offer_made`, and rejected on the other three** — both ids
       asserted positively and negatively across all six, because `application_draft_id` is the single
       property AC 5's structural claim rests on and §3.4's server-created rule is what lets it stay
       required.
       **(AC 5)** `application_started` and `resume_uploaded` each parse from job id, source, actor role
       and draft id alone, and each _reject_ the same payload plus `application_id`.
       **(Rule 1)** `application_stage_changed` **rejects** a null `from_stage` and rejects a
       `from_stage` equal to `stage`. Red if the entry-transition resolution is undone in the schema.
       **(Rule 2)** `offer_made` rejects any `stage` other than `offer`.
       **(regression guard)** the key set of the per-name schema map equals `ANALYTICS_EVENT_NAMES`.
       TypeScript already enforces this through the map's `Record<AnalyticsEventName, …>` type, so it
       is green by construction today; it goes red if that type is ever widened to a string key to
       silence an error, which is the realistic way a name and its schema drift apart.

3. [ ] **The capture choke point** — `capture.ts` exporting the `AnalyticsSink` type of §4 and
       `captureAnalyticsEvent(event, sink)`: validate against the catalog schema for `event.name`, call
       the sink on success, and on failure log once via `console.error` and return without calling it.
       It returns `void` and never throws — a synchronous throw is caught, and a returned thenable gets
       a rejection handler.
       **DoD:** `pnpm check` green; a recording sink receives the name and the parsed properties exactly
       once per valid event; an event whose properties were cast past the type system to carry a
       non-uuid `job_id` **never reaches the sink** and logs once via a spied `console.error` (red if
       the validation is removed); a **synchronously throwing** sink does not propagate —
       `captureAnalyticsEvent` returns normally and logs; an **async sink whose promise rejects** does
       not produce an unhandled rejection — asserted by failing the test on an
       `unhandledRejection`/`unhandledrejection` listener, and red if the thenable branch is removed.
       That last case is the one the `=> void | Promise<void>` signature exists for, and it is the
       failure mode AI-112's server-side emitter would otherwise hit first;
       an event whose `name` is **outside the catalog** — so no schema exists to validate it against —
       never reaches the sink, logs once via `console.error`, and does not throw. Red if the schema
       lookup is written unguarded. This is the third failure direction and the only one that is not a
       sink failure: the other two cases exercise a bad _value_ and a bad _sink_, while this one
       exercises the lookup itself, which is where "never throws" actually breaks. It is reachable from
       a JavaScript caller, an `as any` cast, or a name left stale by a rename — and §1.4's own
       argument, that this catalog outlives its callers and is consumed by tickets that do not yet
       exist, is exactly what makes an unlisted name the realistic case rather than a defensive one.
       **(regression guard)** no PostHog dependency appears in any workspace manifest or in the
       lockfile, and no PostHog module, env key or client init exists anywhere under `apps/` or
       `packages/`. Stated as behaviour rather than as a command: an earlier draft pinned a `git diff`
       pathspec that was measured not to match the root manifest at all, which is the exact shape of a
       check that reads like coverage and provides none. Green by construction if the plan is followed;
       red if an implementer or a later ticket takes the PostHog dependency, the env key or the client
       init _here_ instead of in AI-27 — which is the seam of §4 asserted rather than asserted-about.

4. [ ] **The two emission rules and the walk tests** — add `eventsForStageTransition({ jobId,
applicationId, source, fromStage, toStage, actorRole })` to `events.ts`, returning `[]` when
       `fromStage` is null (Rule 1) or when `fromStage === toStage`, `[application_stage_changed,
offer_made]` when `toStage` is `offer` (Rule 2), and a single `application_stage_changed`
       otherwise.
       **DoD:** `pnpm check` green, plus —
       **(Rule 1)** a null `fromStage` returns `[]` for _every_ target stage, including `offer` — red if
       the entry transition is ever allowed to emit, and the `offer` case is called out separately
       because Rule 2 is the one place the two rules could be implemented in the wrong order;
       a no-op transition (`fromStage === toStage`) returns `[]`;
       **(Rule 2)** a non-null `fromStage` into `offer` returns exactly two events in the documented
       order, both parsing against their own schemas and sharing one `application_id` and `job_id`, with
       the second carrying `stage: "offer"` — red if the fan-out is dropped, reordered, or given
       mismatched ids;
       every other non-null transition returns exactly one `application_stage_changed` — red if
       `offer_made` leaks onto another stage;
       **(AC 1, emission half)** a full walk — the first four events built directly, then the fifth and
       sixth produced by one `eventsForStageTransition` call for a **non-entry transition into
       `offer`**, all pushed through `captureAnalyticsEvent` into a recording sink — records names
       exactly equal to `ANALYTICS_EVENT_NAMES`, and **every recorded property value is a uuid or a
       member of one of the three closed vocabularies** (red if any free-text property is ever
       introduced — AC 4, end to end, through the real code path rather than against a schema). The
       transition must target `offer` specifically: Rule 2 is what makes one call yield both remaining
       events, so any other target produces five names and the check could never go green;
       **(AC 5)** a walk abandoned after `resume_uploaded` records exactly the first three of
       `ANALYTICS_EVENT_NAMES`, all valid, and **the two of those that carry a draft id —
       `application_started` and `resume_uploaded` — share one**, while `job_viewed` is recorded
       carrying none. The clause is split deliberately: §3.3 gives `job_viewed` no draft-id property at
       all, so "all three valid" and "all three sharing a draft id" cannot both hold, and an earlier
       draft asserted both. Red if a pre-submit event gains a dependency on submit-time data, and red
       if the draft id stops joining the two events it exists to join.

5. [ ] **README decision entry and this spec** — a new **Analytics** section in `README.md`, placed
       after **Database**, recording only the **decisions** and linking this document for the detail:
       the naming convention and its formal rule; the six event names; the uuid/closed-enum rule and
       its consequence that no candidate name, email or résumé text is representable; that
       `candidate_id` is deliberately never sent; the sink seam and that PostHog itself is AI-27's; and
       the warning that renaming an event is not retroactive. It does **not** restate the per-event
       property table — that lives here, and duplicating it into a file with a different update cadence
       is how a README goes stale. Edit, do not append.
       **DoD:** `pnpm check` green — which includes `prettier --check .` over the README and this
       document, the check AI-34 went red on in harden round 2; the README section names all six events
       and states the one-way-door warning, and contains no per-event property table;
       **(regression guard)** `bash .claude/skills/pre-deploy/scripts/check-env.sh` prints no `WARN:`
       line. Green by construction because this ticket adds no env key; red if one leaks in, which is
       the concrete way AI-27's ownership of `NEXT_PUBLIC_POSTHOG_KEY` gets quietly taken over here.

---

## 6. Assumptions / decisions log

### Harden round 1 — disposition of every finding

| #   | Finding                                                                  | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[BLOCKER]** entry transition double-emits with `application_submitted` | **Adopted, and taken further than proposed.** Re-verified independently (§2): the seed's `step === 0 ? null : …` branch, all thirteen `PATH_LIBRARY` shapes starting at `applied`, the `NewApplicationStageTransition` JSDoc, and the `from_stage IS NULL OR from_stage <> to_stage` constraint. Resolved as §3.2 Rule 1 — the entry transition emits **nothing** — and enforced **twice**: `eventsForStageTransition` returns `[]`, _and_ `from_stage` becomes required and non-nullable so a hand-built entry event fails to parse. The critique offered "return `[]` **or** document the double-count"; the double-count option was rejected because it would pin step-4-to-step-5 conversion at a permanent 100% and make the bottom half of the funnel unmeasurable. Logged as 🟡 #18. |
| 2   | **[BLOCKER]** `actor_role` cannot represent an anonymous job viewer      | **Adopted; the enum gains `visitor`.** §3.3 now defines `actor_role` as established by the **surface**, not by a session, with a four-value vocabulary and a definition per value. Chosen over the offered alternative (optional on `job_viewed`) because a required property with an explicit "not established" value distinguishes "we could not know" from "the call site forgot", because relaxing required→optional later is free while the reverse leaves permanent holes, and because `visitor` stays truthful after auth arrives so no rename is ever needed. The finding also exposed a **false claim in my own §3.3** — that `actor_role` lets the funnel exclude internal traffic — which is corrected in place and added to §7. Logged as 🟡 #19.                               |
| 3   | **[SHOULD]** `AnalyticsSink` sync-vs-async undefined                     | **Adopted, with a stronger resolution than the one offered.** The critique's cheapest fix — declare `=> void`, document that async adapters must catch internally — was rejected: TypeScript silently accepts an `async` function where `=> void` is expected, so it is a rule the type system permits violating, which is the same class of thing as a DoD check that cannot fail. §4 now settles the signature as `(name, properties) => void \| Promise<void>` with `captureAnalyticsEvent` returning `void` and handling **both** a synchronous throw and a rejected thenable. Slice 3 gains an explicit unhandled-rejection DoD case. Logged as 🟡 #20.                                                                                                                                |
| 4   | **[SHOULD]** `FUNNEL_ORDER` duplicates `ANALYTICS_EVENT_NAMES`           | **Adopted, including the simplification it unlocks.** `FUNNEL_ORDER` and its equality test are gone; the catalog is stored once, ordered, in `events.ts`. With the constant gone the fourth module held a single derivation, so it is gone too — `eventsForStageTransition` moves beside the catalog it derives from. §4 is down to three modules and the slice count is unchanged. Logged as 🟡 #21.                                                                                                                                                                                                                                                                                                                                                                                       |
| 5   | **[SHOULD]** the promised `(regression guard)` marker appears nowhere    | **Adopted.** This is MEMORY's `vacuous-checks-in-dods` failure mode landing on my own honesty device, which makes it worse than an ordinary miss, not better. All four items the critique identified now carry the marker _and_ the specific edit that would make them fail: the schema-map key-set check (red if the `Record` type is widened), the `grep`/`git diff` seam checks (red if the PostHog dependency is taken here instead of in AI-27), and `check-env.sh` (red if an env key leaks in). §5's preamble now also states that an item with neither a present failure mode nor the marker does not belong in a DoD.                                                                                                                                                              |
| 6   | **[SHOULD]** repeated `offer_made` on re-offer is not in Risks           | **Adopted.** Verified the premise: `offer` is non-terminal, and the only constraint on transitions is `from <> to`, so `offer → rejected → offer` is legal even though no seeded path exercises it. Added to §7 as a distinct bullet from the funnel-over-both-names double count, with the mitigation the critique named — dedupe by `application_id` at query time. §2 also now records that nothing prevents leaving a terminal stage.                                                                                                                                                                                                                                                                                                                                                   |
| 7   | **[NIT]** slices 1–2 below design altitude                               | **Adopted; pure deletion, as proposed.** Export identifiers, the literal refinement expression and the exact fixture strings are cut from slices 1–2; the DoDs now pin observable behaviour ("each uuid property's schema rejects a personal name…"). §5 gains a one-line statement of where the altitude line sits: event names, property names, types and required/optional are contract and stay; everything below that is the implementer's. `eventsForStageTransition` is the one identifier kept, because both §3.2 rules attach to it and the critique referenced it by name approvingly.                                                                                                                                                                                            |
| 8   | **[NIT]** README slice restates the property contract and will drift     | **Adopted.** Slice 5 now records only the decisions — convention and formal rule, the six names, the uuid/closed-enum PII rule, the never-`candidate_id` rule, the sink seam, the rename one-way door — and links this document for the per-event table. The DoD gained a negative check: the section contains no per-event property table. This is CLAUDE.md's "record the reason, not the event" applied to my own draft.                                                                                                                                                                                                                                                                                                                                                                 |

### Harden round 2 — disposition of every finding

| #   | Finding                                                                                                 | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **[SHOULD]** server-created applications have no draft id, and the spec never decides whether they emit | **Adopted — the first of the two offered options.** Re-verified `applications.source` is `notNull().default("careers_site")` with `import`/`agency`/`email` in the enum. §3.4 now states the rule: `application_submitted` fires **only on a candidate-initiated browser submit**; a server-created application emits nothing until its first real stage change. Chose this over "draft id optional on `application_submitted`" for the same reason Rule 1 exists — a bulk import never viewed, started or uploaded, so counting it as a submit would push `resume_uploaded` → `application_submitted` conversion above 100%. One correction to the finding's own wording: the discriminator is **how the row was created, not its `source` value** — a LinkedIn click-through that fills in the form is a browser submit carrying `source: linkedin` and does emit. §7 carries the undercount, as required. Logged as 🟡 #22. |
| 2   | **[SHOULD]** the two id properties have no stated cardinality and no test                               | **Adopted.** The §3.3 per-event table now has explicit `application_draft_id` and `application_id` columns for all six events, plus a legend stating that `—` means absent-from-schema and therefore rejected. Slice 2's AC 3 DoD now pins both ids **positively and negatively across all six** — the existing reject-`application_id` case was indeed only the negative half, and on only two of the six. The critique's sharp version is correct and is now quoted in the DoD itself: `application_draft_id` was the one property AC 5's structural claim rests on and the one property no DoD pinned.                                                                                                                                                                                                                                                                                                                      |
| 3   | **[NIT]** §1.2's "the five where an application exists" contradicts §3.3                                | **Adopted.** Reworded to "the five other than `job_viewed`", matching §3.3 and slice 2. The old phrasing was self-contradicting: `application_started` and `resume_uploaded` fire before any `applications` row, which is the whole §3.4 argument. The same row now also names the id properties.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 4   | **[NIT]** 🟡 #16's rationale is factually wrong (jsdom, not Node)                                       | **Adopted, and applied in two places rather than one.** The critique caught the rationale in 🟡 #16; the identical error was also in §7's land-mine bullet, where it mattered more, and I fixed both. Corrected reason: the runtime import is free **in a test** because it never reaches the client bundle — not because the environment is Node. `apps/web` vitest runs jsdom (`vitest.config.mts`), and the DoD it justifies is unchanged and achievable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 5   | **[NIT]** slice 3's `'**/package.json'` pathspec is dead weight                                         | **Adopted.** Measured it independently: with the root manifest dirty, `git diff --name-only origin/main -- '**/package.json'` printed **nothing**, while the literal `'package.json'` and `:(glob)**/package.json` each printed one path — git's `**/` does not match at depth 0, so the check was blind to precisely the manifest a root-level `posthog` dependency would land in. Restated the DoD as **behaviour** ("no PostHog dependency in any workspace manifest or the lockfile…") and left the command to the implementer, which is the better altitude anyway. This is `vacuous-checks-in-dods` for the third round running, now in a command I wrote myself.                                                                                                                                                                                                                                                        |

### Harden round 3 — disposition of every finding

| #   | Finding                                                                             | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[SHOULD]** slice 4's AC 5 DoD cannot pass — `job_viewed` carries no draft id      | **Adopted, as proposed, and it exposed a second instance beside it.** The clause is now split: the two events that carry a draft id share one, `job_viewed` is recorded carrying none. I did not reconcile it by giving `job_viewed` a draft id, which would have contradicted slice 2. **The audit this triggered found a second unpassable item in the same slice:** the AC 1 walk said the stage change comes from "a non-entry transition", but Rule 2 only yields two events when the target is `offer` — any other target produces five names against a six-name assertion, so that check could not go green either. It now specifies a non-entry transition **into `offer`** and says why. Both were the inverse of the vacuous check: red in every world. |
| 2   | **[NIT]** §3.3's reason for `source` optional on `job_viewed` does not discriminate | **Adopted.** The old reason ("no application exists yet") is equally true of `application_started` and `resume_uploaded` — the same confusion round 2 corrected in §1.2, so the critique is right that the next reader would re-derive it. Restated on **commitment**: from `application_started` onward the flow has committed to creating an application that will carry a `source`, so the value is determined though the row is unwritten; a job view carries no such commitment and most views never become an application.                                                                                                                                                                                                                                  |
| 3   | **[NIT]** no `direct`/`unknown` source, so funnel denominators differ at step 1     | **Adopted as a Risk; the tempting fix declined with a reason.** New §7 bullet in the same register as the offer double-count and the submit undercount. Declined: adding `direct`/`unknown`. That means an `ALTER TYPE` on a database enum — which AI-34 §7 records cannot run inside a transaction — to serve an analytics concern, and this ticket has no mandate to change the domain vocabulary. The bullet states the constraint for whoever does: it must be added to `applicationSource` and inherited, never declared as an analytics-only value, because two vocabularies that disagree is worse than one that is incomplete.                                                                                                                            |
| 4   | **[NIT]** `check-env.sh` exits 1 here for reasons unrelated to this ticket          | **Adopted.** Re-measured: it prints `FAIL: unset or empty: NEXT_PUBLIC_APP_URL DATABASE_URL DIRECT_DATABASE_URL` and exits 1 because no `.env.local` exists in this worktree, while emitting no `WARN:` line. §2 now records both branches and states explicitly that slice 5's guard is the `WARN:` line only, so a red exit is not a failed DoD. This is CLAUDE.md's own worked example of establishing a fact before offering an option.                                                                                                                                                                                                                                                                                                                       |

**Whole-plan re-audit, prompted by finding 1.** Every DoD item in §5 was re-read against **both**
failure directions — can it go green, and can it go red? Two items could only go red (finding 1 and the
AC 1 walk beside it); both are fixed above. No item was found that could only go green: the four that
cannot fail today carry the `(regression guard)` marker and their specific triggering edit. Three
consecutive rounds have now surfaced a check that reads like coverage and provides none, twice in
checks written while explicitly guarding against it — the DoDs are consequently stated as **behaviour**
rather than as commands wherever a command was the source of the error.

### Harden round 4 — disposition of every finding (verdict: APPROVED, nits only)

| #   | Finding                                                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[NIT]** no dev-vs-production separation recorded, and AC 1 makes the pollution immediate | **Adopted, as proposed.** New §7 bullet placed beside the three AI-27 obligations already there (disable autocapture, never `identify()`, reverse proxy), because §7 is where that handoff is collected. The critique is right that AC 1's "walked on localhost" makes this the _first_ thing anyone does with the catalog, and right that it is the un-rewritable class the same section already names — a property never sent cannot be backfilled. The bullet states explicitly that this **does not reverse 🟡 #10**: environment stays out of the catalog and belongs in the client's `register()`; this is the obligation that decision implies, not a reversal of it. |
| 2   | **[NIT]** slice 3's unknown-`name` path bypasses the schema map and no DoD covers it       | **Adopted, as proposed.** Slice 3's DoD gains a fourth case, stated as behaviour: an event whose name is outside the catalog never reaches the sink, logs once, and does not throw — red if the schema lookup is written unguarded. The critique identified the real gap precisely: the three existing cases exercise a bad value and a bad sink, and none exercises the **lookup**, which is where "never throws" actually breaks. §1.4's argument that this catalog outlives its callers is what makes an unlisted name realistic rather than defensive.                                                                                                                   |

**Both-directions check applied to the one new DoD item**, per the round-3 audit: an unlisted name can
go green (guarded lookup drops and logs) and can go red (unguarded lookup throws, or the event reaches
the sink). It is a check, not a marker.

### 🟢 Settled by the ticket, CLAUDE.md, the repo or a verified measurement

- **Six events, named by the ticket's own prose**, and a documented naming convention: ticket Scope IN.
- **`object_action`, past tense**: AC 2 states the convention; this document only formalises and
  enforces it.
- **Properties for job id, source, stage and actor role**: ticket Scope IN, AC 3.
- **No dashboards, no session recording, no personal identification of candidates, no gap audit**:
  ticket Scope OUT (AI-63, AI-46).
- **Framework-free code lives in `apps/web/src/lib/`, no barrel file, JSDoc on every export there,
  kebab-case files, tests co-located**: CLAUDE.md.
- **Not a package**: CLAUDE.md — extract on a second consumer, and there is one.
- **The source and stage vocabularies come from `packages/db`**, not from a hand-written list: AI-34
  made `application_source` and `pipeline_stages` the single source of truth, and `apps/web` already
  imports both by package name.
- **No authentication exists and no ticket owns one**: `apps/web/src/app/api/CLAUDE.md` records it as a
  fact, not a convention, and explicitly says not to read it as settled or to invent a scheme.
- **`pnpm check` is the gate**, and `console.error` is the only console verb the drop path may use:
  measured against `check-console.sh`.

### 🟡 My judgment calls — proceeding; challenge these in review

1. **AI-45 ships the contract and zero call sites; no apply-flow UI is built.** Full argument in §1.4.
   Rejected: building a minimal apply flow (six throwaway surfaces spanning Days 18 and 22, and a
   résumé-storage decision this ticket has no mandate to open) and wiring the "surfaces that exist"
   (there are none — a `job_viewed` per `JobCard` would record impressions as views, on a name that
   cannot be renamed afterwards).
2. **The sink is an explicit parameter, and this ticket adds no PostHog dependency and no env key.**
   §4. Rejected: taking `posthog-js` directly here (does AI-27's job, double-owns
   `NEXT_PUBLIC_POSTHOG_KEY`, and forces a PostHog mock into every test) and a module-level
   `setAnalyticsSink` singleton (module state is shared across concurrent server requests).
3. **`application_stage_changed`, not `stage_changed`.** §3.2. The only name in the catalog whose
   object would otherwise be unidentifiable from the name alone.
4. **`offer_made` fans out _in addition to_ `application_stage_changed`, always in that order, and is
   emitted by a function rather than documented as a rule.** §3.2 Rule 2. Rejected: replacing the
   stage-change event at `offer` (a hole in AI-46's audit) and deriving `offer_made` at query time
   (contradicts AC 1's six events).
5. **`application_draft_id`, minted in the browser, keys the pre-submit half of the funnel; only
   `application_submitted` carries both ids.** §3.4. This is what makes AC 5 structurally true rather
   than aspirational, and `application_started`/`resume_uploaded` reject `application_id` so it stays
   that way. The cost is that the call site must keep the draft id across a reload.
6. **`source` is optional on `job_viewed` and required everywhere else.** An application source is a
   property of an application; optional rather than absent so a `?src=…` careers link can attribute
   top-of-funnel.
7. **`stage` means "the stage as of this event" on every event that has one; `from_stage` is the
   extra.** One breakdown works across the whole funnel. Rejected: `to_stage`/`from_stage` on the
   change event only, which would make `stage` mean two different things.
8. **`offer_made.stage` is the literal `"offer"`.** Redundant by construction, which is the point: any
   other stage becomes a type error and a failed parse.
9. **`application_submitted.stage` is the general stage enum, not the literal `"applied"`.** A referred
   candidate could legitimately enter at `screening`; hard-coding the entry point would be a product
   assumption this ticket has no basis for.
10. **No `app_environment`, no timestamp, no `distinct_id` property on any event.** PostHog stamps
    every event with a timestamp and a distinct id, and global context belongs in the client's
    `register()` — AI-27's one line, not a property on six schemas that no call site would set.
11. **The PII deny-list over property _names_ lives in the test file, not in `properties.ts`.** Its
    only caller is the test, and CLAUDE.md keeps code with one caller inside that caller. The rule
    itself is documented in the README and in the catalog's JSDoc.
12. **No test asserting the README mentions every catalog entry.** It would need an `fs` read climbing
    five directories out of `apps/web` into the repo root from a jsdom test, and slice 2's
    "exactly six names" assertion already forces the same review moment. Reinstate it if the reviewer
    disagrees.
13. **No verification script (`pnpm analytics:verify`) that walks the funnel to a console sink.** It was
    planned and cut: without AI-27's client it can only print to a console, which is what slice 4's
    walk test already asserts more precisely, and it would need `tsx` added to `apps/web` and a new
    `scripts/` directory for one file. When AI-27 lands it can add one if a live smoke test is wanted.
14. **No folder `CLAUDE.md` under `src/lib/`.** AI-40 settled which folders carry one.
15. **No namespace prefix on event names**, and the irregular past-tense allow-list holds exactly
    `made`. §3.1.
16. **The database-derived vocabularies use type-only imports plus `satisfies`, with set-equality
    asserted in a test** — rather than a runtime `z.enum(applicationSource.enumValues)`. Measured:
    the type-only form is erased, so no client bundle pulls in `drizzle-orm/pg-core` when the first
    Client Component emits an event. The drift the runtime form would have prevented is caught by the
    test instead, where the runtime import is free. The point is that the import never reaches the
    client bundle — not that the test environment is Node: `apps/web` vitest runs jsdom, and a test
    importing these modules at runtime under jsdom passes.
17. **`captureAnalyticsEvent` validates and drops rather than throwing.** An analytics bug must never
    take down a render. The cost is a silently missing event, mitigated by the `console.error` and by
    the fact that every call site is type-checked before it can reach the drop path.
18. **The entry transition (`from_stage = null`) emits no analytics event; `application_submitted` is
    the entry event** (round 1, finding 1). §3.2 Rule 1. Enforced in both the function and the schema.
    The accepted cost is that the transition log and the event stream are deliberately not one-to-one —
    one fewer event than rows, per application — which §7 records so AI-46 does not read it as a gap.
19. **`actor_role` is established by the surface, and the vocabulary is `visitor | candidate |
recruiter | system`** (round 1, finding 2). §3.3. `candidate` has **no producer today** and is
    shipped anyway, because adding a value to a vocabulary later is cheap and the four values are the
    natural complete partition of "who is acting" that AI-46 and AI-63 should see. Cut `candidate` if
    the reviewer prefers strict no-unused-value discipline; it costs one edit when auth lands.
20. **`AnalyticsSink` returns `void | Promise<void>`; `captureAnalyticsEvent` returns `void` and
    handles both a synchronous throw and a rejected promise** (round 1, finding 3). §4. This is the
    public contract AI-27 and AI-112 code against, settled now because changing it afterwards is a
    breaking change to both.
21. **The catalog is stored once and is ordered; there is no separate funnel-order constant, and no
    fourth module** (round 1, finding 4). §4.
22. **`application_submitted` fires only on a candidate-initiated browser submit; server-created
    applications emit nothing until their first real stage change** (round 2, finding 1). §3.4. This is
    what keeps `application_draft_id` **required** rather than optional, which in turn is what makes
    AC 5's join structural. Rejected: an optional draft id, which would let a bulk import count as a
    submit and push the upload→submit conversion above 100%. The accepted cost is that submit counts do
    not reconcile with application rows — §7. Reversible: making the draft id optional later is a
    one-property change, and it is the direction that stays cheap.

### 🔴 Escalations — surfaced, defaults now shipping

Neither blocks any slice: this ticket sends no event anywhere, so no door is crossed by merging it.
Both remain open for the human, and both must be answered **before AI-27 wires a live sink**, which is
the moment the doors actually close.

1. **May domain identifiers be sent to a third-party analytics processor, and will the hosted data ever
   be real?**
   The funnel needs `application_id` on the post-submit events — without it, a candidate-side submit
   and a recruiter-side offer sit under different PostHog distinct ids and cannot be joined, and
   stage-to-stage conversion becomes unmeasurable. But `application_id` and `job_id` are pseudonymous
   keys that join back to `candidates.full_name`, `candidates.email` and `candidates.resume_text`
   through our own database. This is the same unanswered question AI-34 left open in its 🔴 #1 — _will
   the hosted Supabase project ever hold real candidate data, or synthetic training data only?_ — and
   it is unanswered still. If the answer is "real", then events already in PostHog become in-scope for
   an erasure request, and PostHog becomes a processor needing an agreement.
   **Status: surfaced to the user; no answer yet. The stated default is now the shipped position** —
   send `job_id` and `application_id`; **never send `candidate_id`**; never derive PostHog's
   `distinct_id`, `identify()` or `$set` from any domain identity, anonymous person profiles only.
   Those three prohibitions are the ticket's own Scope OUT ("identifying candidates personally") read
   literally, and they cost the funnel nothing. The `candidate_id` prohibition is recorded in the
   README (slice 5) so it survives this document.
   **Why it is a real door:** an event name and its properties are stored per row and are not
   retroactively editable; a property removed later stays in history.
   **Reversal cost:** while no event has ever been sent — which is the case for as long as AI-27 is
   unwired — reversing to "no domain ids at all" is deleting two properties from `events.ts` and the
   funnel degrades to per-distinct-id only. After the first live emit it is a data-deletion request
   plus a permanent split in every historical query. Cheap now, expensive later, and the gap between
   those two costs is exactly why this is surfaced rather than assumed.

2. **AI-27 is a stated dependency, is Todo with zero code, and nobody owns "wire the events to
   PostHog". AC 1 cannot be met by this ticket or by AI-27 alone.**
   Provisioning a PostHog cloud project and a project API key needs the account holder — an engineer
   cannot do it. And AI-27's scope as recorded (cloud project, browser client init, env keys,
   read-scoped personal API key) does not include an `AnalyticsSink` adapter, and no issue owns the six
   apply-flow surfaces.
   **Status: surfaced to the user; no answer yet.** Per the coordinator, the sink adapter is **not**
   added to this ticket, and **AC 1 is explicitly deferred**: this PR claims AC 2–5 and the emission
   half of AC 1 only, and must not be judged against "appear in PostHog".
   **Still open for the human:** who owns the sink adapter — extending AI-27's scope by one function is
   the cheapest option — and the fact that AI-46's gap audit will run against a catalog with **zero
   live events**, which is a real input to how that ticket is written. **I cannot file the follow-up**
   — no Linear tool is available in this session — so this needs a human either way.

---

## 7. Risks / land-mines

- **Event names _and their value vocabularies_ are a one-way door.** PostHog stores the name on every
  captured row; a rename does not rewrite history, so it splits a funnel in two and every
  AI-63-generated dashboard has to union both spellings forever. The same is true of an `actor_role`
  or `source` value that has already been emitted with one meaning and is later given another — which
  is why §3.3 defines each role by the surface that produces it rather than leaving it to the first
  call site. **The last safe moment to change any name or any value meaning in §3.2–3.3 is before
  AI-27 wires a live sink and the first real event lands.**
- **PostHog autocapture and session recording can violate AC 4 from entirely outside this catalog.**
  `posthog-js` with default options captures `$autocapture` events carrying element text and, with
  recording enabled, replays DOM input. Pointed at an apply form, that captures the candidate's name,
  email and résumé filename — none of which passes through `captureAnalyticsEvent` and none of which
  our strict schemas can stop. **AI-27 must disable autocapture and session recording, or mask inputs,
  and session recording is already this ticket's Scope OUT.** This is the single largest hole in AC 4
  and it is not closable from here.
- **`posthog.identify()` would collapse the whole guarantee.** One `identify(candidate.email)` in
  AI-27's init makes every event in this catalog personally identifying regardless of its properties.
  Recorded as a hard requirement in 🔴 #1.
- **AI-27 must separate development from production traffic before the first live emit.** AC 1
  specifies a flow walked on **localhost**, so the very first use of this catalog pushes local events
  into the same project AI-63 later builds dashboards from — and with nothing on the row to filter
  them, every subsequent funnel silently includes developers walking the flow. This is the same
  un-rewritable class §7 already names: a property that was never sent cannot be backfilled, so rows
  captured before the split stay indistinguishable forever. The fix is AI-27's and is one of two
  one-line choices — a `register()` super-property carrying the environment, or a separate PostHog
  project for development. **This does not reverse 🟡 #10**, which keeps environment out of the
  _catalog_: global context belongs to the client's `register()`, not to six event schemas. It is the
  handoff obligation that decision implies, and it is recorded here because §7 is where AI-27's
  obligations are collected.
- **Until an authenticated surface exists, `actor_role` is constant `visitor` on the whole
  candidate-side funnel**, so internal recruiter previews of a job page are counted as candidate
  traffic and the top of the funnel overstates interest. `candidate` has no producer at all. This is a
  correction to an earlier claim in this spec, not a new limitation: `actor_role` becomes useful for
  excluding internal traffic only when auth lands.
- **The transition log and the event stream are deliberately not one-to-one.** Rule 1 means every
  application has one more `application_stage_transitions` row than it has
  `application_stage_changed` events. A consumer reconciling the two — AI-46's gap audit especially —
  will find that difference and must not read it as instrumentation drift.
- **No source value means "unknown", so a source-split funnel changes denominator at step 1.**
  `applicationSource.enumValues` has no `direct` and no `unknown` (§2). A candidate who arrives
  organically and reaches the form must be emitted as something, and `careers_site` is the only
  honest-ish fit — so organic traffic is silently folded in with deliberate careers-page traffic. The
  same journey's `job_viewed` legitimately omits `source` entirely. The consequence for AI-63: splitting
  the funnel by source compares a step-1 population that can be source-less against steps 2–6 where
  every event has a source, and `careers_site` is inflated by however much organic arrival there is.
  Deliberately **not** fixed here: adding `direct`/`unknown` means an `ALTER TYPE` on a database enum
  (AI-34 §7 records that it cannot run inside a transaction) to serve an analytics concern, which is
  scope this ticket does not have. If it is ever added, it must be added to `applicationSource` and
  inherited here, never declared as an analytics-only value — two vocabularies that disagree is worse
  than one that is incomplete.

- **Submit counts undercount applications, by design.** 🟡 #22 means an application created by import,
  agency feed or emailed CV never emits `application_submitted`, so `count(application_submitted)` is
  strictly less than `count(applications)` and the gap is whatever share of intake is not
  candidate-initiated. Two consequences worth stating: the funnel's bottom step measures _candidate
  journeys_, not applications, and AI-46 will find `application_stage_changed` events whose
  `application_id` has no `application_submitted` ancestor — which is expected, not a gap. Anyone
  wanting true application volume should count rows, not events.

- **A rescinded-and-reissued offer emits `offer_made` twice.** `offer` is non-terminal and the only
  constraint on transitions is `from <> to`, so `offer → rejected → offer` is legal; no seeded path
  exercises it, but AI-112 can write it. An offer count is therefore a _transition_ count, not an
  application count. Dedupe by `application_id` at query time — and note this is a different hazard
  from the next bullet.
- **Double counting at the offer step.** A funnel defined over both `application_stage_changed` and
  `offer_made` counts the offer twice, because Rule 2 emits both for one act. The fan-out is required
  by AC 1's six events; the mitigation is documentation, and AI-63's generated dashboards should pick
  one.
- **Adding a pipeline stage or an application source silently widens the analytics vocabulary.** Slice
  1's set-equality test forces the analytics list to be updated in the same PR, but nothing tells
  AI-63's existing charts that a new stage exists. Reviewer checklist item: a change to
  `PIPELINE_STAGE_SEED` or `applicationSource` is a change to the funnel.
- **`application_draft_id` must survive a reload.** If the first call site regenerates it per render or
  per page, `application_started` and `application_submitted` will not join, and AC 5's partial funnel
  becomes unmeasurable in exactly the case it exists for. Session-scoped storage, keyed per job.
- **An async sink that swallows its own errors will look healthy while dropping every event.**
  `captureAnalyticsEvent` guarantees a rejection cannot escape; it cannot guarantee delivery. AI-27's
  adapter should surface its own transport failures rather than relying on this choke point.
- **Client clock skew and batching can invert "in order" in PostHog** even when emission order is
  correct. Slice 4's walk test asserts our order, not PostHog's. Anything AI-46 or AI-63 does with
  strict ordering should sort on server-side ingestion time, not the client timestamp.
- **Ad blockers block PostHog's default host**, which undercounts precisely the top of the funnel
  (`job_viewed`, `application_started`) relative to the bottom (server-emitted stage changes), making
  conversion look better than it is. A reverse proxy is the fix and it is AI-27's decision.
- **Nothing in `pnpm check` can detect that the catalog has drifted from its call sites**, because
  there are none. Until the surfaces in §3.5 ship, the only guard against a wrong property at a future
  call site is the type system at that call site.
- **A Client Component importing `properties.ts` must not pull `drizzle-orm/pg-core` into the browser
  bundle.** The type-only-import-plus-`satisfies` design (🟡 #16) is what prevents it; a well-meaning
  future edit to a runtime `z.enum(applicationSource.enumValues)` would reintroduce it, and would do so
  silently, because a test importing the vocabularies at runtime passes either way — the tests prove
  set-equality, not bundle shape.
- **Unknown-key rejection rejects rather than strips.** A call site that passes an extra property gets
  a dropped event and a `console.error`, not a trimmed one. That is the intended behaviour for AC 4,
  but it means a sloppy call site loses data rather than degrading — worth knowing when the first one
  is written.
