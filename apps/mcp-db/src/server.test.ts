import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { COLUMNS_SQL, ENUMS_SQL, FOREIGN_KEYS_SQL, INDEXES_SQL, TABLE_NAMES_SQL } from "@/catalog";
import { createServer, type QueryExecutor } from "@/server";

/** The shape every tool result takes on, content-only (this server declares no `outputSchema`). */
interface QueryToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
}

/** One recorded call: the exact statement text `execute` was given, and its bind parameters. */
interface RecordedCall {
  statement: string;
  params?: unknown[];
}

/**
 * A `postgres`-shaped error: a real `Error` (so `.stack` is populated, the way a thrown
 * `PostgresError` would be) carrying the extra fields {@link formatQueryError} reads by name.
 */
function postgresError(message: string, code: string, position?: string): Error {
  return Object.assign(new Error(message), { code, position });
}

/**
 * Links a fresh `createServer(execute)` to a fresh `Client` over `InMemoryTransport.
 * createLinkedPair()` and connects both ends — no subprocess, no database (AI-43 §2, §5 slice 3).
 */
async function connectedClient(execute: QueryExecutor): Promise<Client> {
  const server = createServer(execute);
  const client = new Client({ name: "test-client", version: "0.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

  return client;
}

async function callTool(
  client: Client,
  name: string,
  args: Record<string, unknown>,
): Promise<QueryToolResult> {
  const result = await client.callTool({ name, arguments: args });
  return result as unknown as QueryToolResult;
}

async function callQuery(client: Client, args: Record<string, unknown>): Promise<QueryToolResult> {
  return callTool(client, "query", args);
}

function textOf(result: QueryToolResult): string {
  return result.content[0]!.text;
}

/**
 * A fake `execute` for the catalog tools: it recognises the catalog SQL constants by exact text
 * (the same constants `src/catalog.ts` and `src/server.ts` import) and answers each with fixture
 * rows, recording every call it sees. `countRowsSql` / `sampleRowsSql` output is matched by
 * prefix, since those two are built from a quoted identifier at call time rather than being a
 * fixed constant — the property under test is exactly that they carry `quotedTable` and nothing
 * from the caller's raw, unvalidated argument.
 */
function createCatalogExecutor(fixture: {
  tables: string[];
  columns: Record<string, unknown>[];
  foreignKeys: Record<string, unknown>[];
  indexes: Record<string, unknown>[];
  enums: Record<string, unknown>[];
  rowCount: number;
  sampleRows: Record<string, unknown>[];
}): { execute: QueryExecutor; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  const execute: QueryExecutor = async (statement, params) => {
    calls.push({ statement, params });

    if (statement === TABLE_NAMES_SQL) {
      return fixture.tables.map((table_name) => ({ table_name }));
    }
    if (statement === COLUMNS_SQL) {
      return fixture.columns;
    }
    if (statement === FOREIGN_KEYS_SQL) {
      return fixture.foreignKeys;
    }
    if (statement === INDEXES_SQL) {
      return fixture.indexes;
    }
    if (statement === ENUMS_SQL) {
      return fixture.enums;
    }
    if (statement.startsWith("select count(*)")) {
      return [{ n: fixture.rowCount }];
    }
    if (statement.startsWith("select * from")) {
      return fixture.sampleRows;
    }

    throw new Error(`createCatalogExecutor: unexpected statement: ${statement}`);
  };

  return { execute, calls };
}

describe("createServer", () => {
  it("registers query with the read-only annotations", async () => {
    const client = await connectedClient(() => Promise.resolve([]));

    const { tools } = await client.listTools();
    const query = tools.find((tool) => tool.name === "query");

    expect(query).toBeDefined();
    expect(query?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it("renders a truncated result's header with the shown count, the exact total, and the cap", async () => {
    const rows = Array.from({ length: 299 }, (_, id) => ({ id }));
    const client = await connectedClient(() => Promise.resolve(rows));

    const result = await callQuery(client, {
      sql: "select id from application_stage_transitions",
      maxRows: 100,
    });

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("100");
    expect(text).toContain("299");
    expect(text.toLowerCase()).toContain("truncat");
  });

  it("renders a singular header for exactly one row", async () => {
    const client = await connectedClient(() => Promise.resolve([{ id: 1 }]));

    const result = await callQuery(client, { sql: "select 1" });

    expect(result.isError).toBeFalsy();
    expect(textOf(result).startsWith("1 row.")).toBe(true);
  });

  it("returns isError: true carrying the message and SQLSTATE, with no stack frame, when execute throws", async () => {
    const client = await connectedClient(() =>
      Promise.reject(postgresError('syntax error at or near "slect"', "42601", "1")),
    );

    const result = await callQuery(client, { sql: "slect 1" });

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain('syntax error at or near "slect"');
    expect(text).toContain("42601");
    expect(text).not.toContain("    at ");
  });

  describe("input validation — land-mine 6: rejected arguments resolve with isError, never a throw", () => {
    it("returns isError: true for a non-string sql", async () => {
      const client = await connectedClient(() => Promise.resolve([]));

      const result = await callQuery(client, { sql: 42 });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Invalid input: expected string");
    });

    it("returns isError: true for maxRows below the minimum", async () => {
      const client = await connectedClient(() => Promise.resolve([]));

      const result = await callQuery(client, { sql: "select 1", maxRows: 0 });

      expect(result.isError).toBe(true);
    });

    it("returns isError: true for maxRows above MAX_ROWS_CEILING", async () => {
      const client = await connectedClient(() => Promise.resolve([]));

      const result = await callQuery(client, { sql: "select 1", maxRows: 1001 });

      expect(result.isError).toBe(true);
    });
  });
});

describe("schema tool", () => {
  const validTables = ["jobs", "candidates", "applications"];
  const fixtureColumns = [
    {
      table_name: "jobs",
      column_name: "id",
      ordinal_position: 1,
      data_type: "uuid",
      is_nullable: false,
      column_default: "gen_random_uuid()",
    },
    {
      table_name: "jobs",
      column_name: "status",
      ordinal_position: 2,
      data_type: "job_status",
      is_nullable: false,
      column_default: "'open'::job_status",
    },
  ];
  const fixtureForeignKeys = [
    {
      table_name: "applications",
      constraint_name: "applications_job_id_fk",
      definition: "FOREIGN KEY (job_id) REFERENCES jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT",
    },
  ];
  const fixtureIndexes = [
    {
      table_name: "jobs",
      index_name: "jobs_status_idx",
      definition: "CREATE INDEX jobs_status_idx ON public.jobs USING btree (status)",
    },
  ];
  const fixtureEnums = [
    { enum_name: "job_status", value: "draft" },
    { enum_name: "job_status", value: "open" },
  ];

  function buildExecutor() {
    return createCatalogExecutor({
      tables: validTables,
      columns: fixtureColumns,
      foreignKeys: fixtureForeignKeys,
      indexes: fixtureIndexes,
      enums: fixtureEnums,
      rowCount: 0,
      sampleRows: [],
    });
  }

  it("registers schema with the read-only annotations", async () => {
    const { execute } = buildExecutor();
    const client = await connectedClient(execute);

    const { tools } = await client.listTools();
    const schema = tools.find((tool) => tool.name === "schema");

    expect(schema).toBeDefined();
    expect(schema?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it("returns a foreign-key definition and an enum type when no tables filter is given", async () => {
    const { execute, calls } = buildExecutor();
    const client = await connectedClient(execute);

    const result = await callTool(client, "schema", {});

    expect(result.isError).toBeFalsy();
    const text = textOf(result);
    expect(text).toContain("REFERENCES jobs(id) ON UPDATE CASCADE ON DELETE RESTRICT");
    expect(text).toContain("job_status");

    // Absent a `tables` argument, the filter queries still run through the same bound
    // parameter — null, meaning "every table" — rather than a second, unfiltered query text.
    const columnsCall = calls.find((call) => call.statement === COLUMNS_SQL);
    expect(columnsCall?.params).toEqual([null]);
  });

  it("binds the tables filter as a parameter to every catalog filter query, never concatenating it", async () => {
    const { execute, calls } = buildExecutor();
    const client = await connectedClient(execute);

    await callTool(client, "schema", { tables: ["jobs"] });

    const filterCalls = calls.filter((call) =>
      [COLUMNS_SQL, FOREIGN_KEYS_SQL, INDEXES_SQL].includes(call.statement),
    );
    expect(filterCalls).toHaveLength(3);
    for (const call of filterCalls) {
      expect(call.params).toEqual([["jobs"]]);
      expect(call.statement).not.toContain("jobs");
    }
  });

  it("returns isError: true naming the unknown table and a real one, for an unrecognised entry in tables", async () => {
    const { execute, calls } = buildExecutor();
    const client = await connectedClient(execute);

    const result = await callTool(client, "schema", { tables: ["no_such_table"] });

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain("no_such_table");
    expect(text).toContain("jobs");

    // Rejected before any catalog filter query ran — the only call is the table-name listing
    // itself, which never contains the argument that failed validation against it.
    expect(calls.some((call) => call.statement.includes("no_such_table"))).toBe(false);
  });
});

describe("describe-table tool", () => {
  const validTables = ["jobs", "candidates"];
  const fixtureColumns = [
    {
      table_name: "jobs",
      column_name: "id",
      ordinal_position: 1,
      data_type: "uuid",
      is_nullable: false,
      column_default: "gen_random_uuid()",
    },
    {
      table_name: "jobs",
      column_name: "title",
      ordinal_position: 2,
      data_type: "text",
      is_nullable: false,
      column_default: null,
    },
  ];
  const fixtureSampleRows = [{ id: "d3f0c1bd", title: "Senior Backend Engineer" }];

  function buildExecutor() {
    return createCatalogExecutor({
      tables: validTables,
      columns: fixtureColumns,
      foreignKeys: [],
      indexes: [],
      enums: [],
      rowCount: 8,
      sampleRows: fixtureSampleRows,
    });
  }

  it("registers describe-table with the read-only annotations", async () => {
    const { execute } = buildExecutor();
    const client = await connectedClient(execute);

    const { tools } = await client.listTools();
    const describeTable = tools.find((tool) => tool.name === "describe-table");

    expect(describeTable).toBeDefined();
    expect(describeTable?.annotations).toMatchObject({
      readOnlyHint: true,
      destructiveHint: false,
      openWorldHint: false,
    });
  });

  it("returns the exact row count and sampleRows sample rows for a known table", async () => {
    const { execute, calls } = buildExecutor();
    const client = await connectedClient(execute);

    const result = await callTool(client, "describe-table", { table: "jobs" });

    expect(result.isError).toBeFalsy();
    const payload = JSON.parse(textOf(result)) as {
      rowCount: number;
      sampleRows: unknown[];
      columns: unknown[];
    };
    expect(payload.rowCount).toBe(8);
    expect(payload.sampleRows).toEqual(fixtureSampleRows);
    expect(payload.columns).toHaveLength(2);

    // The count and sample queries carry the quoted identifier, built only after "jobs" was
    // validated against the live listing — never a bare bind parameter standing in for it.
    const countCall = calls.find((call) => call.statement.startsWith("select count(*)"));
    expect(countCall?.statement).toBe('select count(*) as n from "jobs"');
    const sampleCall = calls.find((call) => call.statement.startsWith("select * from"));
    expect(sampleCall?.statement).toBe('select * from "jobs" limit $1');
    expect(sampleCall?.params).toEqual([5]);
  });

  it("returns isError: true naming the unknown table and a real one, and records zero statements containing the argument, for a table absent from the catalog fixture", async () => {
    const { execute, calls } = buildExecutor();
    const client = await connectedClient(execute);

    const result = await callTool(client, "describe-table", { table: "no_such_table" });

    expect(result.isError).toBe(true);
    const text = textOf(result);
    expect(text).toContain("no_such_table");
    expect(text).toContain("jobs");
    expect(calls.some((call) => call.statement.includes("no_such_table"))).toBe(false);
  });

  it("rejects a table argument carrying a quote and a semicolon without ever interpolating it into a statement", async () => {
    const { execute, calls } = buildExecutor();
    const client = await connectedClient(execute);
    const malicious = 'jobs"; drop table candidates; --';

    const result = await callTool(client, "describe-table", { table: malicious });

    expect(result.isError).toBe(true);
    expect(textOf(result)).toContain(malicious);
    expect(calls.some((call) => call.statement.includes(malicious))).toBe(false);
    expect(calls.some((call) => call.statement.toLowerCase().includes("drop table"))).toBe(false);
  });

  describe("input validation — land-mine 6: rejected arguments resolve with isError, never a throw", () => {
    it("returns isError: true for a non-string table", async () => {
      const { execute } = buildExecutor();
      const client = await connectedClient(execute);

      const result = await callTool(client, "describe-table", { table: 42 });

      expect(result.isError).toBe(true);
      expect(textOf(result)).toContain("Invalid input: expected string");
    });

    it("returns isError: true for sampleRows above the maximum", async () => {
      const { execute } = buildExecutor();
      const client = await connectedClient(execute);

      const result = await callTool(client, "describe-table", { table: "jobs", sampleRows: 21 });

      expect(result.isError).toBe(true);
    });
  });
});
