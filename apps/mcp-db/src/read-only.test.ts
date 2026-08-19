import type postgres from "postgres";
import { describe, expect, it, vi } from "vitest";

import {
  createReadOnlyExecutor,
  READ_ONLY_CONNECTION_OPTIONS,
  runReadOnly,
  STATEMENT_TIMEOUT_MS,
} from "@/read-only";

interface RecordedCall {
  scope: "pool" | "transaction";
  query: string;
  params: unknown[] | undefined;
  options: { simple?: boolean } | undefined;
}

/**
 * A `.values()`-shaped result: the positional rows postgres.js hands back when a query is
 * chained with `.values()`, plus the ordered `columns` list {@link runReadOnly} reconstructs
 * objects from. Derived from `rows` by column name, so it can only ever produce *unique* column
 * names — the real collision this fake cannot reproduce is postgres.js's own object-building
 * silently colliding two same-named columns from a live join; that is why the BLOCKER's
 * regression lives in `scripts/verify-read-only.ts` against a real database, not here. This fake
 * exists only to prove the shape `runReadOnly` now consumes (`.values()` + `.columns`); the test
 * below it exercises `read-only.ts`'s own dedup logic (`buildRows`) directly.
 */
function toValuesResult(rows: Record<string, unknown>[]) {
  const columnNames = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const values = rows.map((row) => columnNames.map((name) => row[name]));
  return Object.assign(values, { columns: columnNames.map((name) => ({ name })) });
}

/**
 * A fake `postgres.Sql` that records every `unsafe()` call it sees, in order, together with
 * which connection ran it — the pool-level `sql` used for the pre-transaction reset, or the `tx`
 * handed to the `begin()` callback. That is everything {@link runReadOnly}'s contract depends on.
 * Every returned "query" is thenable *and* carries a `.values()` method resolving to
 * {@link toValuesResult}'s shape, matching every `sql.unsafe(...)` call site in `runReadOnly` —
 * only the caller's own statement chains `.values()` in the real code, but attaching it
 * everywhere keeps this fake indifferent to which call that is.
 */
function createFakeSql(rows: Record<string, unknown>[]) {
  const calls: RecordedCall[] = [];
  let beginMode: string | undefined;

  function makeUnsafe(scope: RecordedCall["scope"]) {
    return (query: string, params?: unknown[], options?: { simple?: boolean }) => {
      calls.push({ scope, query, params, options });
      const pending = Promise.resolve(rows) as Promise<Record<string, unknown>[]> & {
        values: () => Promise<unknown>;
      };
      pending.values = () => Promise.resolve(toValuesResult(rows));
      return pending;
    };
  }

  const tx = { unsafe: makeUnsafe("transaction") };
  type Tx = typeof tx;

  const fakeSql = {
    unsafe: makeUnsafe("pool"),
    begin: async (mode: string, callback: (fakeTx: Tx) => Promise<unknown>) => {
      beginMode = mode;
      return callback(tx);
    },
  };

  return { fakeSql, calls, getBeginMode: () => beginMode };
}

describe("runReadOnly", () => {
  it("resets before opening a read-only transaction and runs every statement over the extended protocol", async () => {
    const rows = [{ id: 1 }];
    const { fakeSql, calls, getBeginMode } = createFakeSql(rows);

    const result = await runReadOnly(fakeSql as unknown as postgres.Sql, "select 1", undefined);

    // Rebuilt from `.values()` + `columns`, so it is deep-equal to the fixture, not the same
    // reference — the property change that fixes the BLOCKER (AI-43 review).
    expect(result).toEqual(rows);
    expect(getBeginMode()).toBe("read only");

    // Order matters: RESET ALL and the advisory-unlock both run on the pool connection before
    // the transaction opens — RESET ALL restores GUCs only, it does not release a session-level
    // advisory lock a prior call's function side effect could have taken — then the
    // statement_timeout preamble and the caller's statement run inside it.
    expect(calls.map((call) => call.scope)).toEqual(["pool", "pool", "transaction", "transaction"]);
    expect(calls[0]!.query.toLowerCase()).toBe("reset all");
    expect(calls[1]!.query.toLowerCase()).toBe("select pg_advisory_unlock_all()");
    expect(calls[2]!.query).toContain(`statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    expect(calls[3]!.query).toBe("select 1");

    // The property that matters: every call carries `{ simple: false }` explicitly, including
    // this zero-parameter case — postgres.js otherwise defaults to the simple protocol that lets
    // a payload starting `commit;` escape the transaction.
    for (const call of calls) {
      expect(call.options).toEqual({ simple: false });
    }
  });

  it("binds params to the statement and still runs it with simple: false", async () => {
    const { fakeSql, calls } = createFakeSql([]);

    await runReadOnly(fakeSql as unknown as postgres.Sql, "select $1::int as n", [42]);

    const statementCall = calls.at(-1);
    expect(statementCall?.params).toEqual([42]);
    expect(statementCall?.options).toEqual({ simple: false });
  });

  /**
   * A regular object cannot carry two properties named `id`, so {@link toValuesResult} — derived
   * from a rows fixture — can never produce a duplicate `columns` entry. This fake instead builds
   * the `.values()` shape by hand, exactly as a two-table join's `RowDescription` would (two
   * columns named `id`, positionally distinct), to exercise `runReadOnly`'s own dedup logic
   * directly. The live reproduction against a real Postgres join lives in
   * `scripts/verify-read-only.ts` (AI-43 review, BLOCKER) — a fake cannot reproduce postgres.js's
   * own object-building colliding, only prove what this codebase does once it sees the collision.
   */
  it("renames a column name that collides with an earlier one instead of overwriting it, and names every collision", async () => {
    const calls: RecordedCall[] = [];

    function makeUnsafe(scope: RecordedCall["scope"]) {
      return (query: string, params?: unknown[], options?: { simple?: boolean }) => {
        calls.push({ scope, query, params, options });
        const pending = Promise.resolve([]) as unknown as Promise<Record<string, unknown>[]> & {
          values: () => Promise<unknown>;
        };
        pending.values = () =>
          Promise.resolve(
            Object.assign(
              [
                ["applications-id", "job-1", "jobs-id", "Senior Engineer"],
                ["applications-id-2", "job-2", "jobs-id-2", "Staff Engineer"],
              ],
              { columns: [{ name: "id" }, { name: "job_id" }, { name: "id" }, { name: "title" }] },
            ),
          );
        return pending;
      };
    }

    const tx = { unsafe: makeUnsafe("transaction") };
    type Tx = typeof tx;
    const fakeSql = {
      unsafe: makeUnsafe("pool"),
      begin: async (_mode: string, callback: (fakeTx: Tx) => Promise<unknown>) => callback(tx),
    };

    const result = await runReadOnly(
      fakeSql as unknown as postgres.Sql,
      "select a.id, a.job_id, j.id, j.title from applications a join jobs j on j.id = a.job_id",
    );

    // Every value survives, under a distinguishable key — the exact failure mode reported
    // against a real join: a naive `row[column.name] = value` would leave this object with only
    // three keys and `id` holding the second occurrence's value ("jobs-id"), silently discarding
    // "applications-id" and misattributing the surviving value to the wrong column. Spread into a
    // plain array first: `result` also carries `duplicateColumns`, asserted separately below, and
    // `toEqual` treats that as part of the array's own identity.
    expect([...result]).toEqual([
      { id: "applications-id", job_id: "job-1", id__2: "jobs-id", title: "Senior Engineer" },
      { id: "applications-id-2", job_id: "job-2", id__2: "jobs-id-2", title: "Staff Engineer" },
    ]);
    expect(result.duplicateColumns).toEqual(["id"]);
  });
});

describe("READ_ONLY_CONNECTION_OPTIONS", () => {
  it("nests the read-only GUC under connection, never at the top level", () => {
    expect(READ_ONLY_CONNECTION_OPTIONS.connection?.options).toBe(
      "-c default_transaction_read_only=on",
    );
    expect(READ_ONLY_CONNECTION_OPTIONS.max).toBe(1);
    expect("options" in READ_ONLY_CONNECTION_OPTIONS).toBe(false);
  });

  it("routes postgres.js NOTICEs to console.error, never postgres.js's console.log default", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    expect(typeof READ_ONLY_CONNECTION_OPTIONS.onnotice).toBe("function");
    READ_ONLY_CONNECTION_OPTIONS.onnotice?.({ message: "identifier truncated" });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();

    errorSpy.mockRestore();
    logSpy.mockRestore();
  });
});

const { postgresFactory, calls } = vi.hoisted(() => {
  const calls: RecordedCall[] = [];

  function makeUnsafe(scope: RecordedCall["scope"]) {
    return (query: string, params?: unknown[], options?: { simple?: boolean }) => {
      calls.push({ scope, query, params, options });
      const pending = Promise.resolve([]) as unknown as Promise<Record<string, unknown>[]> & {
        values: () => Promise<unknown>;
      };
      pending.values = () => Promise.resolve(Object.assign([], { columns: [] }));
      return pending;
    };
  }

  const tx = { unsafe: makeUnsafe("transaction") };
  type Tx = typeof tx;
  const fakeSql = {
    unsafe: makeUnsafe("pool"),
    begin: async (_mode: string, callback: (fakeTx: Tx) => Promise<unknown>) => callback(tx),
  };

  return { postgresFactory: vi.fn(() => fakeSql), fakeSql, calls };
});

vi.mock("postgres", () => ({ default: postgresFactory }));

describe("createReadOnlyExecutor", () => {
  it("opens the connection with READ_ONLY_CONNECTION_OPTIONS and delegates to runReadOnly", async () => {
    const execute = createReadOnlyExecutor("postgresql://user:pass@127.0.0.1:54322/postgres");

    expect(postgresFactory).toHaveBeenCalledWith(
      "postgresql://user:pass@127.0.0.1:54322/postgres",
      READ_ONLY_CONNECTION_OPTIONS,
    );

    await execute("select 1");

    expect(calls.map((call) => call.scope)).toEqual(["pool", "pool", "transaction", "transaction"]);
  });
});
