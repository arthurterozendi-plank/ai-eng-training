/**
 * The live-database proof AC 2 needs (AI-43 §5 slice 7): a unit test can assert that the code
 * *asks* for a read-only transaction, but only Postgres can assert that it *refuses* the write.
 * This script connects through the real `runReadOnly` / `READ_ONLY_CONNECTION_OPTIONS` from
 * `src/read-only.ts` — the exact building blocks `src/main.ts` wires into the server — against
 * `DIRECT_DATABASE_URL`, runs the write matrix, the statement-splitting matrix, the GUC-poisoning
 * case, the timeout, the AC 1/AC 3/AC 5 witnesses and a real-stdio round trip, prints one line per
 * case, and exits non-zero if any of them fails.
 *
 * Lives under `scripts/`, not `src/`: it prints progress and opens a real connection and a real
 * subprocess, neither of which belongs in `pnpm check`. `vitest.config.mts`'s `include` is scoped
 * to `src/**\/*.{test,spec}.ts`, so this file never runs under Vitest, and `turbo.json`'s
 * `mcp:verify` task is deliberately excluded from the task graph `pnpm check` walks (AI-43
 * YELLOW-10).
 */
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { env } from "@talentscout/db/env";
import postgres from "postgres";

import { COLUMNS_SQL, ENUMS_SQL, FOREIGN_KEYS_SQL, TABLE_NAMES_SQL } from "@/catalog";
import { formatQueryError, formatQueryResult, MAX_ROWS_DEFAULT } from "@/format";
import { READ_ONLY_CONNECTION_OPTIONS, runReadOnly, STATEMENT_TIMEOUT_MS } from "@/read-only";
import type { QueryExecutor } from "@/server";

/**
 * Every relation this script's own probe statements try to create is named with this prefix, so
 * the residue check at the end can find all of them with one `pg_class` query regardless of which
 * matrix case is responsible. None of them should ever exist — every probe is expected to be
 * refused before Postgres creates anything.
 */
const PROBE_PREFIX = "mcp_verify_probe_";

/** One case: a name for the printed line, and the outcome that decided it. */
interface CaseResult {
  readonly name: string;
  readonly pass: boolean;
  readonly detail: string;
}

function pass(name: string, detail: string): CaseResult {
  return { name, pass: true, detail };
}

function fail(name: string, detail: string): CaseResult {
  return { name, pass: false, detail };
}

/** Reads `error.code` off an unknown thrown value, the way `postgres.PostgresError` carries a SQLSTATE. */
function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) {
    return undefined;
  }
  const value = (error as Record<string, unknown>).code;
  return typeof value === "string" ? value : undefined;
}

/** Reads `error.message`, falling back to `String(error)` for a non-Error throw. */
function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const value = (error as Record<string, unknown>).message;
    if (typeof value === "string") {
      return value;
    }
  }
  return String(error);
}

/**
 * Runs `statement` and asserts it is rejected with SQLSTATE `expectedCode` — the shape every
 * write-matrix and statement-splitting-matrix case shares. A statement that *succeeds* is a
 * failure here, not a skip: that is what makes the DoD's falsification checks (removing
 * `{ simple: false }`, moving the connection option) surface as a reported failure rather than a
 * silently green run.
 */
async function expectRejected(
  execute: QueryExecutor,
  name: string,
  statement: string,
  expectedCode: string,
): Promise<CaseResult> {
  try {
    await execute(statement);
    return fail(name, `expected SQLSTATE ${expectedCode}, but the statement succeeded`);
  } catch (error) {
    const code = errorCode(error);
    if (code === expectedCode) {
      return pass(name, `rejected with SQLSTATE ${code}`);
    }
    return fail(
      name,
      `expected SQLSTATE ${expectedCode}, got ${code ?? "no SQLSTATE"} (${errorMessage(error)})`,
    );
  }
}

/**
 * Land-mine 1: every one of these must be refused with `25006` — `BEGIN READ ONLY` rejecting the
 * statement outright. The `do $$ … $$` case is the PL/pgSQL-does-not-escape regression: it wraps
 * the same `create temp table` a plain write would run.
 */
const WRITE_MATRIX: { name: string; statement: string }[] = [
  { name: "insert", statement: `insert into jobs (title) values ('${PROBE_PREFIX}insert')` },
  { name: "update", statement: "update jobs set title = title where false" },
  { name: "delete", statement: "delete from jobs where false" },
  { name: "create table", statement: `create table ${PROBE_PREFIX}table (a int)` },
  { name: "create temp table", statement: `create temp table ${PROBE_PREFIX}temp (a int)` },
  { name: "drop table", statement: `drop table if exists ${PROBE_PREFIX}dropped` },
  { name: "grant", statement: "grant select on jobs to postgres" },
  {
    name: "do $$ … $$ (PL/pgSQL does not escape)",
    statement: `do $$ begin create temp table ${PROBE_PREFIX}do (a int); end $$`,
  },
];

/**
 * Land-mine 1's regression test and the reason this slice exists in this form: each payload opens
 * with a statement that would end or never open a transaction, hoping the simple query protocol
 * runs the rest of the message outside `BEGIN READ ONLY`. `{ simple: false }` must refuse to parse
 * more than one statement per message, so every case here is `42601`, never `25006` — the *shape*
 * of the rejection is the property under test, not just that one exists.
 */
const SPLIT_MATRIX: { name: string; statement: string }[] = [
  { name: "commit; …", statement: `commit; create temp table ${PROBE_PREFIX}escaped (a int)` },
  { name: "rollback; …", statement: `rollback; create temp table ${PROBE_PREFIX}escaped (a int)` },
  { name: "end; …", statement: `end; create temp table ${PROBE_PREFIX}escaped (a int)` },
  { name: "select 1; select 2", statement: "select 1; select 2" },
];

/** Runs `show default_transaction_read_only` and asserts it reads `on` — land-mine 1c's live check. */
async function checkGucOn(execute: QueryExecutor, name: string): Promise<CaseResult> {
  const rows = await execute("show default_transaction_read_only");
  const value = rows[0]?.default_transaction_read_only;
  return value === "on"
    ? pass(name, "show default_transaction_read_only = on")
    : fail(name, `show default_transaction_read_only = ${String(value)}`);
}

/**
 * Land-mine 1b: `SET SESSION default_transaction_read_only = off` is accepted inside a read-only
 * transaction and would otherwise persist on the pooled connection. Asserts the primary guarantee
 * does not depend on the GUC (a *following* write is still `25006`) and that the pre-transaction
 * `RESET ALL` re-armed the fallback before the next call ever saw it.
 */
async function checkPoisoningDoesNotStick(execute: QueryExecutor): Promise<CaseResult[]> {
  await execute("set session default_transaction_read_only = off");

  const followingWrite = await expectRejected(
    execute,
    "poisoning: a following write is still refused",
    `insert into jobs (title) values ('${PROBE_PREFIX}poison')`,
    "25006",
  );
  const gucRestored = await checkGucOn(
    execute,
    "poisoning: RESET ALL re-arms the fallback before the next call",
  );

  return [followingWrite, gucRestored];
}

/** `select pg_sleep(12)` must be cancelled by `SET LOCAL statement_timeout`, well inside a 2s margin. */
async function checkTimeout(execute: QueryExecutor): Promise<CaseResult> {
  const name = "timeout: pg_sleep(12) is cancelled by statement_timeout";
  const budgetMs = STATEMENT_TIMEOUT_MS + 2000;
  const start = Date.now();

  try {
    await execute("select pg_sleep(12)");
    return fail(name, "expected SQLSTATE 57014, but the statement succeeded");
  } catch (error) {
    const elapsed = Date.now() - start;
    const code = errorCode(error);

    if (code === "57014" && elapsed <= budgetMs) {
      return pass(name, `rejected with SQLSTATE 57014 after ${elapsed}ms (budget ${budgetMs}ms)`);
    }
    return fail(
      name,
      `SQLSTATE ${code ?? "none"} after ${elapsed}ms (budget ${budgetMs}ms): ${errorMessage(error)}`,
    );
  }
}

/**
 * AC 1's real witness: 60 is written down nowhere in this repository, so a schema-file answer
 * cannot produce it — only a real query against the seeded database can.
 */
async function checkCandidateCountWitness(execute: QueryExecutor): Promise<CaseResult> {
  const name = "AC1 witness: select count(*)::int from candidates";
  const rows = await execute("select count(*)::int from candidates");
  const value = rows[0]?.count;
  return value === 60
    ? pass(name, "60 — present in no file in this repository")
    : fail(name, `expected 60, got ${String(value)}`);
}

/** AC 3's witness: the live catalog, queried with the exact SQL `src/catalog.ts` uses. */
async function checkCatalogWitness(execute: QueryExecutor): Promise<CaseResult[]> {
  const tables = await execute(TABLE_NAMES_SQL);
  const columns = await execute(COLUMNS_SQL, [null]);
  const foreignKeys = await execute(FOREIGN_KEYS_SQL, [null]);
  const enums = await execute(ENUMS_SQL);
  const enumTypeCount = new Set(enums.map((row) => row.enum_name)).size;

  const expectations: { name: string; actual: number; expected: number }[] = [
    { name: "AC3 witness: catalog tables", actual: tables.length, expected: 7 },
    { name: "AC3 witness: catalog columns", actual: columns.length, expected: 71 },
    { name: "AC3 witness: catalog foreign keys", actual: foreignKeys.length, expected: 10 },
    { name: "AC3 witness: catalog enum types", actual: enumTypeCount, expected: 6 },
  ];

  return expectations.map(({ name, actual, expected }) =>
    actual === expected
      ? pass(name, `${actual}`)
      : fail(name, `expected ${expected}, got ${actual}`),
  );
}

/** AC 5's first witness: a malformed query renders usable text — the Postgres message and its SQLSTATE. */
async function checkMalformedQueryWitness(execute: QueryExecutor): Promise<CaseResult> {
  const name = 'AC5 witness: "slect * from jobs" renders usable error text';
  try {
    await execute("slect * from jobs");
    return fail(name, "expected a syntax error, but the query succeeded");
  } catch (error) {
    const text = formatQueryError(error);
    const hasMessage = text.includes('syntax error at or near "slect"');
    const hasCode = text.includes("42601");
    return hasMessage && hasCode
      ? pass(name, "rendered text carries the Postgres message and SQLSTATE 42601")
      : fail(name, `rendered text: ${text}`);
  }
}

/** AC 5's second witness: a huge result set states its own truncation — shown, total, and the cap. */
async function checkTruncationWitness(execute: QueryExecutor): Promise<CaseResult> {
  const name = 'AC5 witness: "select id from application_stage_transitions" states its truncation';
  const rows = await execute("select id from application_stage_transitions");
  const text = formatQueryResult(rows, MAX_ROWS_DEFAULT);
  const header = text.split("\n\n")[0] ?? text;

  const ok =
    header.includes(String(MAX_ROWS_DEFAULT)) &&
    header.includes("299") &&
    header.toLowerCase().includes("truncat");
  return ok ? pass(name, header) : fail(name, `header did not state shown/total/cap: ${header}`);
}

/**
 * Every probe statement above is expected to be refused, so nothing should exist afterwards.
 * Queries `pg_class` for anything matching {@link PROBE_PREFIX} rather than trusting silence —
 * this is what would catch a bypass that created a table the script's own assertions missed.
 */
async function checkNoResidue(execute: QueryExecutor): Promise<CaseResult> {
  const name = "residue: no relation left behind by any probe statement";
  const rows = await execute("select relname from pg_class where relname like $1", [
    `${PROBE_PREFIX}%`,
  ]);
  return rows.length === 0
    ? pass(name, "zero matching relations")
    : fail(name, `found: ${rows.map((row) => String(row.relname)).join(", ")}`);
}

/**
 * The seven seeded tables' row counts, measured in AI-43 §2 and unchanged by any probe above —
 * fixed literals naming this script's own known tables, not caller input, so they are
 * interpolated directly rather than through `quoteValidatedTableName` (AI-43 §4), which exists to
 * validate a tool argument nobody controls here.
 */
const EXPECTED_TABLE_COUNTS: Record<string, number> = {
  jobs: 8,
  candidates: 60,
  applications: 90,
  application_stage_transitions: 299,
  interviews: 43,
  notes: 120,
  pipeline_stages: 7,
};

/** Confirms none of the probe statements' near-misses mutated a real table's row count either. */
async function checkTableCountsUnchanged(execute: QueryExecutor): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (const [table, expected] of Object.entries(EXPECTED_TABLE_COUNTS)) {
    const name = `residue: ${table} row count is unchanged`;
    const rows = await execute(`select count(*)::int as n from "${table}"`);
    const actual = rows[0]?.n;
    results.push(
      actual === expected
        ? pass(name, `${actual}`)
        : fail(name, `expected ${expected}, got ${String(actual)}`),
    );
  }

  return results;
}

/** The `talentscout-db` entry this script reads out of the repository's own `.mcp.json`. */
interface McpJsonServerEntry {
  command: string;
  args?: string[];
}

/**
 * Reads `command`/`args` for `talentscout-db` straight out of root `.mcp.json` rather than
 * duplicating them here — the AC 4 check below then spawns the exact process Claude Code would,
 * and a future change to the registered entry (§5 slice 6) is picked up automatically instead of
 * silently drifting out of sync with what this script tests.
 */
function readTalentscoutDbLaunchSpec(): McpJsonServerEntry {
  const mcpJsonPath = path.join(import.meta.dirname, "../../../.mcp.json");
  const parsed = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8")) as {
    mcpServers?: Record<string, McpJsonServerEntry>;
  };
  const entry = parsed.mcpServers?.["talentscout-db"];

  if (!entry) {
    throw new Error(`.mcp.json has no "talentscout-db" entry at ${mcpJsonPath}`);
  }
  return entry;
}

/**
 * AC 4, over a real subprocess and real stdio — not `InMemoryTransport` — spawned with the exact
 * `command`/`args` `.mcp.json` registers. Two properties, from one connection: the `tables`
 * resource is listed and reads back every table (proving AC 4 end to end, the way an agent would
 * see it), and the server's own startup banner (`src/main.ts`) names `DIRECT_DATABASE_URL` on
 * stderr — the mechanical evidence that this is the key actually in use, not merely the key this
 * script itself was told to use.
 */
async function checkAc4OverRealStdio(): Promise<CaseResult[]> {
  const resourceName = "AC4: talentscout://tables is listed and readable over real stdio";
  const bannerName = "AC4: the spawned server's banner names DIRECT_DATABASE_URL";

  const launchSpec = readTalentscoutDbLaunchSpec();
  const transport = new StdioClientTransport({
    command: launchSpec.command,
    args: launchSpec.args ?? [],
    stderr: "pipe",
  });
  const client = new Client({ name: "mcp-verify", version: "0.0.0" });

  const stderrChunks: Buffer[] = [];
  transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  try {
    await client.connect(transport);

    const { resources } = await client.listResources();
    if (!resources.some((resource) => resource.uri === "talentscout://tables")) {
      return [
        fail(resourceName, "talentscout://tables was not in listResources()"),
        fail(bannerName, "skipped: the resource was never listed"),
      ];
    }

    const result = await client.readResource({ uri: "talentscout://tables" });
    const content = result.contents[0];
    const isJson =
      content !== undefined && "text" in content && content.mimeType === "application/json";
    const payload = isJson
      ? (JSON.parse((content as { text: string }).text) as unknown)
      : undefined;
    const tableCount = Array.isArray(payload) ? payload.length : -1;

    const resourceResult =
      isJson && tableCount === 7
        ? pass(
            resourceName,
            `read ${tableCount} tables via "${launchSpec.command} ${(launchSpec.args ?? []).join(" ")}"`,
          )
        : fail(resourceName, `unexpected payload (isJson=${isJson}, tableCount=${tableCount})`);

    const stderrText = Buffer.concat(stderrChunks).toString("utf8");
    const bannerResult = stderrText.includes("DIRECT_DATABASE_URL")
      ? pass(bannerName, "stderr banner names DIRECT_DATABASE_URL")
      : fail(bannerName, `stderr did not mention DIRECT_DATABASE_URL: ${stderrText.trim()}`);

    return [resourceResult, bannerResult];
  } finally {
    await client.close().catch(() => undefined);
  }
}

function printResult(result: CaseResult): void {
  console.log(`[${result.pass ? " OK " : "FAIL"}] ${result.name} — ${result.detail}`);
}

async function main(): Promise<void> {
  const { hostname, port, pathname } = new URL(env.DIRECT_DATABASE_URL);
  console.log(
    `[mcp:verify] connecting through env.DIRECT_DATABASE_URL (${hostname}:${port}${pathname})`,
  );

  // Built from runReadOnly + READ_ONLY_CONNECTION_OPTIONS directly, rather than through
  // createReadOnlyExecutor, so this script keeps a handle on `sql` to close cleanly in `finally`
  // — mirroring db-migrate.ts / db-seed.ts. It is otherwise the identical mechanism: same
  // options constant, same function, same code path src/main.ts wires into the real server.
  const sql = postgres(env.DIRECT_DATABASE_URL, READ_ONLY_CONNECTION_OPTIONS);
  const execute: QueryExecutor = (statement, params) => runReadOnly(sql, statement, params);

  const results: CaseResult[] = [];

  try {
    for (const testCase of WRITE_MATRIX) {
      results.push(
        await expectRejected(execute, `write: ${testCase.name}`, testCase.statement, "25006"),
      );
    }

    for (const testCase of SPLIT_MATRIX) {
      results.push(
        await expectRejected(
          execute,
          `statement-splitting: ${testCase.name}`,
          testCase.statement,
          "42601",
        ),
      );
    }

    results.push(await checkGucOn(execute, "guc: default_transaction_read_only is on"));
    results.push(...(await checkPoisoningDoesNotStick(execute)));
    results.push(await checkTimeout(execute));
    results.push(await checkCandidateCountWitness(execute));
    results.push(...(await checkCatalogWitness(execute)));
    results.push(await checkMalformedQueryWitness(execute));
    results.push(await checkTruncationWitness(execute));
    results.push(await checkNoResidue(execute));
    results.push(...(await checkTableCountsUnchanged(execute)));
  } finally {
    await sql.end();
  }

  results.push(...(await checkAc4OverRealStdio()));

  for (const result of results) {
    printResult(result);
  }

  const failed = results.filter((result) => !result.pass);
  if (failed.length > 0) {
    console.error(`[mcp:verify] ${failed.length} of ${results.length} case(s) FAILED.`);
    process.exitCode = 1;
  } else {
    console.log(`[mcp:verify] all ${results.length} case(s) passed.`);
  }
}

main().catch((error: unknown) => {
  console.error("[mcp:verify] failed:", error);
  process.exitCode = 1;
});
