/**
 * The live-database proof AC 2 needs (AI-43 §5 slice 7): a unit test can assert that the code
 * *asks* for a read-only transaction, but only Postgres can assert that it *refuses* the write.
 * This script connects through the real `runReadOnly` / `READ_ONLY_CONNECTION_OPTIONS` from
 * `src/read-only.ts` — the exact building blocks `src/main.ts` wires into the server — against
 * `DIRECT_DATABASE_URL`, runs the write matrix, the statement-splitting matrix, the GUC-poisoning
 * case, the timeout, the AC 1/AC 3/AC 5 witnesses, a real-stdio round trip — including a
 * notice-producing query, land-mine 4's regression test — and the process-exit / backend-leak
 * checks (review AI-43 round 4, SHOULD 1) — prints one line per case, and exits non-zero if any
 * of them fails.
 *
 * Lives under `scripts/`, not `src/`: it prints progress and opens a real connection and a real
 * subprocess, neither of which belongs in `pnpm check`. `vitest.config.mts`'s `include` is scoped
 * to `src/**\/*.{test,spec}.ts`, so this file never runs under Vitest, and `turbo.json`'s
 * `mcp:verify` task is deliberately excluded from the task graph `pnpm check` walks (AI-43
 * YELLOW-10).
 */
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { env } from "@talentscout/db/env";
import postgres from "postgres";

import { COLUMNS_SQL, ENUMS_SQL, FOREIGN_KEYS_SQL, TABLE_NAMES_SQL, TRIGGERS_SQL } from "@/catalog";
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

/**
 * Review AI-43 round 3, SHOULD 1: `RESET ALL` restores GUCs, not session-level advisory locks.
 * One call takes `pg_advisory_lock` — a statement `BEGIN READ ONLY` never refuses, since it
 * writes nothing — and a *later*, independent call must find it released by the preamble's
 * `pg_advisory_unlock_all()`, or a leaked lock would pin `max: 1`'s single backend for the life
 * of the server process and block anything else that needs one, including the migrator's own
 * advisory locks (README's Database section).
 */
async function checkAdvisoryLockReleasedBetweenCalls(execute: QueryExecutor): Promise<CaseResult> {
  const name = "advisory lock: a lock taken by one call is released before the next";
  const lockId = 987654321;

  await execute(`select pg_advisory_lock(${lockId})`);

  const rows = await execute(
    `select count(*)::int as n from pg_locks where locktype = 'advisory' and objid = ${lockId}`,
  );
  const heldOnNextCall = rows[0]?.n;

  return heldOnNextCall === 0
    ? pass(name, "0 advisory locks held by objid on the next call")
    : fail(name, `expected 0, got ${String(heldOnNextCall)}`);
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
 * Compares two values the way {@link buildRows}-equivalent output must: `postgres.js` parses a
 * `timestamptz` column into a `Date`, and two distinct `Date` instances for the same instant are
 * never `===`, so this reproduction compares by value rather than by reference.
 */
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }
  return a === b;
}

/**
 * The BLOCKER regression (AI-43 review): postgres.js builds each row as a JS object keyed by
 * column name (`node_modules/postgres/src/connection.js`'s `DataRow` handler), so two columns
 * sharing a name collide — the later one silently overwrites the earlier — and `formatQueryResult`
 * then renders the survivor as if it belonged to every colliding column. No error, no notice, and
 * the header still reports the full row count. Every table in this schema carries
 * `id` / `created_at` / `updated_at`, so *any* two-table join hits it, and `select *` over a join
 * is the most likely exploratory query an agent writes.
 *
 * Both reproductions below are the exact statements from the review report. A "truth" query using
 * aliases (never ambiguous, so it never collides) reads the same values independently, so this
 * does not just count keys — it confirms the surviving value is attributed to the *right* column,
 * not merely that some value is present. Confirmed to fail before the fix — the four-column case
 * rendered 3 keys with `id` holding the candidate's id; the `select *` case rendered one `id`
 * equal to `jobs.id`, with `applications.id`, `applications.created_at` and
 * `applications.updated_at` gone — and to pass after it.
 */
async function checkDuplicateColumnsSurvive(execute: QueryExecutor): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  {
    const name =
      'BLOCKER: "select j.id, j.title, c.id, c.full_name from … join …" renders four columns, not three';
    const [truth] = await execute(
      `select j.id as job_id, c.id as candidate_id
       from applications a
       join jobs j on j.id = a.job_id
       join candidates c on c.id = a.candidate_id
       limit 1`,
    );
    const [row] = await execute(
      `select j.id, j.title, c.id, c.full_name
       from applications a
       join jobs j on j.id = a.job_id
       join candidates c on c.id = a.candidate_id
       limit 1`,
    );
    const keys = row ? Object.keys(row) : [];

    const ok =
      keys.length === 4 &&
      !!truth &&
      !!row &&
      sameValue(row.id, truth.job_id) &&
      sameValue(row.id__2, truth.candidate_id) &&
      !sameValue(truth.job_id, truth.candidate_id);

    results.push(
      ok
        ? pass(name, `rendered keys: ${keys.join(", ")}; id -> job, id__2 -> candidate`)
        : fail(name, `rendered keys: ${keys.join(", ")}; row: ${JSON.stringify(row)}`),
    );
  }

  {
    const name =
      'BLOCKER: "select * from applications a join jobs j on j.id = a.job_id limit 1" keeps ' +
      "both tables' id/created_at/updated_at";
    const [truth] = await execute(
      `select a.id as app_id, j.id as job_id, a.created_at as app_created_at,
              j.created_at as job_created_at, a.updated_at as app_updated_at,
              j.updated_at as job_updated_at
       from applications a
       join jobs j on j.id = a.job_id
       limit 1`,
    );
    const [row] = await execute(
      `select * from applications a join jobs j on j.id = a.job_id limit 1`,
    );
    const keys = row ? Object.keys(row) : [];

    const ok =
      keys.length === 23 &&
      !!truth &&
      !!row &&
      sameValue(row.id, truth.app_id) &&
      sameValue(row.id__2, truth.job_id) &&
      sameValue(row.created_at, truth.app_created_at) &&
      sameValue(row.created_at__2, truth.job_created_at) &&
      sameValue(row.updated_at, truth.app_updated_at) &&
      sameValue(row.updated_at__2, truth.job_updated_at);

    results.push(
      ok
        ? pass(name, `rendered ${keys.length} keys; applications.id survived as "id"`)
        : fail(name, `rendered keys: ${keys.join(", ")}; row: ${JSON.stringify(row)}`),
    );
  }

  {
    // Review AI-43 round 4, SHOULD 2: a blind `id`, `id__2`, `id__3`, … counter renames the
    // second "id" to "id__2", colliding with the real column already named that — the later
    // assignment then overwrites it, discarding the value `2` with no error and a notice naming
    // only "id", telling the caller nothing was lost when something was. Confirmed to fail
    // before the fix (rendered `{ id: 1, id__2: 3 }`, two keys, value `2` gone) and to pass after
    // it. `read-only.test.ts` covers the same shape against a hand-built fixture.
    const name = 'SHOULD 2: "select 1 as id, 2 as id__2, 3 as id" does not lose the middle column';
    const [row] = await execute("select 1 as id, 2 as id__2, 3 as id");
    const keys = row ? Object.keys(row) : [];

    const ok = keys.length === 3 && !!row && row.id === 1 && row.id__2 === 2 && row.id__3 === 3;

    results.push(
      ok
        ? pass(name, `rendered keys: ${keys.join(", ")}; id=1, id__2=2, id__3=3`)
        : fail(name, `rendered keys: ${keys.join(", ")}; row: ${JSON.stringify(row)}`),
    );
  }

  return results;
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

/**
 * AC 3's witness: the live catalog, queried with the exact SQL `src/catalog.ts` uses. The
 * trigger count is the six `_set_updated_at` triggers the hand-written migration
 * (`0001_pipeline-stages-seed-and-triggers.sql`) creates — `tgisinternal` excludes the
 * constraint-enforcement triggers Postgres generates for every foreign key, which is why this
 * number is 6, not the much larger count `pg_trigger` holds unfiltered (review AI-43 SHOULD 1).
 */
async function checkCatalogWitness(execute: QueryExecutor): Promise<CaseResult[]> {
  const tables = await execute(TABLE_NAMES_SQL);
  const columns = await execute(COLUMNS_SQL, [null]);
  const foreignKeys = await execute(FOREIGN_KEYS_SQL, [null]);
  const triggers = await execute(TRIGGERS_SQL, [null]);
  const enums = await execute(ENUMS_SQL);
  const enumTypeCount = new Set(enums.map((row) => row.enum_name)).size;

  // Review AI-43 round 3, SHOULD 2: every unit test's fake `execute` only ever sees `[null]` — the
  // array bind-parameter path (`describe-table` always sends `[[table]]`, `schema` sends
  // `[["jobs"]]` when filtered) has no other live coverage. postgres.js serializing a JS array
  // into `$1::text[]` under `unsafe(…, { simple: false })` is what this exercises.
  const jobsColumns = await execute(COLUMNS_SQL, [["jobs"]]);

  const expectations: { name: string; actual: number; expected: number }[] = [
    { name: "AC3 witness: catalog tables", actual: tables.length, expected: 7 },
    { name: "AC3 witness: catalog columns", actual: columns.length, expected: 71 },
    { name: "AC3 witness: catalog foreign keys", actual: foreignKeys.length, expected: 10 },
    { name: "AC3 witness: catalog triggers", actual: triggers.length, expected: 6 },
    { name: "AC3 witness: catalog enum types", actual: enumTypeCount, expected: 6 },
    {
      name: 'AC3 witness: catalog columns filtered by ["jobs"] (array bind parameter)',
      actual: jobsColumns.length,
      expected: 12,
    },
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
 * The seven seeded tables this residue check watches — fixed literals naming this script's own
 * known tables, not caller input, so they are interpolated directly rather than through
 * `quoteValidatedTableName` (AI-43 §4), which exists to validate a tool argument nobody controls
 * here. Names only, deliberately: their row counts are snapshotted fresh at the start of every run
 * (see {@link snapshotTableCounts}) rather than pinned to a literal measured once, so "unchanged"
 * is judged against this run's own seed instead of a volume a reseed would silently invalidate
 * (review AI-43 round 2, NIT).
 */
const RESIDUE_WATCHED_TABLES = [
  "jobs",
  "candidates",
  "applications",
  "application_stage_transitions",
  "interviews",
  "notes",
  "pipeline_stages",
];

/** Reads an exact row count for each of {@link RESIDUE_WATCHED_TABLES}, keyed by table name. */
async function snapshotTableCounts(execute: QueryExecutor): Promise<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const table of RESIDUE_WATCHED_TABLES) {
    const rows = await execute(`select count(*)::int as n from "${table}"`);
    counts[table] = Number(rows[0]?.n ?? Number.NaN);
  }
  return counts;
}

/**
 * Confirms none of the probe statements' near-misses mutated a real table's row count either, by
 * comparing a fresh read against `before` — the snapshot {@link snapshotTableCounts} took at the
 * start of this run, before any probe statement ran.
 */
async function checkTableCountsUnchanged(
  execute: QueryExecutor,
  before: Record<string, number>,
): Promise<CaseResult[]> {
  const results: CaseResult[] = [];

  for (const table of RESIDUE_WATCHED_TABLES) {
    const name = `residue: ${table} row count is unchanged`;
    const rows = await execute(`select count(*)::int as n from "${table}"`);
    const actual = rows[0]?.n;
    const expected = before[table];
    results.push(
      actual === expected
        ? pass(name, `${actual}`)
        : fail(name, `expected ${expected} (measured at run start), got ${String(actual)}`),
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
 * `command`/`args` `.mcp.json` registers. Three properties, from one connection: the `tables`
 * resource is listed and reads back every table (proving AC 4 end to end, the way an agent would
 * see it); the server's own startup banner (`src/main.ts`) names `DIRECT_DATABASE_URL` on
 * stderr — the mechanical evidence that this is the key actually in use, not merely the key this
 * script itself was told to use; and a notice-producing `query` call leaves stdout parseable —
 * the only check in this file that can actually observe land-mine 4 (review AI-43 round 2,
 * SHOULD): the other stdout-purity discipline in this workspace is a manual DoD step
 * (`… run mcp </dev/null | wc -c`) that closes stdin before any query runs, so it is structurally
 * incapable of exercising a notice at all.
 *
 * Also the only case that exercises `describe-table` at all (review AI-43 round 3, SHOULD 2):
 * every other check in this file drives `runReadOnly` directly, never a registered tool, so the
 * array bind-parameter path `describe-table` always takes (`[[table]]`) was otherwise proven only
 * over `checkCatalogWitness`'s direct `execute` call, never through the server's own tool handler
 * and real stdio.
 */
async function checkAc4OverRealStdio(): Promise<CaseResult[]> {
  const resourceName = "AC4: talentscout://tables is listed and readable over real stdio";
  const bannerName = "AC4: the spawned server's banner names DIRECT_DATABASE_URL";
  const noticeName =
    "stdout purity: a notice-producing query leaves no unparseable frame on stdout";
  const describeTableName =
    "SHOULD 2: describe-table exercises the array bind-parameter path over real stdio";

  const launchSpec = readTalentscoutDbLaunchSpec();
  const transport = new StdioClientTransport({
    command: launchSpec.command,
    args: launchSpec.args ?? [],
    stderr: "pipe",
  });
  const client = new Client({ name: "mcp-verify", version: "0.0.0" });

  const stderrChunks: Buffer[] = [];
  transport.stderr?.on("data", (chunk: Buffer) => stderrChunks.push(chunk));

  // Land-mine 4's regression test (review AI-43 round 2, BLOCKER): postgres.js's own default,
  // with no `onnotice` set, writes a Postgres NOTICE straight to stdout via `console.log` —
  // JSON-RPC framing's one exclusive channel. `StdioClientTransport`'s `ReadBuffer` calls
  // `onerror` for every line it cannot parse as JSON-RPC, so zero calls here is the only honest
  // proof that nothing landed on stdout unframed. Attached before `connect()`, matching the
  // stderr listener above, so no early frame is missed.
  const transportErrors: Error[] = [];
  transport.onerror = (error: Error) => transportErrors.push(error);

  try {
    await client.connect(transport);

    const { resources } = await client.listResources();
    if (!resources.some((resource) => resource.uri === "talentscout://tables")) {
      return [
        fail(resourceName, "talentscout://tables was not in listResources()"),
        fail(bannerName, "skipped: the resource was never listed"),
        fail(noticeName, "skipped: the resource was never listed"),
        fail(describeTableName, "skipped: the resource was never listed"),
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

    // A 70-character alias exceeds Postgres's 63-byte identifier limit, so the backend attaches
    // a NOTICE ("identifier … will be truncated to …") to an otherwise ordinary, successful
    // `query` call — no write needed, and no statement this server would ever refuse.
    const noticeSql = `select 1 as ${"a".repeat(70)}`;
    const noticeResult = (await client.callTool({
      name: "query",
      arguments: { sql: noticeSql },
    })) as { isError?: boolean };

    const noticeResultCase =
      noticeResult.isError !== true && transportErrors.length === 0
        ? pass(noticeName, "the notice-producing query succeeded with zero transport parse errors")
        : fail(
            noticeName,
            `isError=${String(noticeResult.isError)}, transport parse errors: ` +
              (transportErrors.length === 0
                ? "none"
                : transportErrors.map((error) => error.message).join(" | ")),
          );

    const describeResult = (await client.callTool({
      name: "describe-table",
      arguments: { table: "jobs" },
    })) as { isError?: boolean; content?: { type: string; text: string }[] };
    const describeText = describeResult.content?.[0]?.text;
    const describePayload = describeText
      ? (JSON.parse(describeText) as { columns?: unknown[] })
      : undefined;
    const describeColumnCount = describePayload?.columns?.length;

    const describeTableResult =
      describeResult.isError !== true && describeColumnCount === 12
        ? pass(describeTableName, `describe-table("jobs") returned ${describeColumnCount} columns`)
        : fail(
            describeTableName,
            `isError=${String(describeResult.isError)}, columns=${String(describeColumnCount)}`,
          );

    return [resourceResult, bannerResult, noticeResultCase, describeTableResult];
  } finally {
    await client.close().catch(() => undefined);
  }
}

/**
 * Force-kills `child`'s entire process group, not just `child` itself — necessary because
 * `.mcp.json`'s command is itself a three-level chain (pnpm -> dotenv-cli -> tsx, per the review's
 * own finding) that inherits stdio straight through by default. Killing only the top process
 * leaves the lower two alive and orphaned (confirmed live: reparented to pid 1, `dotenv-cli`'s
 * `tsx src/main.ts` still running, its Postgres backend still `ESTABLISHED`) — and because they
 * still hold this *script's* own stdout/stdin pipes open on their end, this process's own event
 * loop then never sees EOF and hangs too, past `main`'s own completion. `spawnDetached` pairs with
 * this: `detached: true` makes `child.pid` a process-group id `kill(-pid, …)` can target.
 */
function killProcessTreeIfAlive(child: ChildProcessWithoutNullStreams): void {
  if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) {
    return;
  }
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch {
    // Already gone between the check above and here, or never got a pid — nothing to signal.
  }
}

/** `spawn`, but `detached: true` so the child leads its own process group — see {@link killProcessTreeIfAlive}. */
function spawnDetached(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): ChildProcessWithoutNullStreams {
  return spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], detached: true, env });
}

/** The outcome `closeStdinAndAwaitExit` races: either the child's real `exit` event, or the budget running out first. */
interface ExitOutcome {
  exited: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
}

/**
 * Ends `child`'s stdin and races its `exit` event against `budgetMs`, timed from the moment stdin
 * closes — never from spawn — so slow startup (three process layers: pnpm -> dotenv-cli -> tsx,
 * per `.mcp.json`) never counts against the budget. 8s sits well above the ~1s a healthy exit
 * measures and nowhere near "hangs forever", so a genuine leak still reads as a clear failure
 * rather than flakiness (review AI-43 round 4, SHOULD 1).
 */
async function closeStdinAndAwaitExit(
  child: ChildProcessWithoutNullStreams,
  budgetMs = 8000,
): Promise<{ elapsedMs: number; outcome: ExitOutcome }> {
  const exitPromise = new Promise<ExitOutcome>((resolve) => {
    child.once("exit", (code, signal) => resolve({ exited: true, code, signal }));
  });
  const timeoutPromise = new Promise<ExitOutcome>((resolve) => {
    setTimeout(() => resolve({ exited: false, code: null, signal: null }), budgetMs);
  });

  const start = Date.now();
  child.stdin.end();
  const outcome = await Promise.race([exitPromise, timeoutPromise]);

  return { elapsedMs: Date.now() - start, outcome };
}

function describeExitOutcome(outcome: ExitOutcome, elapsedMs: number): string {
  return outcome.exited
    ? `exited code=${String(outcome.code)} sig=${String(outcome.signal)} after ${elapsedMs}ms`
    : `still running ${elapsedMs}ms after stdin close -> process leaked`;
}

/** Waits until `child`'s stderr has emitted `substring` (`src/main.ts`'s ready banner), or rejects after `timeoutMs`. */
function waitForStderrIncludes(
  child: ChildProcessWithoutNullStreams,
  substring: string,
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`timed out waiting for stderr to include "${substring}"; got: ${buffer}`));
    }, timeoutMs);

    function onData(chunk: Buffer): void {
      buffer += chunk.toString("utf8");
      if (buffer.includes(substring)) {
        cleanup();
        resolve();
      }
    }
    function cleanup(): void {
      clearTimeout(timeout);
      child.stderr.off("data", onData);
    }

    child.stderr.on("data", onData);
  });
}

function sendJsonRpc(
  child: ChildProcessWithoutNullStreams,
  message: Record<string, unknown>,
): void {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

/**
 * Reads one newline-delimited JSON-RPC message at a time off `stream` (the framing
 * `shared/stdio.js` uses), buffering across `data` events in case a message arrives split across
 * chunks. Returns a puller rather than an array so a caller can `await` exactly the next message
 * after sending a request, the way a real client's request/response round trip works.
 */
function createJsonRpcReader(stream: NodeJS.ReadableStream): () => Promise<unknown> {
  let buffer = "";
  const queue: unknown[] = [];
  const waiters: ((value: unknown) => void)[] = [];

  stream.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      const message: unknown = JSON.parse(line);
      const waiter = waiters.shift();
      if (waiter) {
        waiter(message);
      } else {
        queue.push(message);
      }
      newlineIndex = buffer.indexOf("\n");
    }
  });

  return () =>
    new Promise((resolve) => {
      const queued = queue.shift();
      if (queued !== undefined) {
        resolve(queued);
        return;
      }
      waiters.push(resolve);
    });
}

/**
 * Speaks just enough raw JSON-RPC to run one `initialize` handshake and one `query` tool call
 * against `child` — deliberately not the SDK's `Client` + `StdioClientTransport`: that transport's
 * own `close()` (`client/stdio.js`) ends stdin, waits up to 2s, then escalates to `SIGTERM` and
 * `SIGKILL`. That escalation exists precisely to paper over a server that never exits on its own —
 * using it here would hide the exact hang {@link checkExitsAfterStdinCloseWithQuery} exists to
 * catch behind its own cleanup, rather than measuring it.
 */
async function runProbeQueryOverRawStdio(
  child: ChildProcessWithoutNullStreams,
): Promise<{ ok: boolean; detail: string }> {
  const readMessage = createJsonRpcReader(child.stdout);

  sendJsonRpc(child, {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "mcp-verify-exit-probe", version: "0.0.0" },
    },
  });
  const initializeResponse = (await readMessage()) as { error?: { message: string } };
  if (initializeResponse.error) {
    return { ok: false, detail: `initialize failed: ${initializeResponse.error.message}` };
  }

  sendJsonRpc(child, { jsonrpc: "2.0", method: "notifications/initialized" });

  sendJsonRpc(child, {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "query", arguments: { sql: "select 1" } },
  });
  const queryResponse = (await readMessage()) as {
    error?: { message: string };
    result?: { isError?: boolean };
  };
  if (queryResponse.error) {
    return { ok: false, detail: `query call failed: ${queryResponse.error.message}` };
  }
  if (queryResponse.result?.isError) {
    return { ok: false, detail: `query call returned isError: ${JSON.stringify(queryResponse)}` };
  }

  return { ok: true, detail: "query succeeded" };
}

/** Opens a short-lived probe connection and counts backends carrying `applicationName`, then closes it. */
async function countBackends(applicationName: string): Promise<number> {
  const sql = postgres(env.DIRECT_DATABASE_URL, READ_ONLY_CONNECTION_OPTIONS);
  try {
    const rows =
      await sql`select count(*)::int as n from pg_stat_activity where application_name = ${applicationName}`;
    return Number(rows[0]?.n ?? 0);
  } finally {
    await sql.end();
  }
}

/**
 * Review AI-43 round 4, SHOULD 1's no-query witness: spawns the exact `talentscout-db` process
 * `.mcp.json` registers, waits for its ready banner, closes stdin without ever sending a query,
 * and asserts it exits — this is the shape the DoD's manual `… run mcp </dev/null | wc -c` check
 * already covers structurally (stdin closes before any query can open a Postgres backend), kept
 * here so both halves of the fix live in one place and one green run proves both.
 */
async function checkExitsAfterStdinCloseNoQuery(
  launchSpec: McpJsonServerEntry,
): Promise<CaseResult> {
  const name = "process exit: no query, stdin closed -> exits (review AI-43 round 4, SHOULD 1)";
  let child: ChildProcessWithoutNullStreams | undefined;

  try {
    child = spawnDetached(launchSpec.command, launchSpec.args ?? []);
    await waitForStderrIncludes(child, "ready");

    const { elapsedMs, outcome } = await closeStdinAndAwaitExit(child);
    return outcome.exited && outcome.code === 0
      ? pass(name, describeExitOutcome(outcome, elapsedMs))
      : fail(name, describeExitOutcome(outcome, elapsedMs));
  } catch (error) {
    return fail(name, `threw: ${errorMessage(error)}`);
  } finally {
    if (child) {
      killProcessTreeIfAlive(child);
    }
  }
}

/**
 * Review AI-43 round 4, SHOULD 1's real witness: spawns the exact `talentscout-db` process
 * `.mcp.json` registers with a unique `PGAPPNAME`, runs one `query` call over it, confirms that
 * call actually opened a backend under that name (so "0 after" cannot pass vacuously because
 * nothing ever connected), closes stdin, and asserts both that the process exits promptly and
 * that the backend it opened is gone afterwards — the exact gap the manual DoD check
 * (`… run mcp </dev/null | wc -c`, which closes stdin before any query runs) cannot see.
 */
async function checkExitsAfterStdinCloseWithQuery(
  launchSpec: McpJsonServerEntry,
): Promise<CaseResult[]> {
  const exitName =
    "process exit: after one query, stdin closed -> exits (review AI-43 round 4, SHOULD 1)";
  const backendName =
    "process exit: the query's Postgres backend is released, not leaked (review AI-43 round 4, SHOULD 1)";

  const probeAppName = `mcp_verify_exit_probe_${process.pid}_${Date.now()}`;
  let child: ChildProcessWithoutNullStreams | undefined;

  try {
    child = spawnDetached(launchSpec.command, launchSpec.args ?? [], {
      ...process.env,
      PGAPPNAME: probeAppName,
    });
    await waitForStderrIncludes(child, "ready");

    const probe = await runProbeQueryOverRawStdio(child);
    if (!probe.ok) {
      return [
        fail(exitName, `the probe query itself failed: ${probe.detail}`),
        fail(backendName, "skipped: the probe query itself failed"),
      ];
    }

    const backendCountBeforeClose = await countBackends(probeAppName);

    const { elapsedMs, outcome } = await closeStdinAndAwaitExit(child);
    const exitResult =
      outcome.exited && outcome.code === 0
        ? pass(exitName, describeExitOutcome(outcome, elapsedMs))
        : fail(exitName, describeExitOutcome(outcome, elapsedMs));

    // A short grace period for the backend's own socket teardown to land in pg_stat_activity, on
    // top of the process itself having already exited above.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const backendCountAfterClose = await countBackends(probeAppName);

    const backendResult =
      backendCountBeforeClose > 0 && backendCountAfterClose === 0
        ? pass(
            backendName,
            `present before close (n=${backendCountBeforeClose}), released after (n=${backendCountAfterClose})`,
          )
        : fail(backendName, `before=${backendCountBeforeClose}, after=${backendCountAfterClose}`);

    return [exitResult, backendResult];
  } catch (error) {
    const detail = `threw: ${errorMessage(error)}`;
    return [fail(exitName, detail), fail(backendName, detail)];
  } finally {
    if (child) {
      killProcessTreeIfAlive(child);
    }
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
    // Snapshotted before any probe statement runs, so `checkTableCountsUnchanged` judges
    // "unchanged" against this run's own seed rather than a literal a reseed would invalidate.
    const tableCountsBefore = await snapshotTableCounts(execute);

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
    results.push(await checkAdvisoryLockReleasedBetweenCalls(execute));
    results.push(await checkTimeout(execute));
    results.push(...(await checkDuplicateColumnsSurvive(execute)));
    results.push(await checkCandidateCountWitness(execute));
    results.push(...(await checkCatalogWitness(execute)));
    results.push(await checkMalformedQueryWitness(execute));
    results.push(await checkTruncationWitness(execute));
    results.push(await checkNoResidue(execute));
    results.push(...(await checkTableCountsUnchanged(execute, tableCountsBefore)));
  } finally {
    await sql.end();
  }

  results.push(...(await checkAc4OverRealStdio()));

  // Review AI-43 round 4, SHOULD 1: separate spawns of the exact `.mcp.json` process, one per
  // case, so the query case's `PGAPPNAME` probe and the backend-leak check it drives never
  // interfere with the no-query case's timing.
  const launchSpec = readTalentscoutDbLaunchSpec();
  results.push(await checkExitsAfterStdinCloseNoQuery(launchSpec));
  results.push(...(await checkExitsAfterStdinCloseWithQuery(launchSpec)));

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
