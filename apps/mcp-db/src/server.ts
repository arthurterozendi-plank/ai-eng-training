import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import {
  assertKnownTables,
  COLUMNS_SQL,
  countRowsSql,
  ENUMS_SQL,
  FOREIGN_KEYS_SQL,
  INDEXES_SQL,
  quoteValidatedTableName,
  sampleRowsSql,
  shapeColumns,
  shapeEnums,
  shapeForeignKeys,
  shapeIndexes,
  shapeTriggers,
  TABLE_NAMES_SQL,
  TRIGGERS_SQL,
  UnknownTableError,
  type ColumnRow,
  type EnumRow,
  type ForeignKeyRow,
  type IndexRow,
  type TableNameRow,
  type TriggerRow,
} from "./catalog";
import {
  formatQueryError,
  formatQueryResult,
  MAX_ROWS_CEILING,
  MAX_ROWS_DEFAULT,
  SAMPLE_ROWS_DEFAULT,
} from "./format";

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
 * The MCP tool annotations every tool in this server carries. Read-only enforcement lives
 * entirely in the `QueryExecutor` a tool is given, not here — these are a hint to the client,
 * never the enforcement.
 */
const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  openWorldHint: false,
} as const;

/**
 * Queries {@link TABLE_NAMES_SQL} fresh and returns the table names — the live catalog listing
 * every table-name argument to `schema` and `describe-table` is validated against.
 */
async function fetchValidTableNames(execute: QueryExecutor): Promise<string[]> {
  const rows = (await execute(TABLE_NAMES_SQL)) as unknown as TableNameRow[];
  return rows.map((row) => row.table_name);
}

/**
 * Renders any error a tool handler catches as an `isError: true` result. An
 * {@link UnknownTableError} renders its own message, which already names the offending value and
 * the valid tables; anything else is treated as a Postgres failure and rendered the same way
 * `query` renders one.
 */
function toErrorResult(error: unknown): {
  isError: true;
  content: { type: "text"; text: string }[];
} {
  const text = error instanceof UnknownTableError ? error.message : formatQueryError(error);
  return { isError: true, content: [{ type: "text", text }] };
}

/**
 * Builds the `talentscout-db` MCP server and registers `query`, `schema`, `describe-table` and
 * the `tables` resource against `execute`. `src/main.ts` is the sole caller that supplies a real
 * `execute` and connects a transport.
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
      annotations: READ_ONLY_ANNOTATIONS,
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

  server.registerTool(
    "schema",
    {
      description:
        "Return the TalentScout database's schema: every table's columns (with their real " +
        "Postgres types, nullability and defaults), foreign keys, indexes, triggers and enum " +
        "types, read live from the catalog rather than from the Drizzle schema files. Pass " +
        "`tables` to narrow to a subset; omit it for the whole database.",
      inputSchema: {
        // `.min(1)`, not a bare optional array: an empty `tables` filter binds `$1::text[]` to
        // `'{}'`, matching no row — a silent empty result the ticket's "error on an unrecognised
        // name" choice exists precisely to avoid (AI-43 §4, review AI-43 NIT 3).
        tables: z.array(z.string().min(1)).min(1).optional(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ tables }) => {
      try {
        const validTables = await fetchValidTableNames(execute);
        if (tables) {
          assertKnownTables(tables, validTables);
        }

        const filter = tables ?? null;
        const [columnRows, foreignKeyRows, indexRows, triggerRows, enumRows] = await Promise.all([
          execute(COLUMNS_SQL, [filter]) as unknown as Promise<ColumnRow[]>,
          execute(FOREIGN_KEYS_SQL, [filter]) as unknown as Promise<ForeignKeyRow[]>,
          execute(INDEXES_SQL, [filter]) as unknown as Promise<IndexRow[]>,
          execute(TRIGGERS_SQL, [filter]) as unknown as Promise<TriggerRow[]>,
          execute(ENUMS_SQL) as unknown as Promise<EnumRow[]>,
        ]);

        const payload = {
          tables: shapeColumns(columnRows),
          foreignKeys: shapeForeignKeys(foreignKeyRows),
          indexes: shapeIndexes(indexRows),
          triggers: shapeTriggers(triggerRows),
          enums: shapeEnums(enumRows),
        };

        return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerTool(
    "describe-table",
    {
      description:
        "Describe one table: its columns, an exact row count, and a sample of its rows — read " +
        "live from the catalog, never an estimate.",
      inputSchema: {
        table: z.string().min(1),
        sampleRows: z.int().min(0).max(20).optional(),
      },
      annotations: READ_ONLY_ANNOTATIONS,
    },
    async ({ table, sampleRows }) => {
      try {
        const validTables = await fetchValidTableNames(execute);
        const quotedTable = quoteValidatedTableName(table, validTables);

        const limit = sampleRows ?? SAMPLE_ROWS_DEFAULT;
        const [columnRows, countRows, sampleRowsResult] = await Promise.all([
          execute(COLUMNS_SQL, [[table]]) as unknown as Promise<ColumnRow[]>,
          execute(countRowsSql(quotedTable)),
          execute(sampleRowsSql(quotedTable), [limit]),
        ]);

        const rowCount = Number(countRows[0]?.n ?? 0);

        const payload = {
          table,
          columns: shapeColumns(columnRows)[0]?.columns ?? [],
          rowCount,
          sampleRows: sampleRowsResult,
        };

        return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
      } catch (error) {
        return toErrorResult(error);
      }
    },
  );

  server.registerResource(
    "tables",
    "talentscout://tables",
    {
      title: "Tables",
      description:
        "Every table in the TalentScout database's public schema, with its column count and " +
        "exact row count — browsable in one read (AI-43 AC 4).",
      mimeType: "application/json",
    },
    async (uri) => {
      try {
        const validTables = await fetchValidTableNames(execute);
        const columnRows = (await execute(COLUMNS_SQL, [null])) as unknown as ColumnRow[];
        const columnCounts = new Map(
          shapeColumns(columnRows).map((table) => [table.table, table.columns.length]),
        );

        const tables = await Promise.all(
          validTables.map(async (table) => {
            const quotedTable = quoteValidatedTableName(table, validTables);
            const countRows = await execute(countRowsSql(quotedTable));
            return {
              table,
              columnCount: columnCounts.get(table) ?? 0,
              rowCount: Number(countRows[0]?.n ?? 0),
            };
          }),
        );

        return {
          contents: [
            { uri: uri.href, mimeType: "application/json", text: JSON.stringify(tables, null, 2) },
          ],
        };
      } catch (error) {
        // A `ReadResourceResult` carries no `isError` field the way a tool's `CallToolResult`
        // does — the MCP resource protocol has no structured error shape — so an unguarded throw
        // here is the only way a resource failure can reach the client at all, and it would
        // otherwise surface as a raw, unformatted exception. Catching it and re-throwing an
        // `McpError` whose message is `formatQueryError`'s rendering is what `query`, `schema`
        // and `describe-table` already give the caller for the same class of failure (a
        // connection drop, most plausibly): the SQLSTATE and detail travel with the message, and
        // no stack frame does.
        throw new McpError(ErrorCode.InternalError, formatQueryError(error));
      }
    },
  );

  return server;
}
