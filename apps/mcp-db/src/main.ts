/**
 * The sole owner of the boundary this workspace draws around `src/server.ts`: the only module
 * that reads `env.DIRECT_DATABASE_URL`, opens a real `postgres` connection, or touches a stream.
 * Reads the direct key rather than `DATABASE_URL` — the session-scoped mechanisms `read-only.ts`
 * rests on (the startup-packet connection option, `max: 1`, the pre-transaction `RESET ALL`) are
 * undefined behind Supabase's transaction pooler, which is what `DATABASE_URL` is on hosted
 * (AI-43 §4).
 *
 * A stdio MCP server owns stdout exclusively — one stray byte breaks JSON-RPC framing — so every
 * diagnostic in this workspace goes to `console.error`, never `console.log` (AI-43 land-mine 4).
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { env } from "@talentscout/db/env";

import { createReadOnlyExecutor } from "./read-only";
import { createServer } from "./server";

/**
 * Prints the target host, port and database — never the password or the full connection string
 * — to stderr, naming the key ({@link env.DIRECT_DATABASE_URL}) alongside them. This is RISK-1's
 * mitigation: the moment this variable points at a database holding real candidates rather than
 * the local seed, that must be visible on every start, not only in a diff.
 */
function logReadyBanner(connectionString: string): void {
  const { hostname, port, pathname } = new URL(connectionString);
  console.error(`[talentscout-db] ready — DIRECT_DATABASE_URL ${hostname}:${port}${pathname}`);
}

async function main(): Promise<void> {
  const execute = createReadOnlyExecutor(env.DIRECT_DATABASE_URL);
  const server = createServer(execute);
  await server.connect(new StdioServerTransport());
  logReadyBanner(env.DIRECT_DATABASE_URL);
}

main().catch((error: unknown) => {
  console.error("[talentscout-db] failed to start:", error);
  // `process.exitCode = 1` only takes effect once the event loop drains on its own. If
  // `createReadOnlyExecutor` already opened the postgres pool before `server.connect` throws,
  // that pool keeps the loop alive and the process hangs instead of exiting non-zero.
  process.exit(1);
});
