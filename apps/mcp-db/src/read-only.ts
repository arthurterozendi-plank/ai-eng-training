import postgres from "postgres";

import type { QueryRows } from "./server";

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
 *
 * Annotated as `postgres.Options<{}>`, not left as an inferred literal (AI-43 review, NIT): an
 * untyped object reaches `postgres()` as a variable, where excess-property checking never fires,
 * so land-mine 1c's exact typo — a top-level `options` instead of nested `connection.options` —
 * still typechecked. With the annotation, `tsc` rejects it directly, becoming a third check
 * alongside `read-only.test.ts`'s placement assertion and `mcp:verify`'s live GUC assertion.
 */
export const READ_ONLY_CONNECTION_OPTIONS: postgres.Options<Record<string, never>> = {
  connection: {
    options: "-c default_transaction_read_only=on",
  },
  max: 1,
  onnotice: (notice: postgres.Notice) => {
    console.error("[talentscout-db] notice:", notice);
  },
};

/**
 * Rebuilds one `Record<string, unknown>` per row from postgres.js's own ordered `columns` list
 * and its positional `.values()` output, rather than trusting postgres.js's default row-building
 * (`row[column.name] = value` for each column in order, verified at
 * `node_modules/postgres/src/connection.js`'s `DataRow` handler). That default silently collapses
 * two columns sharing a name — the later one overwrites the earlier — with no error and no
 * notice; every table in this schema carries `id` / `created_at` / `updated_at`, so any two-table
 * join hits it, and `select *` over a join is the most likely exploratory query an agent writes
 * (AI-43 review, BLOCKER). A name that repeats here instead gets a numbered suffix (`id`, `id__2`,
 * `id__3`, …), chosen by probing against every source column name *and* every name already
 * emitted — not a blind per-name counter — so a suffix can never collide with a real column
 * already carrying it: `select 1 as id, 2 as id__2, 3 as id` would otherwise rename the second
 * `id` to `id__2`, colliding with the real `id__2` and silently overwriting it, the exact failure
 * class this function exists to prevent, one level up (AI-43 review round 4, SHOULD 2). So no
 * value is lost and none is misattributed to the wrong column. `duplicateColumns` — empty in the
 * overwhelmingly common no-collision case — names every *source* column name that repeated, in
 * first-seen order, so `src/format.ts`'s renderer can say so in `query`'s header. Every statement
 * `src/catalog.ts` sends selects controlled, unique column names, so this function is a plain,
 * unchanged transcription for every catalog caller.
 */
function buildRows(
  columns: readonly { name: string }[],
  valueRows: readonly unknown[][],
): QueryRows {
  const sourceNames = new Set(columns.map((column) => column.name));
  const usedNames = new Set<string>();
  const duplicateColumns = new Set<string>();

  const names = columns.map((column) => {
    if (!usedNames.has(column.name)) {
      usedNames.add(column.name);
      return column.name;
    }

    duplicateColumns.add(column.name);

    let suffix = 2;
    let candidate = `${column.name}__${suffix}`;
    while (sourceNames.has(candidate) || usedNames.has(candidate)) {
      suffix += 1;
      candidate = `${column.name}__${suffix}`;
    }

    usedNames.add(candidate);
    return candidate;
  });

  const rows = valueRows.map((values) => {
    const row: Record<string, unknown> = {};
    names.forEach((name, index) => {
      row[name] = values[index];
    });
    return row;
  }) as QueryRows;

  if (duplicateColumns.size > 0) {
    rows.duplicateColumns = [...duplicateColumns];
  }

  return rows;
}

/**
 * Runs exactly one statement against `sql` inside a read-only transaction, returning its rows.
 *
 * Five details each carry a measured security or correctness property and must not move:
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
 * - The statement runs with `.values()`, not the plain object form, so this function sees
 *   postgres.js's positional rows and its own ordered `columns` list — the only way to detect and
 *   rename a repeated column name before it collides (see {@link buildRows}).
 *
 * Takes the postgres instance as an argument, rather than opening one itself, so the mechanism
 * is unit-testable with a fake `sql`. {@link createReadOnlyExecutor} is the thin wrapper that
 * opens a real connection.
 */
export async function runReadOnly(
  sql: postgres.Sql,
  statement: string,
  params?: unknown[],
): Promise<QueryRows> {
  await sql.unsafe("reset all", [], { simple: false });
  await sql.unsafe("select pg_advisory_unlock_all()", [], { simple: false });

  const { columns, values } = await sql.begin("read only", async (tx) => {
    await tx.unsafe(`set local statement_timeout = ${STATEMENT_TIMEOUT_MS}`, [], {
      simple: false,
    });

    // Tool arguments arrive as `unknown[]` — validated by the caller's zod schema, not by
    // postgres.js's own parameter types, which this cast bridges at the one place params reach
    // the driver.
    const values = await tx
      .unsafe<Record<string, unknown>[]>(
        statement,
        (params ?? []) as postgres.ParameterOrJSON<never>[],
        { simple: false },
      )
      .values();

    return { columns: values.columns, values };
  });

  return buildRows(columns, values);
}

/**
 * {@link createReadOnlyExecutor}'s return shape: the `(statement, params?) => Promise<QueryRows>`
 * executor `src/server.ts`'s `QueryExecutor` contract expects, plus `close` to release the
 * connection it opened. `close` exists because a `postgres()` pool defaults to
 * `idle_timeout: null` and never `unref`s its socket (`node_modules/postgres/src/index.js`), so
 * once a query has opened it, the pool keeps the Node event loop alive on its own — closing stdin
 * alone does not end the process. `src/main.ts` calls `close` when the transport's stdin closes,
 * so the server exits instead of leaking a Postgres backend — and the pnpm → dotenv-cli → tsx
 * process chain `.mcp.json` launches — for the life of the host (AI-43 review round 4, SHOULD 1).
 */
export interface ReadOnlyExecutor {
  execute: (statement: string, params?: unknown[]) => Promise<QueryRows>;
  close: () => Promise<void>;
}

/**
 * Opens a real, pinned, forced-read-only connection to `connectionString` and returns a
 * {@link ReadOnlyExecutor} over it — the thin counterpart to {@link runReadOnly}: this is the
 * only place in the module that calls `postgres()` for real.
 */
export function createReadOnlyExecutor(connectionString: string): ReadOnlyExecutor {
  const sql = postgres(connectionString, READ_ONLY_CONNECTION_OPTIONS);

  return {
    execute: (statement, params) => runReadOnly(sql, statement, params),
    // A 5s timeout, not the default (wait forever): a slow-to-drain in-flight query should still
    // get a chance to finish, but shutdown must stay bounded even if one never does.
    close: () => sql.end({ timeout: 5 }),
  };
}
