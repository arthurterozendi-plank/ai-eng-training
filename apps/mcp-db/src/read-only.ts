import postgres from "postgres";

/**
 * Statement timeout applied inside every read-only transaction, in milliseconds. Every honest
 * query against this database's ~627 rows returns in milliseconds; 10s sits well inside Claude
 * Code's own tool-call timeout while still catching a runaway join quickly.
 */
export const STATEMENT_TIMEOUT_MS = 10_000;

/**
 * The `postgres()` options that open a connection pinned to a single, forced-read-only backend.
 *
 * `connection.options` sets `default_transaction_read_only` at connection startup — the
 * fallback that only matters if the extended-protocol flag ({@link runReadOnly}'s
 * `{ simple: false }`) is ever lost. It must stay nested under `connection`: a top-level
 * `options` key is silently ignored by postgres.js, leaving the GUC off with no error. `max: 1`
 * pins the pool to one backend so the `RESET ALL` issued before every transaction always lands
 * on the connection the next `BEGIN READ ONLY` gets.
 *
 * `onnotice` is not optional here. postgres.js's own default, with no `onnotice` set, is
 * `console.log(parseError(notice))` (`node_modules/postgres/src/connection.js`) — stdout, the
 * channel `StdioServerTransport` owns exclusively for JSON-RPC framing (`src/main.ts`'s "every
 * diagnostic goes to `console.error`" invariant). Any statement Postgres attaches a NOTICE or
 * WARNING to — identifier truncation, a called function's `RAISE NOTICE`, a cast warning — would
 * otherwise write an unframed line straight into the response stream with no query needed.
 * Redirecting it to `console.error` keeps the notice text visible for debugging without
 * corrupting stdout.
 */
export const READ_ONLY_CONNECTION_OPTIONS = {
  connection: {
    options: "-c default_transaction_read_only=on",
  },
  max: 1,
  onnotice: (notice: postgres.Notice) => {
    console.error("[talentscout-db] notice:", notice);
  },
};

/**
 * Runs exactly one statement against `sql` inside a read-only transaction, returning its rows.
 *
 * Four details each carry a measured security property and must not move:
 * - `RESET ALL` runs **before** opening the transaction, not after — a call that throws would
 *   skip an after-the-fact cleanup exactly when a poisoned session (a prior `SET SESSION
 *   default_transaction_read_only = off`) needs reversing.
 * - `select pg_advisory_unlock_all()` runs in that same preamble, beside `RESET ALL`. `RESET
 *   ALL` restores GUCs, not session-level advisory locks — a statement can still take one
 *   (`pg_advisory_lock`) without writing anything, and `max: 1` pins that lock to the single
 *   backend every call shares, so a lock one call takes would otherwise outlive it and block
 *   anything else that needs it (the migrator's own advisory locks, per the README's Database
 *   section) for the life of the server process. Read-only blocks writes; it does not block a
 *   function's side effects.
 * - The transaction is opened with `sql.begin("read only", …)`.
 * - Every `sql.unsafe()` call — including the preamble and the reset — passes
 *   `{ simple: false }` explicitly, even when `params` is `undefined`. postgres.js otherwise
 *   defaults to the simple query protocol at zero arguments, which lets a payload starting
 *   `commit;` end the transaction and run a second statement in the same round trip.
 *
 * Takes the postgres instance as an argument, rather than opening one itself, so the mechanism
 * is unit-testable with a fake `sql`. {@link createReadOnlyExecutor} is the thin wrapper that
 * opens a real connection.
 */
export async function runReadOnly(
  sql: postgres.Sql,
  statement: string,
  params?: unknown[],
): Promise<Record<string, unknown>[]> {
  await sql.unsafe("reset all", [], { simple: false });
  await sql.unsafe("select pg_advisory_unlock_all()", [], { simple: false });

  const rows = await sql.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`, [], {
      simple: false,
    });

    // Tool arguments arrive as `unknown[]` — validated by the caller's zod schema, not by
    // postgres.js's own parameter types, which this cast bridges at the one place params reach
    // the driver.
    return tx.unsafe<Record<string, unknown>[]>(
      statement,
      (params ?? []) as postgres.ParameterOrJSON<never>[],
      { simple: false },
    );
  });

  return rows;
}

/**
 * Opens a real, pinned, forced-read-only connection to `connectionString` and returns a
 * `(statement, params?) => Promise<Record<string, unknown>[]>` executor over it — the shape
 * `src/server.ts`'s `QueryExecutor` contract expects. The thin counterpart to
 * {@link runReadOnly}: this is the only place in the module that calls `postgres()` for real.
 */
export function createReadOnlyExecutor(
  connectionString: string,
): (statement: string, params?: unknown[]) => Promise<Record<string, unknown>[]> {
  const sql = postgres(connectionString, READ_ONLY_CONNECTION_OPTIONS);

  return (statement, params) => runReadOnly(sql, statement, params);
}
