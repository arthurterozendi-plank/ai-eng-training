/**
 * Default cap on the rows a `query` call returns when the caller does not pass `maxRows`.
 * Measured against this database's row sizes (AI-43 §4): the largest table's rows run ~289 B,
 * so a 100-row page is ~29 KB — still a useful sample, not a context-window event.
 */
export const MAX_ROWS_DEFAULT = 100;

/**
 * The ceiling a caller can raise `maxRows` to on a single `query` call. Above this, a result page
 * stops being "a big sample" and starts being a context-window event.
 */
export const MAX_ROWS_CEILING = 1000;

/**
 * Default number of sample rows `describe-table` returns alongside a table's exact `count(*)`.
 * Measured 5-row payloads across the seven seeded tables run 745 B – 8.4 KB.
 */
export const SAMPLE_ROWS_DEFAULT = 5;

/** The ceiling a caller can raise `describe-table`'s `sampleRows` to on a single call. */
export const SAMPLE_ROWS_MAX = 20;

/**
 * Renders the "truncated" half of {@link formatRowsNotice}'s header: how many rows are shown, the
 * exact total, and the cap that produced the cut. `maxRows` can never be raised past
 * {@link MAX_ROWS_CEILING} — `src/server.ts`'s `query` tool schema enforces that — so once a
 * caller is already there, "pass a larger `maxRows`" is not advice, it is a contradiction (AI-43
 * review round 4, NIT); this omits that clause exactly at the ceiling instead of stating it
 * unconditionally.
 */
function truncatedRowsNotice(totalRows: number, maxRows: number): string {
  const base = `Showing ${maxRows} of ${totalRows} rows — truncated at maxRows=${maxRows}.`;
  const guidance =
    maxRows >= MAX_ROWS_CEILING
      ? "Narrow the query to see more."
      : `Pass a larger \`maxRows\` (up to ${MAX_ROWS_CEILING}) or narrow the query to see more.`;

  return `${base} ${guidance}`;
}

/**
 * Renders the header a `query` result opens with: the exact total, and — only when the result
 * was actually cut — how many rows are shown and the cap that produced the cut. The total is
 * never an estimate: postgres.js materialises the whole result set before this function ever
 * sees it, so `totalRows` is exact even when the response is truncated (AI-43 §4, YELLOW-7).
 *
 * `duplicateColumns` names every column whose name collided with an earlier one in the same
 * result and was renamed to survive (`id`, `id__2`, …) rather than being silently overwritten —
 * see `read-only.ts`'s `buildRows` (AI-43 review, BLOCKER). Empty for the overwhelmingly common
 * no-collision case, which leaves this notice exactly as it was before that fix.
 */
export function formatRowsNotice(
  totalRows: number,
  maxRows: number,
  duplicateColumns: readonly string[] = [],
): string {
  const countNotice =
    totalRows <= maxRows
      ? `${totalRows} ${totalRows === 1 ? "row" : "rows"}.`
      : truncatedRowsNotice(totalRows, maxRows);

  if (duplicateColumns.length === 0) {
    return countNotice;
  }

  const plural = duplicateColumns.length === 1 ? "column" : "columns";
  return (
    `${countNotice} Repeated ${plural} renamed to avoid overwriting an earlier value — see the ` +
    `"__2" suffix below: ${duplicateColumns.join(", ")}.`
  );
}

/**
 * Renders a `query` tool result as the one text block AC 5 requires: {@link formatRowsNotice}'s
 * header, a blank line, then the shown rows as `JSON.stringify(rows, null, 2)` — pretty-printed
 * because that costs bytes but keeps column names greppable (YELLOW-8).
 */
export function formatQueryResult(
  rows: Record<string, unknown>[],
  maxRows: number,
  duplicateColumns: readonly string[] = [],
): string {
  const shownRows = rows.slice(0, maxRows);
  const notice = formatRowsNotice(rows.length, maxRows, duplicateColumns);

  return `${notice}\n\n${JSON.stringify(shownRows, null, 2)}`;
}

/** Reads `key` off `error` as a string, or `undefined` if it is absent or not a string. */
function readErrorField(
  error: unknown,
  key: "message" | "code" | "position" | "detail" | "hint",
): string | undefined {
  if (typeof error !== "object" || error === null || !(key in error)) {
    return undefined;
  }

  const value = (error as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

/**
 * Renders a query failure as usable text: the Postgres `message` verbatim, then — only when at
 * least one is present — a second line carrying `code`, `position`, `detail` and `hint`, joined
 * so an absent field leaves no stray separator behind. Reads fields off `error` by name rather
 * than importing `postgres.PostgresError`, so any object shaped like one renders the same way —
 * this module touches no driver import. `error.stack` is never read, so a stack frame can never
 * reach this output; the message itself is shown verbatim because here it *is* the product
 * (AI-43 §4, on `CLAUDE.md`'s "never return a stack trace" rule).
 */
export function formatQueryError(error: unknown): string {
  const message = readErrorField(error, "message") ?? String(error);

  const code = readErrorField(error, "code");
  const position = readErrorField(error, "position");
  const detail = readErrorField(error, "detail");
  const hint = readErrorField(error, "hint");

  const details = [
    code ? `SQLSTATE ${code}` : null,
    position ? `position ${position}` : null,
    detail ? `detail: ${detail}` : null,
    hint ? `hint: ${hint}` : null,
  ].filter((part): part is string => part !== null);

  const firstLine = `Query failed: ${message}`;
  return details.length > 0 ? `${firstLine}\n${details.join(" · ")}` : firstLine;
}
