/**
 * Inserts `buildSeedDataset`'s deterministic demo dataset into the six demo tables — `jobs`,
 * `candidates`, `applications`, `application_stage_transitions`, `interviews`, `notes` —
 * against `DIRECT_DATABASE_URL`, in one transaction, parents before children. `pipeline_stages`
 * is excluded: the migration owns those rows.
 *
 * Refuses if any target table already has rows (`assertSeedTargetsEmpty`) and has no reset
 * path at all — see docs/specs/ai-34-domain-model.md §4 "Seed re-run semantics". Locally, start
 * over with the Supabase CLI's re-initialisation workflow (see README.md); hosted is seeded
 * once.
 *
 * `--dry-run` builds and prints the dataset without ever importing a database client or reading
 * `@/env` — the imports for both are deferred below the dry-run short-circuit — so it runs with
 * no `.env.local` at all.
 *
 * Lives under `scripts/`, not `src/`: it prints progress, and `check-console.sh` fails on
 * `console.log` anywhere under `src/`.
 */
import { count } from "drizzle-orm";

import { applicationStageTransitions } from "@/schema/application-stage-transitions";
import { applications } from "@/schema/applications";
import { candidates } from "@/schema/candidates";
import { interviews } from "@/schema/interviews";
import { jobs } from "@/schema/jobs";
import { notes } from "@/schema/notes";
import { buildSeedDataset } from "@/seed-data";
import { assertSeedTargetsEmpty } from "@/seed-preflight";

function printCounts(label: string, counts: Readonly<Record<string, number>>): void {
  console.log(`[db-seed] ${label}:`);
  for (const [table, rowCount] of Object.entries(counts)) {
    console.log(`  ${table}: ${rowCount}`);
  }
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const dataset = buildSeedDataset({ now: new Date() });

  const datasetCounts = {
    jobs: dataset.jobs.length,
    candidates: dataset.candidates.length,
    applications: dataset.applications.length,
    application_stage_transitions: dataset.stageTransitions.length,
    interviews: dataset.interviews.length,
    notes: dataset.notes.length,
  };

  printCounts("dataset built", datasetCounts);

  if (dryRun) {
    console.log("[db-seed] --dry-run: not connecting to a database.");
    return;
  }

  // Deferred until the dry-run short-circuit above has returned, so a dry run never opens a
  // database connection or reads DIRECT_DATABASE_URL.
  const [{ env }, { drizzle }, { default: postgres }] = await Promise.all([
    import("@/env"),
    import("drizzle-orm/postgres-js"),
    import("postgres"),
  ]);

  const sql = postgres(env.DIRECT_DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  try {
    await db.transaction(async (tx) => {
      const [
        [jobRow],
        [candidateRow],
        [applicationRow],
        [transitionRow],
        [interviewRow],
        [noteRow],
      ] = await Promise.all([
        tx.select({ value: count() }).from(jobs),
        tx.select({ value: count() }).from(candidates),
        tx.select({ value: count() }).from(applications),
        tx.select({ value: count() }).from(applicationStageTransitions),
        tx.select({ value: count() }).from(interviews),
        tx.select({ value: count() }).from(notes),
      ]);

      const existingCounts = {
        jobs: Number(jobRow.value),
        candidates: Number(candidateRow.value),
        applications: Number(applicationRow.value),
        application_stage_transitions: Number(transitionRow.value),
        interviews: Number(interviewRow.value),
        notes: Number(noteRow.value),
      };

      assertSeedTargetsEmpty(existingCounts);

      console.log("[db-seed] target tables are empty, inserting...");

      await tx.insert(jobs).values(dataset.jobs);
      await tx.insert(candidates).values(dataset.candidates);
      await tx.insert(applications).values(dataset.applications);
      await tx.insert(applicationStageTransitions).values(dataset.stageTransitions);
      await tx.insert(interviews).values(dataset.interviews);
      await tx.insert(notes).values(dataset.notes);
    });

    console.log("[db-seed] done.");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("[db-seed] failed:", error);
  process.exitCode = 1;
});
