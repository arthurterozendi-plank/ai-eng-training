/**
 * The sole owner of the boundary this workspace draws around `src/server.ts`: the only module
 * that reads `env`, hands over the global `fetch`, or touches a stream.
 *
 * A stdio MCP server owns stdout exclusively — one stray byte breaks JSON-RPC framing — so every
 * diagnostic here goes to `console.error`, never `console.log`.
 */
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { env, EnvValidationError } from "./env";
import { createPostHogApi, type PostHogConfig } from "./posthog-api";
import { createServer } from "./server";

/**
 * Reads all three keys and reports every one that is wrong at once, rather than the first —
 * whoever is fixing `.env.local` should not have to restart the server once per key.
 */
function loadConfig(): PostHogConfig {
  const problems: string[] = [];
  const read = (get: () => string): string => {
    try {
      return get();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // Keep each getter's `  - KEY: problem` line and drop the header it repeats.
      problems.push(...message.split("\n").filter((line) => line.startsWith("  - ")));
      return "";
    }
  };

  const config = {
    host: read(() => env.POSTHOG_API_HOST),
    projectId: read(() => env.POSTHOG_PROJECT_ID),
    personalApiKey: read(() => env.POSTHOG_PERSONAL_API_KEY),
  };

  if (problems.length > 0) {
    throw new EnvValidationError(`Invalid server environment variables:\n${problems.join("\n")}`);
  }
  return config;
}

/**
 * Names the PostHog project this server will read — never the key — on every start, so pointing
 * it at a project that holds real users' events is visible in the log, not only in a diff.
 */
function logReadyBanner(): void {
  try {
    const { host, projectId } = loadConfig();
    console.error(`[talentscout-posthog] ready — project ${projectId} at ${new URL(host).origin}`);
  } catch {
    console.error(
      "[talentscout-posthog] ready, but not configured — every tool will name the missing keys",
    );
  }
}

async function main(): Promise<void> {
  const api = createPostHogApi({ loadConfig, fetch: globalThis.fetch });
  await createServer(api).connect(new StdioServerTransport());
  logReadyBanner();

  // `StdioServerTransport` never reacts to stdin closing on its own; without this, `fetch`'s
  // keep-alive sockets can hold the process open after the client has gone.
  process.stdin.on("end", () => process.exit(0));
}

main().catch((error: unknown) => {
  console.error("[talentscout-posthog] failed to start:", error);
  process.exit(1);
});
