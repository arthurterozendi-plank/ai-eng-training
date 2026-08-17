import { env } from "@/env";

/** Shape returned by `GET /api/status`. */
export type StatusPayload = {
  status: "ok";
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
};

// Always evaluated per request — a cached health check reports stale liveness.
export const dynamic = "force-dynamic";

export function GET(): Response {
  const payload: StatusPayload = {
    status: "ok",
    environment: env.NODE_ENV,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  };

  return Response.json(payload, {
    headers: { "Cache-Control": "no-store" },
  });
}
