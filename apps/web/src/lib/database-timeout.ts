/** How long one database read may take before the request stops waiting for it. */
export const DATABASE_TIMEOUT_MS = 5_000;

/** Thrown when a database read outlives {@link DATABASE_TIMEOUT_MS}. */
export class DatabaseTimeoutError extends Error {
  constructor() {
    super(`Database did not respond within ${DATABASE_TIMEOUT_MS} ms`);
    this.name = "DatabaseTimeoutError";
  }
}

/**
 * Settles with `operation`, or rejects with {@link DatabaseTimeoutError} once
 * {@link DATABASE_TIMEOUT_MS} passes — whichever comes first. The deadline covers everything the
 * caller waits on: the pool queue, the connect phase and the statement itself.
 *
 * It releases the request, not the connection: the abandoned read keeps its pooled connection
 * until Postgres answers or the connect attempt gives up.
 */
// Deliberately no cancellation on timeout: postgres.js 3.4.9's `Query.cancel()` discards the
// promise its canceller returns (src/query.js:53), and that promise rejects when the cancel
// connection fails — the very moment the database is in trouble — as an unhandled rejection.
export function withDatabaseTimeout<T>(operation: PromiseLike<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new DatabaseTimeoutError()), DATABASE_TIMEOUT_MS);
  });

  return Promise.race([operation, deadline]).finally(() => clearTimeout(timer));
}
