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
 * A fake `postgres.Sql` that records every `unsafe()` call it sees, in order, together with
 * which connection ran it — the pool-level `sql` used for the pre-transaction reset, or the `tx`
 * handed to the `begin()` callback. That is everything {@link runReadOnly}'s contract depends on.
 */
function createFakeSql(rows: Record<string, unknown>[]) {
  const calls: RecordedCall[] = [];
  let beginMode: string | undefined;

  function makeUnsafe(scope: RecordedCall["scope"]) {
    return (query: string, params?: unknown[], options?: { simple?: boolean }) => {
      calls.push({ scope, query, params, options });
      return Promise.resolve(rows);
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

    expect(result).toBe(rows);
    expect(getBeginMode()).toBe("read only");

    // Order matters: RESET ALL runs on the pool connection before the transaction opens, then
    // the statement_timeout preamble and the caller's statement run inside it.
    expect(calls.map((call) => call.scope)).toEqual(["pool", "transaction", "transaction"]);
    expect(calls[0]!.query.toLowerCase()).toBe("reset all");
    expect(calls[1]!.query).toContain(`statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
    expect(calls[2]!.query).toBe("select 1");

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
});

describe("READ_ONLY_CONNECTION_OPTIONS", () => {
  it("nests the read-only GUC under connection, never at the top level", () => {
    expect(READ_ONLY_CONNECTION_OPTIONS.connection.options).toBe(
      "-c default_transaction_read_only=on",
    );
    expect(READ_ONLY_CONNECTION_OPTIONS.max).toBe(1);
    expect("options" in READ_ONLY_CONNECTION_OPTIONS).toBe(false);
  });
});

const { postgresFactory, calls } = vi.hoisted(() => {
  const calls: RecordedCall[] = [];

  function makeUnsafe(scope: RecordedCall["scope"]) {
    return (query: string, params?: unknown[], options?: { simple?: boolean }) => {
      calls.push({ scope, query, params, options });
      return Promise.resolve([]);
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

    expect(calls.map((call) => call.scope)).toEqual(["pool", "transaction", "transaction"]);
  });
});
