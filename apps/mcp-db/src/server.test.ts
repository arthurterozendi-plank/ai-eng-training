import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it } from "vitest";

import { createServer, type QueryExecutor } from "@/server";

/** The shape every `query` tool result takes on, content-only (this server declares no `outputSchema`). */
interface QueryToolResult {
  isError?: boolean;
  content: { type: string; text: string }[];
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

async function callQuery(client: Client, args: Record<string, unknown>): Promise<QueryToolResult> {
  const result = await client.callTool({ name: "query", arguments: args });
  return result as unknown as QueryToolResult;
}

function textOf(result: QueryToolResult): string {
  return result.content[0]!.text;
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
