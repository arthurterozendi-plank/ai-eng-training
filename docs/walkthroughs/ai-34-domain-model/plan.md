# AI-34 — the executed plan

This is the plan **as carried out**, not the aspirational one. The approved spec is
[`docs/specs/ai-34-domain-model.md`](../../specs/ai-34-domain-model.md); this file records what
each of its eight slices actually produced, which decisions survived contact with an
implementation and a live database, and which ones changed.

- **Branch:** `feat/ai-34-domain-model`, based on `origin/main`, 11 commits.
- **Ticket:** AI-34 — "Model jobs, candidates and applications in Postgres for recruiters
  tracking a pipeline" (parent AI-8 / Day 3).
- **Depends on:** AI-26 (Postgres provisioning) — still Todo.
- **Blocks:** AI-43 (Postgres-over-MCP), AI-45 (PostHog funnel events), AI-63 (NL-to-dashboard),
  AI-107 (resume-to-candidate extraction), AI-112 (store approved applications + notify).
- **Hard constraint throughout:** no live database was available during development. Every
  slice's Definition of Done was checkable with `pnpm check`, offline `drizzle-kit` commands that
  never open a connection, and file inspection.

---

## Acceptance criteria, and how each one was met

| AC                                                                              | Met by                                                                                                                                                                         | Verified                                                                                                                                                                    |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Enough realistic data for a dashboard and a RAG corpus                       | `buildSeedDataset({ now })`: 8 jobs, 60 candidates, 90 applications, 293 transitions, 40 interviews, 120 notes, 12 extraction payloads, ~73k characters of hand-authored prose | `seed-data.test.ts` asserts counts, funnel reach, prose volume and per-row `createInsertSchema` parsing; applied to a live Postgres 17 container in all three review rounds |
| 2. An application belongs to exactly one job and one candidate, schema-enforced | Two `NOT NULL` scalar FKs on `applications`, plus `UNIQUE (job_id, candidate_id)`                                                                                              | `getTableConfig(applications)` assertions offline; `DELETE FROM jobs` refused live                                                                                          |
| 3. Stage transitions recorded with a timestamp                                  | `application_stage_transitions` — the seventh table, required by this AC                                                                                                       | Chain/ordering assertions in the seed test; the spec's `lead()` time-in-stage query run live with 0 mismatches                                                              |
| 4. Application rows carry per-field confidence                                  | `applications.extraction` as a versioned `jsonb` envelope, guarded by `extractionPayloadSchema` **and** a `jsonb_exists` CHECK                                                 | Schema unit tests; the CHECK rejects `{"nope":1}` live; 12 seeded payloads spanning both sides of a 0.6 threshold                                                           |
| 5. Types inferred from the schema                                               | Every entity type is `typeof <table>.$inferSelect` / `$inferInsert`, co-located with its table; `src/types/index.ts` untouched                                                 | Typecheck; no hand-written row type exists anywhere in the diff                                                                                                             |
| 6. Deleting a job with applications is refused, not cascaded                    | `ON DELETE RESTRICT` on `applications.job_id` — and, beyond the AC, on `candidate_id` too                                                                                      | `foreignKeys` assertions offline; FK violation raised live on both                                                                                                          |

---

## The slices, as executed

Each slice is one commit. Every one landed as planned; deviations are called out.

### Slice 1 — Tooling and env plumbing · `30535e0`

Added `drizzle-orm@^0.45.2` as a dependency and `drizzle-kit`, `drizzle-zod`, `postgres`, `tsx`
as devDependencies, under the rule that decided it: **imported from `src/` ⇒ dependency; imported
only from `scripts/` or a test ⇒ devDependency**. Added a credential-less `drizzle.config.ts`, the
five `db:*` scripts, `drizzle/` in `.prettierignore`, the two Postgres URLs in `serverSchema` and
`.env.example`, and `src/env.test.ts`.

- **`src/env.ts` moved to per-key lazy getters.** Required, not cosmetic: with the previous single
  getter, a required `DATABASE_URL` would have broken `env.NODE_ENV` — and the existing status-route
  test — everywhere the URL is absent.
- **Deviation from the written slice:** the config-parses-without-credentials proof moved to
  slice 2. Harden round 1 measured that an empty schema glob makes `drizzle-kit export`/`generate`
  exit **1**, not 0, so the proof needs schema files to exist.
- **Discovered during implementation:** the schema glob had to become `!(*.test).ts`. drizzle-kit
  `require()`s every matched file, and a co-located test file's top-level `vitest` import made it
  emit **no SQL at all while still exiting 0** — a silent failure the plan had not anticipated.

### Slice 2 — Enums, `pipeline_stages`, `jobs`, `candidates` · `ad704e7`

Six enums, the stage lookup table with its `PIPELINE_STAGE_SEED` `as const` constant and derived
`PipelineStageKey` union, and the two root entities. `.enableRLS()` on each — moved here from
slice 6 by harden round 3, which correctly called that a slicing defect rather than a nit.

`pipeline_stages.position` deliberately carries **no** `unique()`, and a test asserts
`getTableConfig(pipelineStages).uniqueConstraints` contains no entry for it, so drizzle can never
start emitting a non-deferrable constraint alongside the migration's deferrable one.

### Slice 3 — `applications` + `application_stage_transitions` · `c32c343`

The core of the ticket. Both `RESTRICT` FKs, the unique `(job_id, candidate_id)` pair, the
`jsonb` extraction column with its envelope CHECK and GIN index, `src/lib/db/extraction.ts` with
`extractionPayloadSchema`, and the transitions table with its `from_stage <> to_stage` check.

The CHECK uses `jsonb_exists(...)` rather than the `?` operator, which collides with query
placeholders in several clients and tools.

**Cut before implementation:** harden round 1 removed the planned `stage-transition.ts` helper
module. It had no caller in this ticket — the seed builds its own transitions — and the
"one transaction, one write path" rule it encoded survives as a requirement for AI-112 instead.

### Slice 4 — `interviews` + `notes` · `b4aa051`

`notes` attaches to exactly one parent via three nullable FKs and `num_nonnulls(...) = 1` rather
than a polymorphic column, so the database enforces the invariant instead of the application.
`CASCADE` on all three note FKs, unlike `applications`' `RESTRICT`: a note about a removed parent
is noise, not lost history. `interviews` hangs off the application, not the candidate.

### Slice 5 — Relations · `1a422d3`

All `relations()` declarations in one module. The FK graph is cyclic and `relations()` needs the
referenced table as a _value_ at import time, so the per-table layout CLAUDE.md would otherwise
imply creates two-way import cycles.

### Slice 6 — Migrations · `6c85aaf`

`0000_loud_morg.sql` is generated DDL — this slice edited no schema file. `0001` is hand-written
and carries the three things drizzle cannot express: the seven `pipeline_stages` rows
(`ON CONFLICT (key) DO NOTHING`), `UNIQUE (position) DEFERRABLE INITIALLY IMMEDIATE`, and
`set_updated_at()` plus one `BEFORE UPDATE` trigger per table with the column.

`migrations.test.ts` asserts **every field** of every seeded stage row appears in the migration's
insert — tightened from keys-only by harden round 3, because `position` and `is_terminal` are what
the funnel invariant and Day 9's ordering actually read, and hand-written SQL can get them wrong
while a key check passes.

### Slice 7 — The seed dataset · `786875c`

`buildSeedDataset({ now })` is pure and deterministic given `now`, with a small seeded PRNG, no
`Math.random`, no `Date.now()` inside, and no `faker` — lorem prose would make the RAG corpus
worthless, and the corpus is the point of the free-text columns. `now` is a required parameter
with **no default**, so the runner passes the real clock while tests pin an instant.

Two DoD refinements from hardening are load-bearing and were implemented as stated:

- Funnel-reach monotonicity is bounded to **non-terminal** stages (positions 1–4). Unbounded, it
  is unsatisfiable: `rejected`(6) sits above `hired`(5), and any realistic pipeline rejects far
  more people than it hires.
- Every interview is anchored to the stage its `kind` implies — `phone_screen` to `screening`,
  every other kind to `interview` — so a phone screen can legitimately sit on an application still
  in `screening`.

### Slice 8 — Runners, seed guard and docs · `edf870b`

`scripts/db-migrate.ts` and `scripts/db-seed.ts`, both over `DIRECT_DATABASE_URL` (Supabase's
transaction pooler breaks DDL and the migrator's advisory locks), both short-circuiting on
`--dry-run` before importing `@/env` or `postgres`. `src/lib/db/seed-preflight.ts` holds the pure,
connection-free `assertSeedTargetsEmpty(counts)`.

The seed **refuses to run against any populated target table and ships no reset path at all** —
not even an opt-in one. Nothing in `scripts/` can remove a row, so pointing it at the hosted
project cannot destroy data. Local re-seeding is documented as the Supabase CLI's
re-initialisation workflow instead.

Runners live under `scripts/`, not `src/`, because `check-console.sh` fails on `console.log`
anywhere under `src/` and a seed script exists to print progress. Using `console.info` to slip
past that check would have been evasion, not a fix.

### Post-review fixes · `dafb40b`, `fc51b38`

Two commits beyond the eight slices, both closing findings from code review rather than adding
scope. See "Review findings that changed the code" below.

---

## Decisions log — what was decided, and what was rejected

The spec's full log runs to ~29 judgment calls, three harden rounds and one escalation. These are
the ones that shaped the code that shipped.

### The headline decision

**`applications.stage` is a text FK into a seeded `pipeline_stages` lookup table, coexisting with
an `application_stage_transitions` history table.**

- _Chosen because_ order and labels must be queryable data for Day 9's funnel chart, a recruiter
  renaming a stage must not require an `ALTER TYPE`, and the projection column keeps every
  dashboard query single-table while making "every application has a stage" a `NOT NULL` guarantee.
- _Rejected: a pg enum._ Values can never be dropped, `ALTER TYPE … ADD VALUE` cannot run inside a
  transaction, and the ordering would be locked in the type rather than queryable. It is also
  opaque to the Day 5 LLM.
- _Rejected: deriving the current stage from history alone._ A `DISTINCT ON` on every read — and an
  application with no transitions would have no stage at all.

### Other decisions worth recording

| Decision                                                                                                                                             | Rejected alternative                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Per-field confidence as a versioned `jsonb` envelope `{ schemaVersion, model, extractedAt, fields }`, guarded by both zod and a `jsonb_exists` CHECK | Per-field confidence columns — Day 17 will change the shape, and a typed column cannot express a value a reviewer rejected                                                                                                                                               |
| `ON DELETE RESTRICT` on **both** application FKs (AC 6 names only jobs)                                                                              | Cascade; and a "live applications only" rule, which a plain FK cannot express without a trigger or partial constraint                                                                                                                                                    |
| `notes` attaches via three nullable FKs + `num_nonnulls(...) = 1`                                                                                    | A polymorphic `entity_type`/`entity_id` pair — extensible, but with no referential integrity at all                                                                                                                                                                      |
| The seed ships **no** row-removing code path                                                                                                         | A guarded `--reset` flag: a guarded truncate pointed at the hosted project is still a truncate                                                                                                                                                                           |
| `UNIQUE (job_id, candidate_id)` — one row per person per role                                                                                        | Allowing duplicates (two answers to "where does Ada stand for this role"); a partial unique index over non-terminal stages                                                                                                                                               |
| uuid v4 via `gen_random_uuid()` for every primary key                                                                                                | uuid v7 (`uuidv7()` is PG 18-only, so it would need an app-side generator and break database-side defaults); bigserial (sequential ids in URLs and agent payloads leak volume and invite enumeration)                                                                    |
| `timestamptz` everywhere, drizzle `mode: "date"`                                                                                                     | `timestamp without time zone` — the classic silent-corruption bug in a domain where interviews span timezones                                                                                                                                                            |
| An `updated_at` trigger **is** adopted, while a stage-sync trigger is **not**                                                                        | Relying on `.$onUpdate()` — measured to emit no DDL, so it cannot reach the raw `UPDATE`s Days 5/17 will write. The distinction: `set_updated_at()` is a total function of the row with no business semantics; a stage-sync trigger would silently author domain history |
| Explicit snake_case column names                                                                                                                     | drizzle-kit's `casing: "snake_case"`, which must be set identically in config _and_ the runtime `drizzle()` call or runtime SQL silently addresses columns that do not exist                                                                                             |
| Two env keys — `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (direct)                                                                            | One key (a known Supabase trap); a `SUPABASE_*` key set (we talk to Postgres, not to Supabase's REST API)                                                                                                                                                                |
| No soft delete anywhere                                                                                                                              | A `deleted_at` column, which taxes every later query and which Day 5's LLM-written SQL would forget                                                                                                                                                                      |
| `pipeline_stages` rows seeded by a **migration**, not the demo seed                                                                                  | Seeding them with the demo data — they are reference data the `applications.stage` FK makes a precondition for any insert                                                                                                                                                |
| Deterministic hand-authored seed data                                                                                                                | `faker` — its lorem prose would make the RAG corpus worthless                                                                                                                                                                                                            |
| `relations()` included though nothing queries them yet                                                                                               | Dropping them; ~30 declarative lines are the difference between typed `with: {…}` queries and hand-rolled joins in AI-43/AI-63                                                                                                                                           |

### The escalation: RLS posture

Supabase exposes every `public` table through its auto-generated PostgREST API, and with RLS
disabled those tables are readable and writable by anyone holding the project's `anon` key —
which ships to browsers. `candidates` holds names, emails, phone numbers and full resume text.

Surfaced to the user; no answer received. **The stated default became the shipped path:**
`.enableRLS()` on all seven tables with **zero policies**. Deny-by-default closes the hole and
costs the owner role nothing. Verified live: a non-owner role with full GRANTs reads **0**
candidate rows while the owner reads 60.

Two consequences carried forward:

- **AI-43 must connect with service/owner credentials**, not the `anon` or `authenticated` key, or
  it will read zero rows with no obvious cause.
- **Still open for the user:** will the hosted project ever hold _real_ candidate PII? If so, RLS
  stops being optional and retention/erasure needs a decision beyond this ticket's scope.

---

## Review

Three adversarial critique rounds against the spec **before** any code, then three independent
code-review rounds against the branch. Each code review spun up a throwaway Postgres 17 container,
applied both migrations, ran the seed, and probed the claims nothing offline can reach.

### Spec hardening (before implementation)

| Round | Verdict           | What changed                                                                                                                                                |
| ----- | ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | CHANGES_REQUESTED | 1 BLOCKER (undefined seed re-run semantics → resolved by removing the destructive capability entirely, not by guarding it), 5 SHOULDs, 4 NITs — all adopted |
| 2     | CHANGES_REQUESTED | The funnel-reach invariant was unsatisfiable as re-written in round 1; the seed populated no `extraction` at all; interview/stage coherence was unstated    |
| 3     | APPROVED          | Four nits, all adopted — including one the critic called a nit and the author agreed was a slicing defect (`.enableRLS()` scheduled in the wrong slice)     |

### Code review (after implementation)

All three rounds returned **APPROVED with zero blocking findings**. Verified live in at least one
round each:

- `DELETE FROM jobs` and `DELETE FROM candidates` both refused by FK violation
- the extraction envelope CHECK rejects a malformed payload; the GIN index is present
- RLS: non-owner reads 0 candidate rows, owner reads 60
- the seed's re-run guard refuses, names all six populated tables, and exits **1**
- `pnpm db:migrate` is idempotent on a second run
- `pipeline_stages_position_key` is `condeferrable=t, condeferred=f`, and a single-statement
  `CASE` position swap succeeds unaided
- `set_updated_at()` fires correctly despite `SET search_path = ''`
- `db:generate` reports **no drift** between the schema files and the committed `drizzle/`
- both `--dry-run` paths exit 0 with neither `DATABASE_URL` nor `DIRECT_DATABASE_URL` set

### Review findings that changed the code

**Round 1 → `dafb40b`.** Four seed-realism SHOULDs, all fixed: interviews could be dated after the
application already went terminal (a rejection predating the interview that justified it);
applications could predate the job they applied to; `cover_letter` was null on all 90 rows,
leaving the RAG corpus a column short of what the schema advertises; and closed/filled jobs had
applications still moving through them after `closedAt`, contradicting the hand-authored notes
about those jobs. Also pinned `search_path` on `set_updated_at()` and routed directory-crossing
imports through the `@/` alias.

**Round 2 → `fc51b38`.** Sixty invented candidates held addresses at real mail providers — the
first notification feature built on this data would have mailed strangers; they now use a reserved
`.example` domain. High-confidence extraction fields disagreed with the column they model,
inverting the point of AC 4; the extracted email is now derived from the same source as
`candidates.email`, with a test that cross-checks them. No interview was ever scheduled in the
future, leaving that branch dead. And `created_at` was the seed-run instant everywhere, leaving
120 notes with no time signal at all.

**Round 3 → recorded as follow-ups, not fixed.** See below.

---

## Verified

- `pnpm check` green — **110 tests, 17 files** (typecheck, eslint, prettier, vitest).
- `pnpm build` green with no database environment at all.
- `pnpm db:check` and `pnpm db:export` exit 0 with `DATABASE_URL` and `DIRECT_DATABASE_URL` unset.
- `pnpm db:migrate --dry-run` and `pnpm db:seed --dry-run` exit 0 with neither key set.
- Both migrations and the seed applied to a real Postgres 17 container in all three review rounds.

---

## Risks and follow-ups

**Operational — carried by the user:**

- **No live database existed during development.** `pnpm db:migrate` and `pnpm db:seed` are run
  manually. AI-26 (Postgres provisioning) is still open, so AC 1 cannot be _observed_ until it
  lands — offline, we verified the dataset that would be inserted, not the insert.
- **RLS is enabled with zero policies.** AI-43's MCP server must connect with service/owner
  credentials or it reads zero rows with no obvious cause.

**Standing land-mines, recorded in the spec:**

- **Never run drizzle-kit's `push`.** It would not know about the hand-written migration objects —
  the deferrable unique, the `set_updated_at()` triggers, the seeded stage rows — and would offer
  to remove them. The `db:*` scripts deliberately do not expose it.
- **Schema-to-migration drift.** Nothing in `pnpm check` notices a schema edit without a
  regenerated migration. Reviewer checklist item: if `src/lib/db/schema/**` changed, `drizzle/`
  must have changed too.
- **`stage` / transition-log drift.** The projection column can disagree with history if anyone
  updates `applications.stage` outside the single write path. Mitigation today is that no writer
  exists; a trigger is the fallback if that stops being enough.
- **AI-43's runtime client** must pass `prepare: false` to postgres.js (prepared statements do not
  survive Supavisor's transaction mode) and should add `server-only`. Neither is verifiable before
  a live instance exists.

**Seed-realism follow-ups from review round 3 — recorded, not fixed:**

1. `closeOutForJobClosure` only appends `rejected` to a non-terminal path, so closed and filled
   jobs still carry hires their own seeded prose says never happened (UX Researcher: `closed`,
   1 hire; SDR: `filled`, 2 hires).
2. `updated_at` is never seeded, so every row reads as modified today — `created_at` spans 8/35/46
   distinct days for jobs/candidates/applications while `updated_at` spans 1.
3. Interview pools are fixed-size slices that overlap heavily, so 43 interviews land on only 22
   distinct applications and **5 of 12 hires have no interview on file**. The fix is distribution,
   not volume — the ~40-interview target is the approved scale.

None of the three is a code defect or blocks a downstream ticket; each degrades the realism of the
demo corpus in a way a later data pass can correct.
