import { describe, expect, it } from "vitest";

import {
  formatQueryError,
  formatQueryResult,
  formatRowsNotice,
  MAX_ROWS_CEILING,
  MAX_ROWS_DEFAULT,
  SAMPLE_ROWS_DEFAULT,
  SAMPLE_ROWS_MAX,
} from "@/format";

describe("constants", () => {
  // Non-vacuity (slice 2 DoD): each assertion pins the exact value from AI-43 §4's constants
  // table. Drifting any one of them — e.g. MAX_ROWS_DEFAULT to 101 — fails here directly, rather
  // than depending on a behavioural test noticing incidentally.
  it("match the values pinned in the spec", () => {
    expect(MAX_ROWS_DEFAULT).toBe(100);
    expect(MAX_ROWS_CEILING).toBe(1000);
    expect(SAMPLE_ROWS_DEFAULT).toBe(5);
    expect(SAMPLE_ROWS_MAX).toBe(20);
  });
});

describe("formatRowsNotice", () => {
  it("uses the singular for exactly one row", () => {
    expect(formatRowsNotice(1, MAX_ROWS_DEFAULT)).toBe("1 row.");
  });

  it("uses the plural for zero rows", () => {
    const notice = formatRowsNotice(0, MAX_ROWS_DEFAULT);
    expect(notice).toContain("0 rows");
  });

  it("states the exact total and makes no truncation claim when the cap is not reached", () => {
    const notice = formatRowsNotice(299, 1000);
    expect(notice).toContain("299");
    expect(notice).not.toContain("1000");
    expect(notice.toLowerCase()).not.toContain("truncat");
  });

  it("names the shown count, the exact total, and the cap that produced the cut", () => {
    const notice = formatRowsNotice(299, 100);
    expect(notice).toContain("100");
    expect(notice).toContain("299");
    expect(notice.toLowerCase()).toContain("truncat");
  });

  it("does not truncate at exactly maxRows — the off-by-one boundary", () => {
    const notice = formatRowsNotice(100, 100);
    expect(notice.toLowerCase()).not.toContain("truncat");
    expect(notice).toBe("100 rows.");
  });

  it("truncates at maxRows + 1 — the other side of the boundary", () => {
    const notice = formatRowsNotice(101, 100);
    expect(notice.toLowerCase()).toContain("truncat");
  });

  it("suggests a larger maxRows below the ceiling", () => {
    const notice = formatRowsNotice(299, 100);
    expect(notice).toContain("larger");
    expect(notice).toContain(`up to ${MAX_ROWS_CEILING}`);
  });

  it("drops the pass-a-larger-maxRows clause once maxRows is already at the ceiling (AI-43 review round 4, NIT)", () => {
    const notice = formatRowsNotice(1500, MAX_ROWS_CEILING);
    expect(notice).toContain(`truncated at maxRows=${MAX_ROWS_CEILING}`);
    expect(notice).not.toContain("larger");
    expect(notice).toContain("Narrow the query to see more.");
  });

  it("says nothing about duplicates when none are given — the overwhelmingly common case", () => {
    const notice = formatRowsNotice(3, 100, []);
    expect(notice).toBe("3 rows.");
  });

  it("names every disambiguated column, singular for one (AI-43 review, BLOCKER)", () => {
    const notice = formatRowsNotice(3, 100, ["id"]);
    expect(notice).toContain("3 rows.");
    expect(notice).toContain("id");
    expect(notice).toMatch(/\bcolumn\b/);
    expect(notice).not.toMatch(/\bcolumns\b/);
  });

  it("uses the plural for more than one disambiguated column", () => {
    const notice = formatRowsNotice(3, 100, ["id", "created_at"]);
    expect(notice).toContain("id");
    expect(notice).toContain("created_at");
    expect(notice).toMatch(/\bcolumns\b/);
  });
});

describe("formatQueryResult", () => {
  it("renders the notice, a blank line, then the shown rows as pretty JSON", () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({ id: i }));

    const text = formatQueryResult(rows, MAX_ROWS_DEFAULT);
    const [notice, blank, ...jsonLines] = text.split("\n");

    expect(notice).toBe("3 rows.");
    expect(blank).toBe("");
    expect(JSON.parse(jsonLines.join("\n"))).toEqual(rows);
  });

  it("renders only the shown rows, not the full result, once truncated", () => {
    const rows = Array.from({ length: 299 }, (_, i) => ({ id: i }));

    const text = formatQueryResult(rows, 100);
    const body = text.slice(text.indexOf("["));
    const parsed = JSON.parse(body) as { id: number }[];

    expect(parsed).toHaveLength(100);
    expect(parsed[0]).toEqual({ id: 0 });
    expect(parsed[99]).toEqual({ id: 99 });
  });

  it("states which columns were disambiguated when the caller reports one (AI-43 review, BLOCKER)", () => {
    const rows = [{ id: "a", id__2: "b" }];

    const text = formatQueryResult(rows, MAX_ROWS_DEFAULT, ["id"]);
    const [notice] = text.split("\n\n");

    expect(notice).toContain("id");
    expect(text).toContain('"id__2"');
  });
});

describe("formatQueryError", () => {
  it("carries the message, the SQLSTATE code, and the position on one second line", () => {
    const text = formatQueryError({
      message: 'syntax error at or near "slect"',
      code: "42601",
      position: "1",
    });
    const lines = text.split("\n");

    expect(lines).toHaveLength(2);
    expect(text).toContain('syntax error at or near "slect"');
    expect(text).toContain("42601");
    expect(text).toContain("position 1");
  });

  it("omits absent fields and leaves no stray separator", () => {
    const text = formatQueryError({ message: "cannot execute INSERT", code: "25006" });
    const lines = text.split("\n");

    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("SQLSTATE 25006");
    expect(lines[1]).not.toMatch(/·\s*$/);
    expect(lines[1]).not.toMatch(/^\s*·/);
  });

  it("renders a single line when no code, position, detail, or hint are present", () => {
    const text = formatQueryError(new Error("boom"));

    expect(text.split("\n")).toHaveLength(1);
    expect(text).toContain("boom");
  });

  it("carries detail and hint when both are present", () => {
    const text = formatQueryError({
      message: 'relation "nope" does not exist',
      code: "42P01",
      detail: "Table nope was not found.",
      hint: 'Perhaps you meant to reference "notes".',
    });

    expect(text).toContain("42P01");
    expect(text).toContain("Table nope was not found.");
    expect(text).toContain('Perhaps you meant to reference "notes".');
  });

  it("never includes a stack frame, even for an error that carries one", () => {
    const error = new Error("boom");
    // Guards the guard: if Node ever stopped populating `.stack`, this assertion would fail
    // before the real one below could pass vacuously.
    expect(error.stack).toContain("    at ");

    const text = formatQueryError(error);
    expect(text).not.toContain("    at ");
  });
});
