import { randomUUID } from "node:crypto";

/**
 * A fresh, opaque id that ties one failure's server log line to what the client was shown. Safe
 * to hand to a recruiter: it is random and encodes nothing about the server.
 */
export function createCorrelationId(): string {
  return randomUUID();
}

/** What {@link logServerError} records beside its message. */
export type ServerErrorDetails = {
  correlationId: string;
  error: unknown;
  [context: string]: unknown;
};

/**
 * Writes one failure to the server log as a single JSON line on stderr, so a log search for the
 * correlation id a client quotes finds exactly this line. Server-only: the line carries the
 * error's message and stack, which can name hosts and ports.
 */
export function logServerError(
  message: string,
  { correlationId, error, ...context }: ServerErrorDetails,
): void {
  console.error(
    // Context first, so a context key can never overwrite the fields a log search relies on.
    JSON.stringify({
      ...context,
      level: "error",
      message,
      correlationId,
      time: new Date().toISOString(),
      error: describeError(error),
    }),
  );
}

function describeError(error: unknown) {
  if (!(error instanceof Error)) {
    return { message: String(error) };
  }

  const { code } = error as { code?: unknown };

  return {
    name: error.name,
    message: error.message,
    ...(typeof code === "string" ? { code } : {}),
    stack: error.stack,
  };
}
