import { db } from "@talentscout/db/client";

import { DatabaseTimeoutError, withDatabaseTimeout } from "@/lib/database-timeout";
import { createCorrelationId, logServerError } from "@/lib/logger";
import { env } from "@/env";

/**
 * Shape returned by `GET /api/status`: `200` with `status: "ok"` when the database answers,
 * `503` with `status: "unhealthy"` when it does not. An unhealthy report carries the
 * `correlationId` its server log line was written under.
 */
export type StatusPayload = {
  status: "ok" | "unhealthy";
  database: "ok" | "unreachable" | "timeout";
  correlationId?: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
};

// Always evaluated per request — a cached health check reports stale liveness.
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const check = await checkDatabase();

  const payload: StatusPayload = {
    status: check.database === "ok" ? "ok" : "unhealthy",
    ...check,
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  // 503, not 500: the handler did its job, which is reporting a dependency down. Monitors and
  // load balancers read 503 as "temporarily unavailable"; a 500 would look like this route
  // itself crashing.
  return Response.json(payload, {
    status: payload.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}

async function checkDatabase(): Promise<Pick<StatusPayload, "database" | "correlationId">> {
  try {
    // Through the pooled `DATABASE_URL`, so the check exercises the same path every request does.
    await withDatabaseTimeout(db.$client`select 1`);

    return { database: "ok" };
  } catch (error) {
    const correlationId = createCorrelationId();
    logServerError("GET /api/status database check failed", { correlationId, error });

    return {
      database: error instanceof DatabaseTimeoutError ? "timeout" : "unreachable",
      correlationId,
    };
  }
}
