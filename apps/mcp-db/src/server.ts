import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { formatQueryError, formatQueryResult, MAX_ROWS_CEILING, MAX_ROWS_DEFAULT } from "./format";

/**
 * Runs one SQL statement over a read-only connection and returns its rows. This is the seam
 * between this module — which imports no `postgres`, reads no environment variable, and touches
 * no stream — and `src/read-only.ts` / `src/main.ts`, which own the real connection. It is what
 * makes the tool surface here testable with `InMemoryTransport` and a fake `execute` (AI-43 §4).
 */
export type QueryExecutor = (
  statement: string,
  params?: unknown[],
) => Promise<Record<string, unknown>[]>;

/**
 * Builds the `talentscout-db` MCP server and registers the `query` tool against `execute`.
 * Read-only enforcement lives entirely in `execute` — the Postgres connection it wraps, not this
 * function — so `annotations.readOnlyHint` below is a hint to the client, never the enforcement.
 * `src/main.ts` is the sole caller that supplies a real `execute` and connects a transport.
 */
export function createServer(execute: QueryExecutor): McpServer {
  const server = new McpServer({ name: "talentscout-db", version: "0.1.0" });

  server.registerTool(
    "query",
    {
      description:
        "Run a read-only SQL statement against the TalentScout database and return its rows " +
        `as JSON. Results are capped at ${MAX_ROWS_DEFAULT} rows by default; pass maxRows (up ` +
        `to ${MAX_ROWS_CEILING}) to raise the cap for one call.`,
      inputSchema: {
        sql: z.string().min(1),
        maxRows: z.int().min(1).max(MAX_ROWS_CEILING).optional(),
      },
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        openWorldHint: false,
      },
    },
    async ({ sql, maxRows }) => {
      try {
        const rows = await execute(sql);
        return {
          content: [{ type: "text", text: formatQueryResult(rows, maxRows ?? MAX_ROWS_DEFAULT) }],
        };
      } catch (error) {
        return {
          isError: true,
          content: [{ type: "text", text: formatQueryError(error) }],
        };
      }
    },
  );

  return server;
}
