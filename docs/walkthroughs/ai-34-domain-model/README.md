# AI-34 — TalentScout domain model

TalentScout had no persistence at all: a recruiter reconstructed a hiring pipeline from an inbox,
and nothing was queryable, chartable, or able to be handed to an agent. This change adds the
seven-table Postgres domain model the rest of the training builds on — `pipeline_stages`, `jobs`,
`candidates`, `applications`, `application_stage_transitions`, `interviews` and `notes` — plus
generated and hand-written migrations and a deterministic 90-application seed dataset. The
decision worth knowing is that `applications.stage` is a text foreign key into a seeded lookup
table rather than a pg enum, so stage order and labels stay queryable data for Day 9's charts and
a stage can be reordered or renamed without an `ALTER TYPE`. All six acceptance criteria are
enforced by the schema and were verified against a real Postgres 17 container; no live database
existed during development, so `pnpm db:migrate` and `pnpm db:seed` are run manually.

**How to use this folder:** open `walkthrough.html` in any browser (one self-contained file, works
offline — click a slice in the rail, then a fragment card to read the diff hunk; ←/→ move between
fragments, Esc returns); `plan.md` has the full executed plan, the decisions log and the follow-ups.
