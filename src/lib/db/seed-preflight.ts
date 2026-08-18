/**
 * Thrown by {@link assertSeedTargetsEmpty} when one or more seed target tables already hold
 * rows. Named so a caller can distinguish "the database is not empty" from any other error the
 * seed runner might raise. `populatedTables` carries the same names as the message, in the
 * order they were found, so a caller (or a test) can assert on the exact set without parsing
 * prose.
 */
export class SeedTargetsNotEmptyError extends Error {
  readonly populatedTables: readonly string[];

  constructor(populatedTables: readonly string[]) {
    super(
      `Refusing to seed: the following table(s) already have rows: ${populatedTables.join(", ")}. ` +
        "The demo seed has no reset path — start from an empty database instead (see README.md).",
    );
    this.name = "SeedTargetsNotEmptyError";
    this.populatedTables = populatedTables;
  }
}

/**
 * Refuses to proceed if any seed target table already has rows. Pure and connection-free, so it
 * is unit-testable with no database: `scripts/db-seed.ts` supplies real row counts, and a test
 * supplies fake ones. There is deliberately no counterpart that empties a table — the demo seed
 * has no reset path at all, not even an opt-in one. See docs/specs/ai-34-domain-model.md §4
 * "Seed re-run semantics", the safety property a hardening round made non-negotiable.
 */
export function assertSeedTargetsEmpty(counts: Readonly<Record<string, number>>): void {
  const populatedTables = Object.entries(counts)
    .filter(([, rowCount]) => rowCount > 0)
    .map(([table]) => table);

  if (populatedTables.length > 0) {
    throw new SeedTargetsNotEmptyError(populatedTables);
  }
}
