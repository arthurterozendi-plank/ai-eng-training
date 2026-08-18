/**
 * Applies every migration in `drizzle/` against `DIRECT_DATABASE_URL` — the Supabase pooler
 * breaks DDL and the migrator's advisory locks (docs/specs/ai-34-domain-model.md §2, §4). This
 * file lives under `scripts/`, not `src/`, because it prints progress and `check-console.sh`
 * fails on `console.log` anywhere under `src/`.
 *
 * `--dry-run` lists the migration files that would be applied without opening a connection —
 * useful for confirming the migration folder's contents with no `.env.local` at all.
 */
import fs from "node:fs";
import path from "node:path";

const MIGRATIONS_FOLDER = path.join(import.meta.dirname, "..", "drizzle");

function listMigrationFiles(): string[] {
  return fs
    .readdirSync(MIGRATIONS_FOLDER)
    .filter((file) => file.endsWith(".sql"))
    .sort();
}

async function main(): Promise<void> {
  const dryRun = process.argv.includes("--dry-run");
  const files = listMigrationFiles();

  if (dryRun) {
    console.log(`[db-migrate] --dry-run: would apply ${files.length} migration(s):`);
    for (const file of files) {
      console.log(`  ${file}`);
    }
    return;
  }

  // Deferred until the dry-run short-circuit above has returned, so a dry run never opens a
  // database connection or reads DIRECT_DATABASE_URL — mirrors scripts/db-seed.ts.
  const [{ env }, { drizzle }, { migrate }, { default: postgres }] = await Promise.all([
    import("@/env"),
    import("drizzle-orm/postgres-js"),
    import("drizzle-orm/postgres-js/migrator"),
    import("postgres"),
  ]);

  const sql = postgres(env.DIRECT_DATABASE_URL, { max: 1 });

  try {
    console.log(`[db-migrate] applying ${files.length} migration(s) from ${MIGRATIONS_FOLDER}...`);
    await migrate(drizzle(sql), { migrationsFolder: MIGRATIONS_FOLDER });
    console.log("[db-migrate] done.");
  } finally {
    await sql.end();
  }
}

main().catch((error: unknown) => {
  console.error("[db-migrate] failed:", error);
  process.exitCode = 1;
});
