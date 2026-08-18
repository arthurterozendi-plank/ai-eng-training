# AI-34 — Model jobs, candidates and applications in Postgres

**Linear:** AI-34 · Type: Feature · Parent: AI-8 (Day 3)
**Depends on:** AI-26 (Postgres provisioning — still Todo)
**Blocks:** AI-43 (Postgres-over-MCP), AI-45 (PostHog funnel events), AI-63 (NL-to-dashboard),
AI-107 (resume-to-candidate extraction), AI-112 (store approved applications + notify)
**Branch:** `feat/ai-34-domain-model` (worktree `ai-eng-training-ai-34-domain-model`, based on `origin/main`)
**Status:** revised after harden round 1 (`CHANGES_REQUESTED`); every finding's disposition is in §6.

---

## 1. Problem statement

A recruiter today reconstructs a hiring pipeline from an inbox: which candidate applied to which
role, what stage they are in, how long they have been stuck there. Nothing is queryable, nothing is
chartable, and nothing can be handed to an agent.

This change introduces the relational model the rest of the training builds on: Day 5 queries it
over MCP, Day 9 charts it, Day 13 indexes its free text as a RAG corpus, Day 17 writes
LLM-extracted fields into it, and Day 18 gates those writes behind recruiter review. The shape
chosen here is load-bearing for five downstream tickets, so the constraints matter more than the
column count.

**In scope:** `jobs`, `candidates`, `applications`, `interviews`, `notes`, `pipeline_stages`
(plus `application_stage_transitions`, required by AC 3); stage, source and a confidence-flagged
extraction payload on applications; migrations; a realistic seed script; types inferred from the
schema.

**Out of scope:** UI of any kind; authentication and multi-tenancy; vector tables (AI-83 owns
pgvector indexing). No production code beyond schema, migrations, seed and their tests.

**Hard constraint on this change:** _no live database is available._ The deliverable is schema
files + generated migration SQL + a seed script + `.env.example` keys. Every slice below is
verifiable with `pnpm check` (typecheck + eslint + prettier + vitest), offline `drizzle-kit`
commands that never open a connection, and file inspection. The user runs migrate and seed
manually afterwards.

### Acceptance criteria (verbatim from the ticket)

1. Given a fresh database, when migrations and the seed script run, then the app has enough
   realistic data to make a dashboard and a RAG corpus meaningful
2. An application always belongs to exactly one job and one candidate, enforced by the schema
   rather than by convention
3. Stage transitions are recorded with a timestamp, so time-in-stage is derivable
4. Application rows can carry per-field confidence, which Day 17 writes and Day 18 gates on
5. Types are inferred from the schema — no hand-maintained parallel type definitions
6. Edge cases / error states handled: deleting a job with live applications is refused rather than
   cascading silently

### How each AC is verified without a database

| AC  | Offline verification                                                                                                                                                                                                                                 |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `seed-data.test.ts` asserts row counts, funnel reach, prose volume, and that every row parses against `createInsertSchema(...)` for its table                                                                                                        |
| 2   | `getTableConfig(applications)` (a pure drizzle helper, no connection) asserts two `NOT NULL` FKs and the unique `(job_id, candidate_id)` constraint; the generated SQL is inspected                                                                  |
| 3   | `application_stage_transitions` exists in the generated DDL; the seed test asserts `applications.stage` equals the latest transition's `to_stage` and that transitions chain and increase in time                                                    |
| 4   | `extractionPayloadSchema` unit tests; `getTableConfig(applications).checks` asserts the envelope check exists; the seed carries ~12 populated payloads spanning low- and high-confidence cases, so the column, the check and the index all have data |
| 5   | No hand-written row types exist — every entity type is `typeof <table>.$inferSelect`, and typecheck proves they resolve                                                                                                                              |
| 6   | `getTableConfig(applications).foreignKeys` asserts `onDelete === "restrict"` for `job_id`; the generated SQL contains `ON DELETE restrict`                                                                                                           |

---

## 2. Verified facts this plan rests on

Checked against the installed packages, the npm registry, and a scratchpad drizzle-kit run on
2026-08-18 — not from memory. Facts marked **(run)** were executed, not read.

- **Nothing drizzle-related is installed.** The worktree's `package.json` has no `drizzle-*`,
  `postgres`, `pg`, `tsx` or `dotenv`. A slice must add them.
- **Current published versions:** `drizzle-orm@0.45.2` (`latest`; the 1.0 line is still
  `beta`/`rc` and is _not_ used here), `drizzle-kit@0.31.10`, `drizzle-zod@0.8.3`,
  `postgres@3.4.9`, `tsx@4.23.12`.
- **`drizzle-zod@0.8.3` peer range is `zod: "^3.25.0 || ^4.0.0"`** — compatible with the installed
  `zod@4.4.3`. It exports `createSelectSchema`, `createInsertSchema`, `createUpdateSchema`,
  `createSchemaFactory`.
- **(run) `drizzle-kit generate` produces migration SQL with no credentials and no `DATABASE_URL`
  in the environment, exit 0.** Executed in a scratchpad against a probe schema with
  `env -u DATABASE_URL -u DIRECT_DATABASE_URL`, using a `drizzle.config.ts` that declares no
  `dbCredentials`. This is the fact the entire offline plan rests on. Confirmed in the source too:
  `prepareGenerateConfig` reads only `schema`, `out`, `breakpoints`, `dialect`, `driver`, `casing`
  and `migrations.prefix`, and the runtime config validator declares `dbCredentials:
any().optional()`.
- **(run) The generated DDL confirms every shape §3 depends on:** `ON DELETE restrict ON UPDATE
cascade` on foreign keys; `timestamp with time zone`; `DEFAULT gen_random_uuid()`; named `CHECK`
  constraints including one built from `jsonb_exists(...)`; `UNIQUE(...)` table constraints;
  `CREATE INDEX ... USING gin (...)`; and `.enableRLS()` emitting `ALTER TABLE "x" ENABLE ROW LEVEL
SECURITY;`.
- **(run) `drizzle-kit export --sql` and `drizzle-kit check` exit 0 when schema files exist — and
  `export`/`generate` exit 1 when the schema glob matches nothing** (`Error No schema files found
for path config [...]`). The round-1 critic was right to flag this and my earlier source reading
  was wrong: `prepareFilenames` errors before the empty-list branch is reached. Slice 1's DoD is
  corrected accordingly.
- **(run) `drizzle-kit check` requires `drizzle-orm` to be installed** (`Please install latest
version of drizzle-orm`), which it will be.
- **(run) `drizzle-kit` writes `drizzle/meta/_journal.json` and `drizzle/meta/0000_snapshot.json`
  unformatted**, so `prettier --check .` fails unless `drizzle/` is in `.prettierignore`.
- **`drizzle-kit generate --custom` exists** and emits an empty SQL file for hand-written
  statements — that is how reference data, triggers and non-drizzle-expressible constraints land.
- **drizzle-kit loads `drizzle.config.ts` from the cwd** and compiles it with esbuild + `require`;
  tsconfig `paths` are _not_ resolved there, so the config must not import through `@/`.
- **(run) `.$onUpdate(...)` is ORM-level only — it emits no DDL.** The probe column carrying it
  generated a plain `DEFAULT now() NOT NULL` with no trigger. It therefore cannot maintain
  `updated_at` for the raw `UPDATE`s Days 5/17 will write. This settles finding 3.
- **`unique()` exposes only `nullsNotDistinct()` — there is no `DEFERRABLE` option** in
  `drizzle-orm@0.45.2`'s `pg-core/unique-constraint.d.ts`. A deferrable unique constraint must be
  hand-written in a custom migration. (`deferrable` in `pg-core/session.d.ts` is transaction config,
  not constraints.)
- **Other API shapes confirmed in the typings:** `pgTable(name, columns, (t) => [...])` (the
  object-returning third argument is deprecated); `timestamp(name, { withTimezone, mode })`;
  `jsonb`; `pgEnum`; `check(name, sql)`; `index(name).using("gin", ...)`;
  `foreignKey(...).onDelete('cascade' | 'restrict' | 'no action' | 'set null' | 'set default')`;
  `$type<T>()`; `relations()`; `getTableConfig(table)` returning `{ columns, indexes, foreignKeys,
checks, primaryKeys, uniqueConstraints, policies, enableRLS }` — all pure, no connection;
  `drizzle-orm/postgres-js/migrator` exports `migrate(db, config)`.
- **zod 4.4.3 supports** `z.url({ protocol: RegExp })`, `z.record(keyType, valueType)` (two required
  arguments) and `z.iso.datetime()`.
- **(run) Node is v22.20.0 and supports `--env-file-if-exists`.** No `dotenv` dependency, and no
  second module reading `process.env`.
- **`.claude/skills/pre-deploy/scripts/check-env.sh`** parses `src/env.ts` with
  `^\s*([A-Z][A-Z0-9_]+):\s*z\.` and warns about any validated key missing from `.env.example`.
- **`.claude/skills/pre-deploy/scripts/check-console.sh`** fails on `console.log`/`console.debug`
  anywhere in `src/**/*.ts` except tests. A seed runner that prints progress cannot live under
  `src/`.
- **`tsconfig.json` includes `**/*.ts`**, so `drizzle.config.ts` and `scripts/*.ts` are covered by
  `pnpm typecheck` — the offline safety net for both.
- **`vitest.config.mts` collects only `src/**/*.{test,spec}.{ts,tsx}`**, so anything needing a test
  must have its logic under `src/`.

---

## 3. Schema

Conventions applied to every table: `uuid` primary key with `default gen_random_uuid()`;
`timestamptz` for every instant; `created_at`/`updated_at` `NOT NULL DEFAULT now()`; snake_case
column names written explicitly in the drizzle builders; no soft delete.

**`updated_at` is maintained by a database trigger**, created once in the custom migration (a
`set_updated_at()` function plus one `BEFORE UPDATE` trigger per table). It is not maintained by
drizzle's `.$onUpdate()`, which was measured to emit no DDL and would therefore leave `updated_at`
silently frozen for every raw `UPDATE` — and raw `UPDATE`s are exactly what Day 5's MCP server and
Day 17's extraction writer will issue. A column that quietly means `created_at` is worse than no
column. This is a deliberate exception to "no triggers" (§6 🟡 #2): `set_updated_at()` is
bookkeeping that is a total function of the row, carries no business meaning, and is the standard
Postgres idiom; the stage-sync trigger that was rejected would have encoded domain rules invisibly.

**Row Level Security is enabled on all seven tables with zero policies** (§6 🔴 #1) — the
`.enableRLS()` builder emits `ALTER TABLE … ENABLE ROW LEVEL SECURITY`, which closes Supabase's
PostgREST exposure by default.

### 3.1 Enums (`pgEnum`)

| Enum                       | Values                                                                           |
| -------------------------- | -------------------------------------------------------------------------------- |
| `job_status`               | `draft`, `open`, `paused`, `closed`, `filled`                                    |
| `employment_type`          | `full_time`, `part_time`, `contract`, `internship`                               |
| `application_source`       | `careers_site`, `referral`, `linkedin`, `job_board`, `agency`, `email`, `import` |
| `interview_kind`           | `phone_screen`, `technical`, `onsite`, `final`                                   |
| `interview_status`         | `scheduled`, `completed`, `cancelled`, `no_show`                                 |
| `interview_recommendation` | `strong_no`, `no`, `yes`, `strong_yes`                                           |

**The rule for enum-vs-lookup-table:** a pg enum for vocabularies that are _closed by product
logic_ and that a recruiter can never edit; a lookup table for vocabularies the product will let
users rename, reorder or extend. Pipeline stages are the latter (§3.2); the six above are the
former. Growing an enum later costs an `ALTER TYPE … ADD VALUE`, which **cannot run inside a
transaction block** — see Risks.

### 3.2 `pipeline_stages` — the ordered, seeded lookup table

| Column                      | Type          | Constraints                                                         |
| --------------------------- | ------------- | ------------------------------------------------------------------- |
| `key`                       | `text`        | **PK** — stable machine identifier                                  |
| `label`                     | `text`        | `NOT NULL` — human-facing, renameable                               |
| `position`                  | `integer`     | `NOT NULL`; unique **`DEFERRABLE INITIALLY IMMEDIATE`** (see below) |
| `is_terminal`               | `boolean`     | `NOT NULL DEFAULT false`                                            |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`                                            |

Seeded rows: `applied`(1), `screening`(2), `interview`(3), `offer`(4), `hired`(5, terminal),
`rejected`(6, terminal), `withdrawn`(7, terminal).

**`position` uniqueness is deferrable, and is created in the custom migration rather than by
drizzle's `unique()`.** A plain non-deferrable unique constraint would make the single most obvious
reorder — one `UPDATE` swapping two stages' positions with a `CASE` expression — fail with a
duplicate key error part-way through the statement, which directly contradicts the reason this is a
table rather than an enum. `drizzle-orm@0.45.2`'s `unique()` has no `DEFERRABLE` option (verified),
so the constraint is written by hand as an `ALTER TABLE … ADD CONSTRAINT … UNIQUE (position)
DEFERRABLE INITIALLY IMMEDIATE`. A single-statement reorder — one `UPDATE … SET position = CASE …`
swapping two or more positions — succeeds unaided against this constraint, with no
`SET CONSTRAINTS ALL DEFERRED` ceremony required: measured against a Postgres 17 instance, marking
a constraint `DEFERRABLE` changes its enforcement from a plain index check to the constraint-trigger
mechanism, and `INITIALLY IMMEDIATE` for that mechanism means "checked at end of statement," not
"checked after every row" — which is already enough for every row the one `UPDATE` touches to reach
its final value before uniqueness is checked once. `SET CONSTRAINTS ALL DEFERRED` only matters if a
reorder is ever split across multiple statements in the same transaction, in which case it defers the
check all the way to `COMMIT`. Uniqueness is worth keeping rather than removing: duplicate
positions make the funnel order ambiguous, and Day 9's chart sorts on it. Because drizzle-kit diffs
against its own snapshot rather than the live database, a hand-written constraint is invisible to
future `generate` runs and survives — but see the `drizzle-kit push` land-mine in Risks.

**How `pipeline_stages` relates to `applications.stage` — the explicit answer.**
`applications.stage` is `text NOT NULL REFERENCES pipeline_stages(key) ON UPDATE CASCADE ON DELETE
RESTRICT`. It is a foreign key to this table, **not** a pg enum and not a free string. The same FK
is used by `application_stage_transitions.from_stage` (nullable) and `.to_stage`.

Why a table rather than a pg enum, when the ticket's other closed sets are enums:

- **AC 3 and Day 9 need order and labels as _data_.** `position` lets a funnel chart sort stages and
  compute stage-to-stage conversion with a join; `label` lets a stage be renamed ("Screening" →
  "Recruiter screen") with an `UPDATE`, not a migration. An enum can carry neither.
- **Reordering and removal are impossible with a pg enum.** `ALTER TYPE … ADD VALUE` cannot run in a
  transaction, and values can never be removed. The pipeline is the single most likely thing to
  change across Days 9/17/18; making it the one thing requiring an `ALTER TYPE` would be the wrong
  bet.
- **Day 5 (AI-43) puts an LLM in front of this database.** `SELECT * FROM pipeline_stages` is
  self-describing; enum introspection via `pg_enum` is not.
- **The ticket names `pipeline_stages` as a table in Scope IN**, so this is settled, not invented.

Cost: `applications.stage` is typed `string` by inference, and label lookups need a join. Both are
handled: the drizzle column is declared `.$type<PipelineStageKey>()`, where `PipelineStageKey` is
derived (`(typeof PIPELINE_STAGE_SEED)[number]["key"]`) from the same `as const` constant that
generates the seed migration — a _derived_ type, not a hand-maintained parallel one, so AC 5 holds.

**Reference data vs demo data.** `pipeline_stages` rows are seeded by a **migration**
(`drizzle-kit generate --custom`, `INSERT … ON CONFLICT (key) DO NOTHING`), not by the demo seed
script: the FK makes them a precondition for inserting _any_ application, including in an
environment where the demo data must never run.

### 3.3 `jobs`

| Column                      | Type              | Constraints                                          |
| --------------------------- | ----------------- | ---------------------------------------------------- |
| `id`                        | `uuid`            | **PK**, `DEFAULT gen_random_uuid()`                  |
| `title`                     | `text`            | `NOT NULL`                                           |
| `department`                | `text`            | nullable                                             |
| `location`                  | `text`            | `NOT NULL`                                           |
| `employment_type`           | `employment_type` | `NOT NULL DEFAULT 'full_time'`                       |
| `status`                    | `job_status`      | `NOT NULL DEFAULT 'open'`                            |
| `description`               | `text`            | `NOT NULL` — long-form prose, part of the RAG corpus |
| `requirements`              | `text`            | nullable — long-form prose, part of the RAG corpus   |
| `opened_at`                 | `timestamptz`     | `NOT NULL DEFAULT now()`                             |
| `closed_at`                 | `timestamptz`     | nullable                                             |
| `created_at` / `updated_at` | `timestamptz`     | `NOT NULL DEFAULT now()`                             |

Check: `closed_at IS NULL OR closed_at >= opened_at`. Index on `status`.

### 3.4 `candidates`

| Column                      | Type          | Constraints                                                                                |
| --------------------------- | ------------- | ------------------------------------------------------------------------------------------ |
| `id`                        | `uuid`        | **PK**, `DEFAULT gen_random_uuid()`                                                        |
| `full_name`                 | `text`        | `NOT NULL`                                                                                 |
| `email`                     | `text`        | `NOT NULL`, `UNIQUE`                                                                       |
| `phone`                     | `text`        | nullable                                                                                   |
| `location`                  | `text`        | nullable                                                                                   |
| `headline`                  | `text`        | nullable — one-line positioning                                                            |
| `summary`                   | `text`        | nullable — RAG corpus                                                                      |
| `resume_text`               | `text`        | nullable — the extracted resume body; the bulk of the RAG corpus and AI-107's write target |
| `resume_url`                | `text`        | nullable                                                                                   |
| `linkedin_url`              | `text`        | nullable                                                                                   |
| `years_experience`          | `integer`     | nullable                                                                                   |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`                                                                   |

Checks: `email = lower(email)`; `years_experience IS NULL OR years_experience BETWEEN 0 AND 60`.

The lowercase check plus the plain `UNIQUE (email)` gives case-insensitive uniqueness _enforced by
the schema_ without the `citext` extension or an expression index, and gives AI-107 a stable upsert
target (`ON CONFLICT (email) DO UPDATE`).

### 3.5 `applications` — the table AC 2, 4 and 6 turn on

| Column                      | Type                 | Constraints                                                                                              |
| --------------------------- | -------------------- | -------------------------------------------------------------------------------------------------------- |
| `id`                        | `uuid`               | **PK**, `DEFAULT gen_random_uuid()`                                                                      |
| `job_id`                    | `uuid`               | `NOT NULL` → `jobs(id)` **`ON DELETE RESTRICT`** `ON UPDATE CASCADE`                                     |
| `candidate_id`              | `uuid`               | `NOT NULL` → `candidates(id)` **`ON DELETE RESTRICT`** `ON UPDATE CASCADE`                               |
| `stage`                     | `text`               | `NOT NULL` → `pipeline_stages(key)` `ON DELETE RESTRICT ON UPDATE CASCADE`, `.$type<PipelineStageKey>()` |
| `stage_changed_at`          | `timestamptz`        | `NOT NULL DEFAULT now()`                                                                                 |
| `source`                    | `application_source` | `NOT NULL DEFAULT 'careers_site'`                                                                        |
| `applied_at`                | `timestamptz`        | `NOT NULL DEFAULT now()`                                                                                 |
| `cover_letter`              | `text`               | nullable — RAG corpus                                                                                    |
| `extraction`                | `jsonb`              | nullable, `.$type<ExtractionPayload>()`                                                                  |
| `created_at` / `updated_at` | `timestamptz`        | `NOT NULL DEFAULT now()`                                                                                 |

Constraints and indexes:

- `UNIQUE (job_id, candidate_id)`
- Check: `extraction IS NULL OR (jsonb_typeof(extraction) = 'object' AND jsonb_exists(extraction, 'schemaVersion') AND jsonb_exists(extraction, 'fields'))`
- Indexes on `candidate_id`, on `stage`, on `applied_at`, and a GIN index on `extraction`.
  `(job_id, …)` lookups are served by the unique constraint's index.

**AC 2 — "exactly one job and one candidate, enforced by the schema."** Two single-column
`NOT NULL` foreign keys are the enforcement: not-null makes "at least one" impossible to violate,
and a scalar FK column makes "more than one" unrepresentable. No nullable pair, no polymorphic
`entity_type/entity_id`, no join table. The unique `(job_id, candidate_id)` pair additionally makes
a candidate-plus-role a single pipeline record, which is what a recruiter tracking a pipeline means
by "where does this person stand for this role"; re-application moves the existing row and appends a
transition rather than creating a second row.

**AC 6 — "deleting a job with live applications is refused rather than cascading silently."**
`ON DELETE RESTRICT` on `applications.job_id`. `RESTRICT` rather than the Postgres default
`NO ACTION` because `RESTRICT` cannot be deferred to end-of-transaction — the deletion fails
immediately and unambiguously, and the intent is legible in the DDL. The rule is deliberately
stricter than the AC: deletion is refused if _any_ application row exists, live or not. Archiving a
job is `status = 'closed'`, which is what `jobs.status` is for. The same `RESTRICT` applies to
`candidate_id` — a candidate with a history should not vanish either.

**AC 4 — per-field confidence.** `extraction` is a `jsonb` envelope, typed in TypeScript and
validated with zod:

```
{
  "schemaVersion": 1,
  "model": "claude-…",
  "extractedAt": "2026-08-18T10:04:00.000Z",
  "fields": {
    "candidateEmail":  { "value": "ada@example.com", "confidence": 0.97, "source": "resume.pdf#page=1" },
    "yearsExperience": { "value": 7,                 "confidence": 0.58, "source": "resume.pdf#page=2" }
  }
}
```

`extractionPayloadSchema` lives in `src/lib/db/extraction.ts`; `ExtractionPayload = z.infer<…>` is
attached to the column with `.$type<ExtractionPayload>()`, so reads and writes are typed. The seed
populates this column on a subset of applications (slice 7), so the envelope check, the GIN index and
AI-112's gate all have rows to work against from the first migration rather than from Day 17.

**Contract: extraction confidence is scoped to an application, and only to an application.** The
envelope may name candidate-level fields (`candidateEmail`, `yearsExperience`) — those describe what
a model proposed _while processing that application_. A candidate ingested with no application
therefore has nowhere to record confidence, and Day 18's gate has no row to read. That is deliberate
for this ticket: applications are the unit of review, and AI-112 gates applications. If AI-107 needs
to ingest a candidate with no application, it must either create a placeholder application or extend
this contract — it should not silently add a second `extraction` column to `candidates`, which would
give Day 18 two places to look.

Why `jsonb` and not per-field confidence columns:

- **The extracted field set is not known on Day 3.** AI-107 decides it. Per-field columns mean two
  columns (`value`, `confidence`) per extracted field and a migration every time the prompt changes.
- **Confidence is metadata about a _write_, not a domain attribute.** The authoritative value lives
  in the typed column (`candidates.email`, `applications.source`, …). `extraction` records what a
  model proposed, how sure it was, and where it read it from — including for fields that were
  _rejected_, which a per-field column on the domain row cannot express.
- **Day 18 gates on it generically.** "Any field below threshold ⇒ needs review" is one expression
  over `fields`, and stays one expression as the field set grows.
- The usual objection — "jsonb is unvalidated mush" — is answered twice: the zod schema at the
  application boundary (repo convention: validate at the boundary), and the envelope check in the
  database so a hand-written `INSERT` on Day 5 or Day 17 cannot store a shapeless blob. The check
  uses the `jsonb_exists(…)` _function_ rather than the `?` operator because `?` collides with
  parameter placeholders in several drivers and tools.
- Not chosen: a `needs_review` boolean or a `review_status` enum. That is AI-112's workflow, not
  Day 3's data model; the payload is the hook it needs.

### 3.6 `application_stage_transitions` — AC 3

| Column           | Type          | Constraints                                                                                                    |
| ---------------- | ------------- | -------------------------------------------------------------------------------------------------------------- |
| `id`             | `uuid`        | **PK**, `DEFAULT gen_random_uuid()`                                                                            |
| `application_id` | `uuid`        | `NOT NULL` → `applications(id)` **`ON DELETE CASCADE`**                                                        |
| `from_stage`     | `text`        | nullable → `pipeline_stages(key)` `ON DELETE RESTRICT ON UPDATE CASCADE` — `NULL` means "entered the pipeline" |
| `to_stage`       | `text`        | `NOT NULL` → `pipeline_stages(key)` `ON DELETE RESTRICT ON UPDATE CASCADE`                                     |
| `occurred_at`    | `timestamptz` | `NOT NULL DEFAULT now()`                                                                                       |
| `changed_by`     | `text`        | nullable — free text until an auth model exists                                                                |
| `reason`         | `text`        | nullable                                                                                                       |
| `created_at`     | `timestamptz` | `NOT NULL DEFAULT now()` — when the row was written, distinct from when the move happened                      |

Check: `from_stage IS NULL OR from_stage <> to_stage`. Index on `(application_id, occurred_at)`.

`ON DELETE CASCADE` here is correct and is _not_ a silent cascade of the kind AC 6 forbids: the
history belongs to the application, and the application itself is `RESTRICT`-protected from job
deletion, so no deletion of a job can ever reach these rows.

**Time-in-stage is derivable** — the query Day 9 will use:

```sql
SELECT application_id,
       to_stage AS stage,
       occurred_at AS entered_at,
       lead(occurred_at) OVER (PARTITION BY application_id ORDER BY occurred_at) AS left_at
FROM   application_stage_transitions;
```

with `coalesce(left_at, now()) - entered_at` as the duration.

**The fork: keep `applications.stage`, or derive current stage from history alone?**
Keep both — `stage` is a projection of the log, not a competing source of truth.

- Deriving requires `DISTINCT ON (application_id) … ORDER BY occurred_at DESC` on every board, list
  and dashboard query. That is exactly the query an LLM writing SQL on Day 5 (AI-43) and Day 9
  (AI-63) will get subtly wrong, and it cannot be indexed as cheaply as a column.
- Derived-only means an application with zero transition rows has _no_ stage. `stage NOT NULL` with
  an FK makes "every application is somewhere in the pipeline" a schema guarantee.
- `stage_changed_at` makes "time in the _current_ stage" — the number the recruiter actually stares
  at — a column subtraction instead of a windowed subquery per row.

The cost is that the two can drift. **This ticket ships no runtime writer** — no UI, no API, and the
seed builds its transitions and its `stage`/`stage_changed_at` values together in one pure function
— so no write-path module is built here. The rule for whoever writes the first one (AI-112) is
recorded as §6 🟡 #2: one transaction, one code path, transition row and projection updated
together. The seed test already asserts the invariant that path must preserve.

### 3.7 `interviews`

| Column                      | Type                       | Constraints                                         |
| --------------------------- | -------------------------- | --------------------------------------------------- |
| `id`                        | `uuid`                     | **PK**, `DEFAULT gen_random_uuid()`                 |
| `application_id`            | `uuid`                     | `NOT NULL` → `applications(id)` `ON DELETE CASCADE` |
| `kind`                      | `interview_kind`           | `NOT NULL`                                          |
| `status`                    | `interview_status`         | `NOT NULL DEFAULT 'scheduled'`                      |
| `scheduled_at`              | `timestamptz`              | `NOT NULL`                                          |
| `duration_minutes`          | `integer`                  | `NOT NULL DEFAULT 45`                               |
| `interviewer_name`          | `text`                     | `NOT NULL` — free text until an auth model exists   |
| `location`                  | `text`                     | nullable — room name or meeting URL                 |
| `recommendation`            | `interview_recommendation` | nullable                                            |
| `feedback`                  | `text`                     | nullable — RAG corpus                               |
| `created_at` / `updated_at` | `timestamptz`              | `NOT NULL DEFAULT now()`                            |

Check: `duration_minutes > 0`. Index on `(application_id, scheduled_at)`.

An interview hangs off the _application_, not off the candidate: the same person interviewing for
two roles has two independent interview loops.

### 3.8 `notes`

| Column                      | Type          | Constraints                                       |
| --------------------------- | ------------- | ------------------------------------------------- |
| `id`                        | `uuid`        | **PK**, `DEFAULT gen_random_uuid()`               |
| `job_id`                    | `uuid`        | nullable → `jobs(id)` `ON DELETE CASCADE`         |
| `candidate_id`              | `uuid`        | nullable → `candidates(id)` `ON DELETE CASCADE`   |
| `application_id`            | `uuid`        | nullable → `applications(id)` `ON DELETE CASCADE` |
| `body`                      | `text`        | `NOT NULL` — RAG corpus                           |
| `author`                    | `text`        | `NOT NULL`                                        |
| `pinned`                    | `boolean`     | `NOT NULL DEFAULT false`                          |
| `created_at` / `updated_at` | `timestamptz` | `NOT NULL DEFAULT now()`                          |

Check: `num_nonnulls(job_id, candidate_id, application_id) = 1`. One index per FK column.

**The fork: polymorphic `(entity_type, entity_id)` vs explicit nullable FKs.** Explicit nullable FKs
win. A polymorphic pair cannot carry a foreign key, so orphaned notes become possible the moment
anything removes a row, and every consumer — including the Day 5 LLM — has to know the `entity_type`
convention. The `num_nonnulls(...) = 1` check makes "attached to exactly one thing" schema-enforced,
the same standard AC 2 sets for applications. The cost is a migration if a fourth attachable entity
appears; at three, that is the cheaper side of the trade.

The asymmetry with §3.5 is deliberate: notes `CASCADE` (a note about a removed job is noise),
applications `RESTRICT` (an application against a removed job is lost history).

### 3.9 Relations

`relations()` declarations for every association (`jobs ↔ applications`, `candidates ↔
applications`, `applications ↔ interviews / notes / transitions`, `notes → job | candidate |
application`) so AI-43 and AI-63 can use `db.query.<table>.findMany({ with: … })` instead of
hand-written joins. Declarations only — no runtime cost, no extra tables.

---

## 4. File layout

Every path is justified against the CLAUDE.md layout table.

| Path                                              | What                                                          | Why here                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `drizzle.config.ts`                               | drizzle-kit config                                            | drizzle-kit resolves `./drizzle.config.ts` from the cwd, so root avoids `--config` on every command; and it sits with the repo's other tool configs (`next.config.ts`, `vitest.config.mts`, `eslint.config.mjs`, `prettier.config.mjs`), none of which live in `src/`. It declares no `dbCredentials` — measured sufficient for `generate`, `export` and `check`.                                      |
| `drizzle/*.sql`, `drizzle/meta/*`                 | generated migrations + snapshots                              | drizzle-kit's default `out`. **Committed** — the SQL is the deliverable of this ticket. Kept out of `src/` so vitest's `include`/coverage globs and the Next bundler never see it. Requires a `drizzle/` line in `.prettierignore`.                                                                                                                                                                    |
| `src/lib/db/schema/<table>.ts`                    | one drizzle table per file, plus its inferred types           | CLAUDE.md: framework-free code → `src/lib/`; feature-local types live beside the feature. One file per table keeps the Day 13/17/18 diffs small. **No `index.ts` barrel** — consumers import the specific module (`@/lib/db/schema/applications`), and sibling schema files import each other relatively (`./jobs`), which is same-directory and therefore allowed.                                    |
| `src/lib/db/schema/enums.ts`                      | the six `pgEnum`s                                             | shared by several tables; a separate module avoids import cycles.                                                                                                                                                                                                                                                                                                                                      |
| `src/lib/db/extraction.ts`                        | `extractionPayloadSchema`, `ExtractionPayload`                | framework-free zod schema; consumed by `applications.ts` via `.$type<>()`.                                                                                                                                                                                                                                                                                                                             |
| `src/lib/db/seed-data.ts` (+ `seed-data.test.ts`) | deterministic dataset builder                                 | must live under `src/` because vitest only collects `src/**`; pure data, no connection.                                                                                                                                                                                                                                                                                                                |
| `src/lib/db/seed-preflight.ts` (+ test)           | `assertSeedTargetsEmpty(counts)`                              | the refuse-if-not-empty guard, as a pure function so it is unit-testable with no database.                                                                                                                                                                                                                                                                                                             |
| `scripts/db-migrate.ts`, `scripts/db-seed.ts`     | CLI entrypoints                                               | **Not** under `src/`: `check-console.sh` fails on `console.log` anywhere in `src/**/*.ts`, and a seed runner's whole job is printing progress. They are also not application source — nothing in the Next graph should import them. `tsconfig.json` already includes `**/*.ts`, so they are typechecked by `pnpm check`. They stay thin: argv parsing, connection, preflight, ordered inserts, output. |
| `src/env.ts`                                      | `DATABASE_URL`, `DIRECT_DATABASE_URL` added to `serverSchema` | the only module allowed to read `process.env`.                                                                                                                                                                                                                                                                                                                                                         |
| `.env.example`                                    | both keys with commented guidance                             | the deploy-time contract `check-env.sh` validates.                                                                                                                                                                                                                                                                                                                                                     |
| `docs/specs/ai-34-domain-model.md`                | this file                                                     | —                                                                                                                                                                                                                                                                                                                                                                                                      |

**No `src/lib/db/client.ts` in this ticket.** Both runners open their own connection against
`DIRECT_DATABASE_URL`, so a pooled runtime client would have zero consumers and zero test coverage
here. It belongs to AI-43, along with `server-only` and the `prepare: false` requirement recorded in
Risks.

### Environment keys

```
# Supabase Postgres, pooled connection (Supavisor, transaction mode, port 6543 on hosted).
# Read by the application at runtime from AI-43 onward; nothing in AI-34 uses it.
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# Direct connection (port 5432). Migrations and the seed script use this one: DDL and the
# advisory locks the migrator takes do not survive the transaction pooler.
DIRECT_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

`DATABASE_URL` is declared despite having no reader in this ticket: `.env.example` is a deploy-time
_contract_, the pooled/direct split is the trap this project will otherwise hit on Day 5, and three
lines now is cheaper than a half-configured environment later. This is the one place the "no
consumer in this ticket" rule is deliberately not applied — see §6 🟡 #23.

The placeholder is the documented default for a local `supabase start`; the implementer should
confirm it against `supabase status` rather than trusting it. The user fills `.env.local`.

**A required change to `src/env.ts`:** today the single `NODE_ENV` getter parses the _whole_
`serverSchema`. Adding a required `DATABASE_URL` to that schema would make every `env.NODE_ENV` read
fail whenever `DATABASE_URL` is unset — breaking the existing `src/app/api/status/route.test.ts`
immediately. Each server key therefore gets its own getter that parses
`serverSchema.pick({ <KEY>: true })`, keeping the schema as the single declaration of shape while
making each read independent. A new `src/env.test.ts` asserts `env.NODE_ENV` is readable with
`DATABASE_URL` unset — a test that fails against the naive implementation.

### Package scripts

| Script        | Command                                                     | Connects?               |
| ------------- | ----------------------------------------------------------- | ----------------------- |
| `db:generate` | `drizzle-kit generate`                                      | no                      |
| `db:check`    | `drizzle-kit check`                                         | no                      |
| `db:export`   | `drizzle-kit export --sql`                                  | no                      |
| `db:migrate`  | `tsx --env-file-if-exists=.env.local scripts/db-migrate.ts` | yes (user runs it)      |
| `db:seed`     | `tsx --env-file-if-exists=.env.local scripts/db-seed.ts`    | yes, unless `--dry-run` |

`pnpm check` is left untouched apart from staying green.

### Seed re-run semantics — the safety contract

Both runners use **`DIRECT_DATABASE_URL`**.

`pnpm db:seed` is **non-destructive, and has no destructive mode at all.** It counts rows in the six
demo tables (`jobs`, `candidates`, `applications`, `application_stage_transitions`, `interviews`,
`notes` — not `pipeline_stages`, which the migration owns) and **refuses with a non-zero exit and a
list of the populated tables** if any of them already has rows. It never empties a table, never
removes a row, and has no `--reset`, `--force` or `--clean` flag to be extended by accident.

This is deliberate, and it is why no new escalation is needed:

- A table-emptying path — even one behind a flag — is a destructive operation against whatever
  `DIRECT_DATABASE_URL` points at, which per §4 the _user_ runs by hand and which may be the hosted
  Supabase project holding candidate names, emails and resume text. Shipping no such code is
  strictly safer than shipping a guarded version of it, and it is also less code.
- Nothing is lost. AC 1 says "_given a fresh database_". The Supabase CLI's local re-initialisation
  workflow already re-runs every migration against an empty database and is the native,
  well-understood way to start over. Hosted is seeded once.
- The guard itself is a pure function, `assertSeedTargetsEmpty(counts)`, which throws a named error
  listing the populated tables. The runner supplies real counts; the test supplies fake ones. So the
  safety behaviour is verifiable offline, like everything else here.

`--dry-run` builds and validates the dataset, prints per-table counts, and exits **without importing
the database client or touching `@/env`** — that short-circuit is what makes the flag testable with
no `DATABASE_URL` set.

---

## 5. Plan (slices)

Each slice is independently reviewable and its DoD is checkable with `pnpm check`, an offline
`drizzle-kit` command, and reading a file. **No DoD requires a database connection.** Constraint
_semantics_ are specified; constraint and index _names_, flag spellings and log formats are the
implementer's.

1. [ ] **Tooling and env plumbing** — add `drizzle-orm@^0.45.2` (dependency: it is imported from
       `src/lib/db/schema/**`, which is application source) and `drizzle-kit@^0.31.10`,
       `drizzle-zod@^0.8.3`, `postgres@^3.4.9`, `tsx@^4.23.12` (devDependencies: in this ticket
       `drizzle-zod` is imported only from `*.test.ts` and `postgres` only from `scripts/`). The rule
       is **imported from `src/` ⇒ dependency; imported only from `scripts/` or a test ⇒
       devDependency**; AI-43 promotes `postgres` and `drizzle-zod` when the runtime client and the
       first runtime validator appear. Also in this slice: add `drizzle.config.ts` (dialect `postgresql`, schema glob `./src/lib/db/schema/*.ts`,
       `out: "./drizzle"`, no `dbCredentials`); add the five `db:*` scripts; add `drizzle/` to
       `.prettierignore`; add `DATABASE_URL` + `DIRECT_DATABASE_URL` to `serverSchema` with per-key
       getters and to `.env.example`; add `src/env.test.ts`.
       **DoD:** `pnpm check` green; `src/env.test.ts` proves `env.NODE_ENV` reads with `DATABASE_URL`
       unset and that a malformed `DATABASE_URL` is rejected with a named error;
       `bash .claude/skills/pre-deploy/scripts/check-env.sh` prints no `WARN:` line.
       _(The config-parses-without-credentials proof moved to slice 2: an empty schema glob makes
       `drizzle-kit export`/`generate` exit 1, measured — see §2.)_

2. [ ] **Enums, `pipeline_stages`, `jobs`, `candidates`** — `enums.ts`, `pipeline-stages.ts` (incl.
       the `PIPELINE_STAGE_SEED` `as const` constant and the derived `PipelineStageKey` union, with
       `position` uniqueness _not_ declared via `unique()` — the custom migration owns it), `jobs.ts`,
       `candidates.ts`, each exporting `$inferSelect`/`$inferInsert` types and each carrying
       `.enableRLS()`; a schema test using `getTableConfig`.
       **DoD:** `pnpm check` green; `pnpm db:export` exits 0 **with no `DATABASE_URL` in the
       environment** (this is where the credential-less config is proven) and prints DDL containing
       `CREATE TYPE` for all six enums, `timestamp with time zone` on every instant column,
       `gen_random_uuid()` defaults, the email-lowercase and closed-after-opened checks, and a unique
       constraint on `candidates.email`; a test asserts
       `getTableConfig(pipelineStages).uniqueConstraints` contains **no** entry for `position`, so
       drizzle is not emitting a non-deferrable one alongside the migration's deferrable one; a test
       asserts `getTableConfig(<table>).enableRLS` is true for all four tables defined here.

3. [ ] **`applications` + `application_stage_transitions`** — the AC 2/3/4/6 core, including
       `src/lib/db/extraction.ts` with `extractionPayloadSchema` and its unit tests, the `.$type<>()`
       narrowings, both `RESTRICT` FKs, the unique pair, the envelope check, the indexes, and
       `.enableRLS()` on both tables.
       **DoD:** `pnpm check` green; tests assert via `getTableConfig(applications)` that `job_id` and
       `candidate_id` are not-null with `onDelete === "restrict"` (AC 2, AC 6), that a unique constraint
       covers exactly `(job_id, candidate_id)`, and that a check constraint built from `jsonb_exists`
       over `extraction` exists (AC 4); `extractionPayloadSchema` rejects `confidence: 1.4`, a missing
       `fields`, and a wrong `schemaVersion`; a test asserts the transitions table's check forbids
       `from_stage = to_stage`; `getTableConfig(<table>).enableRLS` is true for both; `pnpm db:export`
       shows `ON DELETE restrict` and the GIN index.

4. [ ] **`interviews` + `notes`** — both tables with their checks, indexes and `.enableRLS()`.
       **DoD:** `pnpm check` green; a test asserts a check constraint on `notes` built from
       `num_nonnulls` over the three parent columns, and that all three note FKs are nullable with
       `onDelete === "cascade"`; `getTableConfig(<table>).enableRLS` is true for both; `pnpm db:export`
       shows `num_nonnulls` and `duration_minutes > 0`.

5. [ ] **Relations** — `relations()` declarations across the schema modules.
       **DoD:** `pnpm check` green; a type-level test shows `applications.job`, `applications.candidate`,
       `applications.interviews`, `applications.transitions` and `notes.*` resolve.

6. [ ] **Migrations** — `pnpm db:generate` once for the whole DDL (`.enableRLS()` already sits on
       every table from slices 2–4; this slice edits no schema file), then
       `drizzle-kit generate --custom` for a second file holding: the seven
       `pipeline_stages` rows (`ON CONFLICT (key) DO NOTHING`), the deferrable unique on
       `pipeline_stages.position`, and the `set_updated_at()` function plus one `BEFORE UPDATE` trigger
       per table carrying `updated_at`. Commit `drizzle/`.
       **DoD:** `pnpm db:check` passes; `pnpm check` green (proving `.prettierignore` covers
       `drizzle/meta/*.json`); a test reads the generated SQL and asserts (a) every **field** of every
       row in `PIPELINE_STAGE_SEED` — `key`, `label`, `position` and `is_terminal` — appears in the
       custom migration's insert for that key, so neither the TypeScript union nor the values slice 7's
       reach invariant and Day 9's ordering depend on can drift from the hand-written SQL, (b) every table exposing an `updated_at` column has a matching
       `CREATE TRIGGER`, and (c) every table appears in an `ENABLE ROW LEVEL SECURITY` statement;
       inspection confirms `ON DELETE restrict` on both application FKs and `timestamp with time zone`
       throughout.

7. [ ] **Seed dataset** — `src/lib/db/seed-data.ts` exporting
       `buildSeedDataset({ now }: { now: Date })`. Deterministic given `now`: a small seeded PRNG, no
       `Math.random`, no `Date.now()` inside, no `faker`; every timestamp is an offset from `now`.
       Hand-authored prose. Targets: 8 jobs across engineering/design/sales with real descriptions and
       requirements; ~60 candidates with distinct `resume_text`; ~90 applications shaped as a real funnel
       and spread over the ~90 days before `now`; 1–5 chained transitions each; ~40 interviews with
       written feedback; ~120 notes; and ~12 applications carrying a populated `extraction` payload —
       at least one whose lowest field confidence sits below any plausible review threshold, at least one
       entirely high-confidence, so AI-112 inherits both cases and the envelope check and the GIN index
       ship with rows that actually exercise them.
       **DoD:** `pnpm check` green with `seed-data.test.ts` asserting — every FK in the dataset resolves
       within the dataset; every `stage` exists in `PIPELINE_STAGE_SEED`; each application's `stage` and
       `stage_changed_at` equal its latest transition's `to_stage`/`occurred_at`; transitions chain
       (`from_stage[n] === to_stage[n-1]`, first is `null`) and strictly increase in time; **funnel reach
       is non-increasing across the non-terminal stages only** — for the stages with `is_terminal = false`
       ordered by `position` (`applied`(1) through `offer`(4)), the count of distinct applications having
       _any_ transition into that stage never rises as `position` rises. The bound to non-terminal stages
       is load-bearing, not decorative: `rejected`(6) sits at a higher position than `hired`(5), and any
       realistic pipeline rejects far more people than it hires, so an unbounded invariant would be
       satisfiable only by unrealistic data — which would contradict AC 1. This is also the reach measure,
       not the current-`stage` distribution, which is not monotonic once rejections land at every level.
       Every non-terminal stage has at least one application currently in it, and each terminal stage
       holds at least one; every non-null `extraction` parses against `extractionPayloadSchema` and
       satisfies the envelope check's own predicate (a JSON object carrying `schemaVersion` and `fields`),
       with at least one payload below and one above a 0.6 confidence threshold so Day 18's gate has both
       a pass and a fail to work with; every interview is anchored to the stage its `kind` implies —
       `phone_screen` to `screening`, every other kind to `interview` — meaning it attaches only to an
       application whose transition history includes that anchor stage, with `scheduled_at` at or after
       the application entered it, so no application sitting in `applied` carries a completed onsite,
       a recruiter phone screen can sit legitimately on an application still in `screening`, and Day 9's
       time-in-stage chart and Day 13's corpus stay coherent; every row parses against `createInsertSchema(<table>)`
       (AC 5 end-to-end, and the
       seed goes red offline if a NOT NULL column is added and forgotten); emails are unique and
       lowercase; total prose across descriptions, resumes, feedback and notes exceeds 50 000
       characters; and `buildSeedDataset({ now: FIXED })` called twice deep-equals itself.

8. [ ] **Runners, seed guard and docs** — `src/lib/db/seed-preflight.ts` with
       `assertSeedTargetsEmpty(counts)` and its test; `scripts/db-migrate.ts`
       (`migrate(db, { migrationsFolder })` over `DIRECT_DATABASE_URL`); `scripts/db-seed.ts` (calls
       `buildSeedDataset({ now: new Date() })`, runs the preflight, inserts parents before children in
       one transaction, over `DIRECT_DATABASE_URL`; `--dry-run` short-circuits before importing the
       client or touching `@/env`); README section covering the `db:*` scripts, the two env keys, and
       the "seed refuses on a populated database; use the Supabase CLI's local re-initialisation
       workflow to start over" rule.
       **DoD:** `pnpm check` green; `assertSeedTargetsEmpty` tests prove it passes on all-zero counts and
       throws naming exactly the populated tables otherwise; `pnpm db:seed --dry-run` exits 0 and prints
       per-table counts with **no `DATABASE_URL` and no `DIRECT_DATABASE_URL` set** (proving the dry-run
       path never constructs a client, and incidentally that tsx resolves the `@/` alias); a grep over
       `scripts/` finds no row-removing SQL verb — the runners only insert.

Slice 1 comes first; slices 2–5 have FK ordering between them; slices 6–8 follow 2–5.

---

## 6. Assumptions / decisions log

> **Process note.** CLAUDE.md's working agreement says to ask about every choice the request and the
> repository do not settle, batched upfront, before starting. This section _is_ that batch: no
> production code is written by this document, and every 🟡 below is an open question with a stated
> default. Implementation should begin only once these are reviewed or explicitly waived.

### Harden round 1 — disposition of every finding

| #   | Finding                                                                   | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| --- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[BLOCKER]** Seed re-run semantics undefined                             | **Adopted, and taken further than proposed.** §4 "Seed re-run semantics" now specifies: seed refuses when any of the six demo tables has rows, and there is **no reset path at all** — not even an opt-in one. The Supabase CLI's local re-initialisation workflow already covers local re-seeding, and AC 1 only claims "given a fresh database", so a table-emptying path buys nothing and risks the hosted project. Guard extracted as the pure `assertSeedTargetsEmpty(counts)` so it is offline-testable (slice 8). Both runners pinned to `DIRECT_DATABASE_URL`. **No new escalation needed — because no destructive code ships.** |
| 2   | **[SHOULD]** Seed time anchor forks, and collides with the deep-equal DoD | **Adopted, as proposed.** `buildSeedDataset({ now })` takes `now` as a required parameter with no default (a default would reintroduce the ambiguity). Runner passes `new Date()`, tests pass a fixed instant. Every timestamp is an offset from `now`.                                                                                                                                                                                                                                                                                                                                                                                  |
| 3   | **[SHOULD]** `updated_at` has no maintenance story                        | **Adopted.** Measured that `.$onUpdate()` emits no DDL, so it cannot cover the raw `UPDATE`s Days 5/17 will write. A `set_updated_at()` function plus one `BEFORE UPDATE` trigger per table now lands in the custom migration (slice 6), with an offline test asserting every `updated_at` table has a trigger. §3 explains why this trigger is consistent with rejecting the stage-sync trigger: bookkeeping that is a total function of the row, versus invisible business logic.                                                                                                                                                      |
| 4   | **[SHOULD]** Funnel DoD conflates reach with current-stage distribution   | **Adopted, as proposed.** Slice 7 now states the invariant over **reach** — distinct applications with _any_ transition into a stage, non-increasing by `position` — and separately asserts each stage is occupied. The previous wording was indeed either vacuous or unsatisfiable.                                                                                                                                                                                                                                                                                                                                                     |
| 5   | **[SHOULD]** `stage-transition.ts` is over-built                          | **Adopted.** Cut from slice 3 along with its tests. It had no caller in this ticket; the seed builds its own transitions. The "one transaction, one write path" rule survives as 🟡 #2 for AI-112, and the seed test already asserts the invariant that rule protects.                                                                                                                                                                                                                                                                                                                                                                   |
| 6   | **[SHOULD]** `position UNIQUE` fights the reorder rationale               | **Adopted.** Verified that `drizzle-orm@0.45.2`'s `unique()` has no `DEFERRABLE` option, so the constraint moves out of the table builder into the custom migration as `UNIQUE (position) DEFERRABLE INITIALLY IMMEDIATE`. Kept rather than removed, because duplicate positions make Day 9's ordering ambiguous. Slice 2 gains a test that drizzle is not _also_ emitting a non-deferrable one.                                                                                                                                                                                                                                         |
| 7   | **[SHOULD]** Confidence exists only where an application exists           | **Adopted, as proposed** — one contract paragraph in §3.5 stating that extraction is scoped to applications, that candidate-only ingestion is out of scope until AI-107 says otherwise, and that the fix is not a second `extraction` column on `candidates`.                                                                                                                                                                                                                                                                                                                                                                            |
| 8   | **[NIT]** Slice 1 DoD leans on unverified drizzle-kit behavior            | **Adopted — and the critic was right where I was wrong.** Executed it: an empty schema glob makes `export` and `generate` exit **1** (`No schema files found for path config`), not 0; `prepareFilenames` errors before the empty-list branch I had read. The credential-less-config proof moved to slice 2, where schema files exist and the command was measured to exit 0 with no `DATABASE_URL`.                                                                                                                                                                                                                                     |
| 9   | **[NIT]** `client.ts` has no consumer                                     | **Adopted.** Removed from §4 and from slice 5, which is now relations only. The `prepare: false` pooler requirement and the `server-only` guard are recorded in Risks so AI-43 inherits them.                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 10  | **[NIT]** Below design altitude                                           | **Adopted in part.** Removed every constraint and index _name_ from §3.3–§3.8 and from the DoDs (which now assert semantics — "a check built from `num_nonnulls` over the three parent columns"), removed `max: 1`, and removed the enumerated insert order. **Kept** "parents before children, one transaction" as a one-line requirement in slice 8: with `RESTRICT`/`NOT NULL` FKs that is a correctness constraint, not a style preference.                                                                                                                                                                                          |

### Harden round 2 — disposition of every finding

| #   | Finding                                                                         | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[SHOULD]** Funnel-reach invariant is unsatisfiable — it spans terminal stages | **Adopted; the critic caught a real regression I introduced.** Round 1's fix dropped the "non-terminal" qualifier, and with `rejected`(6) above `hired`(5) the unbounded invariant is only satisfiable by a pipeline that rejects fewer people than it hires. Slice 7 now bounds reach monotonicity to `is_terminal = false` stages (positions 1–4) and spells out _why_ the bound is load-bearing, so it cannot be dropped again. The separate "each terminal stage holds at least one" assertion still covers 5–7.                                                                                                    |
| 2   | **[SHOULD]** Seed never populates `extraction`, so AC 4 has no data             | **Adopted — seeded, not declined.** Slice 7 gains ~12 applications with populated payloads, at least one below and one above a plausible review threshold, plus DoD assertions that every non-null payload parses against `extractionPayloadSchema` and satisfies the envelope predicate. The GIN index therefore stays. Declining was the alternative; it was rejected because AI-112 inheriting a database with nothing gateable is exactly the "getting the shape wrong on Day 3 is expensive by Day 18" failure the ticket's Background warns about, and because an index over a column no row uses is dead weight. |
| 3   | **[SHOULD]** Interview/stage coherence unstated                                 | **Adopted, with one clause beyond the minimum.** The critic's minimal form — an interview attaches only to an application whose transition history includes `interview` — is in slice 7's DoD. I added the timing clause (`scheduled_at` at or after that application entered `interview`) because it uses data already in the dataset, needs no new machinery, and without it an interview can be dated before the candidate reached the stage, which breaks the same Day 9 chart the finding is protecting. Flag it if that is one clause too many.                                                                   |
| 4   | **[NIT]** The spec itself makes `pnpm check` red                                | **Adopted and fixed, not merely noted.** Ran `pnpm exec prettier --write` on this document and confirmed `pnpm exec prettier --check .` is clean in the worktree. A `docs/` ignore line was rejected per the coordinator: committed docs should stay formatted like everything else.                                                                                                                                                                                                                                                                                                                                    |

### Harden round 3 — disposition of every finding (verdict: APPROVED, nits only)

| #   | Finding                                                                                                 | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **[NIT]** Interview timing clause fights `interview_kind = 'phone_screen'`                              | **Adopted.** My own round-2 clause created the conflict, so I fixed it rather than defend it. Slice 7 now anchors each interview to the stage its `kind` implies — `phone_screen` to `screening`, every other kind to `interview` — which restores the realistic case (a phone screen on an application still in `screening`) while keeping the invariant the clause existed for. One branch, no new machinery. 🟡 #28 updated to match.                                                    |
| 2   | **[NIT]** Slice 6's anti-drift test checks keys only                                                    | **Adopted.** The existing assertion is tightened, not duplicated: every **field** of every `PIPELINE_STAGE_SEED` row (`key`, `label`, `position`, `is_terminal`) must appear in the custom migration's insert for that key. The critic is right that `position` and `is_terminal` are what slice 7's reach invariant and Day 9's ordering actually read, and that hand-written SQL can get them wrong while the key check passes.                                                           |
| 3   | **[NIT, but really a slicing defect]** `.enableRLS()` scheduled in slice 6, lives in slices 2–4's files | **Adopted; agreed it is a slicing defect, not a nit.** `.enableRLS()` moves into slices 2, 3 and 4 alongside the table definitions, each of whose DoDs now asserts `getTableConfig(<table>).enableRLS` is true. Slice 6 keeps only the `ENABLE ROW LEVEL SECURITY` assertion over the generated SQL and now says explicitly that it edits no schema file.                                                                                                                                   |
| 4   | **[NIT]** `drizzle-zod` and `postgres` in `dependencies` with no runtime consumer                       | **Adopted.** Both move to `devDependencies`, and slice 1 now states the rule that decides it: **imported from `src/` ⇒ dependency; imported only from `scripts/` or a test ⇒ devDependency.** That keeps `drizzle-orm` a dependency (it is imported from `src/lib/db/schema/**`) and matches how round 1 finding 9 resolved `client.ts`. 🟡 #24's "runtime dependency, used now" claim is corrected — the evidence never supported it. AI-43 promotes both when the runtime client appears. |

### 🟢 Settled by the ticket, CLAUDE.md, MEMORY.md or the repo — recorded, not decided

- **Drizzle ORM + drizzle-kit; Supabase (local for dev/test, hosted for main); no live database
  during this change; `.env.example` gets the connection key(s); the user runs migrate/seed.**
  Given by the user.
- **`pipeline_stages` is a table.** The ticket lists it in Scope IN alongside the other five.
- **Six tables in scope + `application_stage_transitions`.** The seventh is not scope creep: AC 3
  cannot be met by a single `stage_changed_at` column, which loses every earlier stage's duration.
- **No UI, no auth, no multi-tenancy, no pgvector.** Ticket Scope OUT (AI-83 owns pgvector).
- **Schema lives under `src/lib/`.** CLAUDE.md's layout table: framework-free code → `src/lib/`.
- **No barrel `index.ts`.** CLAUDE.md forbids it; consumers import table modules directly.
- **Inferred types only (AC 5).** `typeof <table>.$inferSelect`/`$inferInsert`, co-located with each
  table because CLAUDE.md keeps feature-local types beside the feature; `src/types/index.ts` is
  untouched.
- **`drizzle-zod@0.8.3` is compatible with the installed `zod@4.4.3`** — verified peer range.
- **Everything drizzle must be added as a dependency** — nothing is installed today.

### 🟡 My judgment calls — proceeding, challenge these in review

1. **`applications.stage` is a text FK to `pipeline_stages(key)`, not a pg enum, and it coexists with
   the transition history.** Order and labels must be data for Day 9; `ALTER TYPE … ADD VALUE` cannot
   run in a transaction and values can never be removed; the projection column keeps every dashboard
   query single-table and makes "every application has a stage" a NOT NULL guarantee. Rejected: enum
   (unreorderable, unrenameable, opaque to the Day 5 LLM); derive-from-history-only (`DISTINCT ON` on
   every read, and an application with no transitions would have no stage).
2. **No stage-sync trigger, and no write-path module in this ticket.** The rule for AI-112, when it
   writes the first real writer: transition row and `stage`/`stage_changed_at` update in one
   transaction, one code path. A trigger would make drift structurally impossible and remains the
   fallback — flip to it if AI-43 ever gains write access or drift is observed. It is one custom
   migration, not a redesign. (Narrower than round 1: the speculative helper module is cut per
   finding 5.)
3. **An `updated_at` trigger _is_ adopted** (finding 3) even though 🟡 #2 rejects a trigger for
   stage. The distinction is deliberate: `set_updated_at()` has no business semantics and is a total
   function of the row, so it can never surprise a reader of the application code; a stage-sync
   trigger would silently author domain history.
4. **`UNIQUE (job_id, candidate_id)`.** One row per person per role; a re-application moves the
   existing row and appends a transition. Rejected: allowing duplicates (asking "where does Ada stand
   for this role" would get two answers) and a partial unique index over non-terminal stages (solves
   a problem nobody has). Trivially reversible.
5. **`ON DELETE RESTRICT` on `applications.candidate_id` too**, not just `job_id` (AC 6 names only
   jobs). Symmetric protection of history; removing a candidate requires clearing their applications
   first, which is the correct friction.
6. **Job deletion is refused when _any_ application exists, not only "live" ones.** A plain FK cannot
   distinguish live from closed without a trigger or partial constraint. Stricter than the AC;
   `status = 'closed'` is the intended way to retire a job.
7. **`jsonb` extraction envelope with `{ schemaVersion, model, extractedAt, fields }`**, guarded by a
   zod schema and a `jsonb_exists`-based check — rather than per-field confidence columns. Rationale
   in §3.5. `schemaVersion` is deliberate: Day 17 will change the shape.
8. **Extraction confidence is scoped to applications only** (finding 7). Candidate-only ingestion is
   out of scope until AI-107 argues otherwise; the resolution then is a placeholder application or an
   explicit contract change, not a second `extraction` column.
9. **`num_nonnulls(...) = 1` with three nullable FKs on `notes`**, not polymorphic. Real referential
   integrity beats extensibility at three attachable entities.
10. **uuid v4 via `gen_random_uuid()` for every primary key.** Rejected uuid v7: the built-in
    `uuidv7()` is PG 18-only, which Supabase is not guaranteed to be on, so it would need an app-side
    generator — breaking database-side defaults for the raw `INSERT`s Days 5/17 will write. Rejected
    bigserial: these ids reach URLs and agent payloads, where sequential integers leak volume and
    invite enumeration. The upgrade path is a one-line `DEFAULT` change with no data migration, which
    is precisely why uuid beats bigserial.
11. **`timestamptz` everywhere, drizzle `mode: "date"`.** `timestamp without time zone` is the classic
    silent-corruption bug in a domain where interviews span timezones.
12. **No soft delete anywhere.** `jobs.status` provides archive semantics; applications end at
    terminal stages rather than being removed. A `deleted_at` column taxes every later query, and
    Day 5's LLM-written SQL would forget it.
13. **Explicit snake_case column names** rather than drizzle-kit's `casing: "snake_case"`, which must
    be set identically in both `drizzle.config.ts` and the runtime `drizzle()` call or runtime SQL
    silently addresses columns that do not exist.
14. **One file per table under `src/lib/db/schema/`**, glob-referenced by drizzle-kit, rather than a
    single `schema.ts`. Matches the repo's per-unit granularity and keeps Day 13/17/18 diffs
    reviewable; the cost is relative sibling imports for FK references (same-directory, allowed).
15. **`drizzle.config.ts` at the repo root; migrations in `./drizzle/`, committed.** Root matches
    every other tool config and is drizzle-kit's default lookup path; keeping generated SQL out of
    `src/` keeps vitest and coverage globs honest. Requires the `.prettierignore` entry.
16. **`drizzle.config.ts` declares no `dbCredentials`** — measured sufficient for `generate`, `export`
    and `check`, which is what makes the plan offline-verifiable. Consequence: drizzle-kit's
    `migrate`, `push` and `studio` commands do not work as-is; migrations run through
    `scripts/db-migrate.ts`, which keeps `process.env` inside `src/env.ts` per CLAUDE.md. Adding
    credentials later for `studio` is a two-line change.
17. **`pipeline_stages.position` uniqueness is deferrable and lives in the custom migration**
    (finding 6), not in the drizzle builder, because drizzle cannot express `DEFERRABLE`.
18. **Two environment keys, `DATABASE_URL` (pooled) and `DIRECT_DATABASE_URL` (direct).** Supabase's
    transaction pooler breaks DDL and the migrator's advisory locks. Rejected: one key (a known trap)
    and a `SUPABASE_*` key set (we talk to Postgres, not to Supabase's REST API).
19. **`src/env.ts` gets per-key lazy getters.** Required, not cosmetic: with the current single
    getter, a required `DATABASE_URL` would break `env.NODE_ENV` — and the existing status-route test
    — everywhere the URL is absent.
20. **CLI runners live in a new root `scripts/` directory, not in `src/`.** `check-console.sh` fails
    on `console.log` anywhere in `src/**/*.ts`, and a seed script exists to print progress. Using
    `console.info` to slip past that check would be evasion, not a fix. All testable logic — the
    dataset builder and the seed preflight — stays in `src/lib/db/` where vitest can see it.
21. **`pipeline_stages` rows are seeded by a migration, not the demo seed script.** They are reference
    data that the `applications.stage` FK makes a precondition for any insert.
22. **Deterministic hand-authored seed data, no `faker`.** Determinism lets the offline test assert
    exact invariants; `faker`'s lorem prose would make the RAG corpus worthless, and the corpus is the
    point of the free-text columns.
23. **`DATABASE_URL` is declared with no reader in this ticket** — the one deliberate exception to the
    "no consumer in this ticket" rule applied to `client.ts` (finding 9). An env key is a contract
    line in a file whose whole purpose is to be a contract; a client module is code that will be
    rewritten by its first real consumer. Challenge this if the reviewer wants strict symmetry.
24. **`drizzle-zod` is a devDependency in this ticket** (revised in round 3, finding 4 — it was a
    runtime dependency before, which the evidence did not support), used to validate every seed row
    against
    `createInsertSchema(<table>)` in the offline test. A real use, not speculation: it makes AC 5
    verifiable and turns "someone added a NOT NULL column and forgot the seed" into a red test with no
    database.
25. **`relations()` declarations included** even though nothing queries them yet. ~30 declarative
    lines, no runtime cost, and the difference between AI-43/AI-63 writing typed `with: {…}` queries
    and hand-rolling joins. Drop them if the reviewer judges this speculative.
26. **Salary columns on `jobs` were considered and cut**; **`server-only` is deferred to AI-43**,
    which is also where `src/lib/db/client.ts` now lives (finding 9).
27. **The seed populates `extraction` on a subset of applications** (round 2, finding 2) rather than
    leaving the column empty for AI-107 to fill. It costs a dozen hand-written payloads and buys AC 4
    a demonstrable state, an exercised envelope check and index, and a Day 18 gate with something to
    gate. The payload shape is `schemaVersion: 1`, so AI-107 changing it later is a version bump, not
    a rewrite.
28. **Interview scheduling is coherent with stage history by construction** (round 2 finding 3, refined
    by round 3 finding 1): an interview exists only on an application that reached the stage its `kind`
    implies — `screening` for `phone_screen`, `interview` for the rest — and never before it got there.
    Enforced in the seed test, not in the schema: a schema-level version would need a trigger or a
    cross-table check, which is more machinery than the realism is worth.
29. **No offline "schema vs migrations drift" gate in `pnpm check`.** drizzle-kit has no dry-run diff;
    `db:check` only validates the migration folder's internal consistency. Regenerating after a schema
    change stays a reviewer checklist item — see Risks.

### 🔴 Escalations

1. **Row Level Security posture on the hosted Supabase project — surfaced, default applied,
   reversible.**
   Supabase exposes every `public` table through its auto-generated PostgREST API; with RLS disabled
   — the default for tables created by a plain migration — those tables are readable and writable by
   anyone holding the project's `anon` key, which ships to browsers. `candidates` will hold names,
   emails, phone numbers and full resume text.
   **Status:** surfaced to the user; no answer yet. **The stated default is now the decided path:**
   `.enableRLS()` on all seven tables with **zero policies**, declared on the table definitions in
   slices 2–4 and emitted into slice 6's generated migration (measured: it emits
   `ALTER TABLE … ENABLE ROW LEVEL SECURITY`). Deny-by-default closes the
   PostgREST hole and costs our own access path nothing, because the migration and application roles
   own the tables and are not subject to RLS unless `FORCE ROW LEVEL SECURITY` is also set.
   **Consequence for AI-43:** the Postgres-over-MCP server must connect with service/owner
   credentials, not the `anon` or `authenticated` key — otherwise it will read zero rows with no
   obvious cause. This is a hard requirement to carry into that ticket.
   **Reversibility:** a follow-up migration that disables RLS again if the user decides otherwise.
   Nothing blocks on the answer.
   **Still open for the user:** will the hosted project ever hold _real_ candidate PII (real resumes,
   real email addresses), or synthetic training data only? If real data is ever loaded, RLS stops
   being optional and retention/erasure needs a decision beyond this ticket's scope.

2. _(None new in round 2.)_ The seed BLOCKER was resolved by removing the destructive capability
   rather than by guarding it, so it did not become an escalation.

---

## 7. Risks / land-mines

- **Never run drizzle-kit's `push` command on this project.** It introspects the live database and
  reconciles it against the schema files; it would not know about the hand-written custom migration
  objects — the deferrable unique on `pipeline_stages.position`, the `set_updated_at()` triggers, the
  seeded stage rows — and would offer to remove them. `generate` + `migrate` diff against drizzle's
  own snapshot and are safe. The `db:*` scripts deliberately do not expose it.
- **`prettier --check .` versus generated files.** drizzle-kit writes `drizzle/meta/*.json`
  unformatted (measured). Without `drizzle/` in `.prettierignore`, `pnpm check` goes red on files
  nobody edits.
- **Adding an enum value later.** `ALTER TYPE … ADD VALUE` cannot run inside a transaction block.
  drizzle-kit will generate the statement, but it must be applied as its own migration. This is the
  main reason the _pipeline_ is a table rather than an enum; `application_source` and friends still
  carry the cost if they grow.
- **Schema-to-migration drift.** Nothing in `pnpm check` notices a schema edit without a regenerated
  migration. Reviewer checklist item: if `src/lib/db/schema/**` changed, `drizzle/` must have changed
  too.
- **`stage` / transition-log drift.** The projection column can disagree with the history if anyone
  updates `applications.stage` outside the single write path (🟡 #2). Mitigation today is that no
  writer exists; a trigger if that stops being enough.
- **tsx and the `@/` alias.** `scripts/*.ts` imports through `@/`; tsx resolves tsconfig `paths`, but
  this is only _proven_ when slice 8's `pnpm db:seed --dry-run` runs. Fallbacks: add
  `"baseUrl": "."` to `tsconfig.json`, or pass `--tsconfig ./tsconfig.json`.
- **`drizzle.config.ts` must not import through `@/`.** drizzle-kit compiles it with esbuild and
  plain `require`, which does not resolve tsconfig paths. The config imports nothing from `src/`.
- **Supabase pooler.** Migrations and seeds use `DIRECT_DATABASE_URL`. When AI-43 adds the runtime
  client against the pooled `DATABASE_URL`, it must pass `prepare: false` to postgres.js — prepared
  statements do not survive Supavisor's transaction mode — and should add `server-only` to keep the
  connection string out of any client bundle. Neither can be verified before a live instance exists.
- **Local Supabase port/password in `.env.example` is a placeholder** taken from documented
  `supabase start` defaults, not from a running instance. Confirm with `supabase status`.
- **AI-26 (Postgres provisioning) is still Todo.** This ticket ships schema and SQL that nobody can
  apply until AI-26 lands. AC 1 cannot be _observed_ until both are done — offline, we verify the
  dataset that would be inserted, not the insert.
- **`jsonb_exists` versus `?`.** The envelope check deliberately uses the function form; the `?`
  operator collides with parameter placeholders in several client libraries and query tools.
- **Re-seeding.** `db:seed` refuses on a populated database and has no reset path by design (§4).
  Locally, the Supabase CLI's re-initialisation workflow re-runs migrations against an empty
  database; hosted is seeded once.
- **This document deliberately describes destructive SQL verbs in prose rather than writing them
  verbatim.** The harness pre-tool guard blocks table-emptying and object-removal statements, and the
  Supabase reset command, as executable text. The spec loses no meaning by naming them in words.
