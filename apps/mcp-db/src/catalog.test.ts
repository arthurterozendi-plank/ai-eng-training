import { describe, expect, it } from "vitest";

import {
  assertKnownTables,
  countRowsSql,
  quoteValidatedTableName,
  sampleRowsSql,
  shapeColumns,
  shapeEnums,
  shapeForeignKeys,
  shapeIndexes,
  UnknownTableError,
  type ColumnRow,
  type EnumRow,
  type ForeignKeyRow,
  type IndexRow,
} from "@/catalog";

// Fixture rows shaped exactly as the SQL constants in src/catalog.ts alias their columns —
// pure shaping over fixed data, no database (AI-43 §5 slice 4 DoD).

describe("shapeColumns", () => {
  it("groups columns by table, rendering each column's format_type type and nullability", () => {
    const rows: ColumnRow[] = [
      {
        table_name: "jobs",
        column_name: "id",
        ordinal_position: 1,
        data_type: "uuid",
        is_nullable: false,
        column_default: "gen_random_uuid()",
      },
      {
        table_name: "jobs",
        column_name: "department",
        ordinal_position: 2,
        data_type: "text",
        is_nullable: true,
        column_default: null,
      },
      {
        table_name: "candidates",
        column_name: "id",
        ordinal_position: 1,
        data_type: "uuid",
        is_nullable: false,
        column_default: "gen_random_uuid()",
      },
    ];

    const shaped = shapeColumns(rows);

    expect(shaped).toEqual([
      {
        table: "jobs",
        columns: [
          { name: "id", type: "uuid", nullable: false, default: "gen_random_uuid()" },
          { name: "department", type: "text", nullable: true, default: null },
        ],
      },
      {
        table: "candidates",
        columns: [{ name: "id", type: "uuid", nullable: false, default: "gen_random_uuid()" }],
      },
    ]);
  });
});

describe("shapeForeignKeys", () => {
  it("renders each row's pg_get_constraintdef text, including the delete action", () => {
    const rows: ForeignKeyRow[] = [
      {
        table_name: "applications",
        constraint_name: "applications_candidate_id_fk",
        definition:
          "FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT",
      },
    ];

    const [foreignKey] = shapeForeignKeys(rows);

    expect(foreignKey).toEqual({
      table: "applications",
      name: "applications_candidate_id_fk",
      definition:
        "FOREIGN KEY (candidate_id) REFERENCES candidates(id) ON UPDATE CASCADE ON DELETE RESTRICT",
    });
    expect(foreignKey?.definition).toContain("ON DELETE RESTRICT");
  });
});

describe("shapeIndexes", () => {
  it("maps each row straight through", () => {
    const rows: IndexRow[] = [
      {
        table_name: "jobs",
        index_name: "jobs_status_idx",
        definition: "CREATE INDEX jobs_status_idx ON public.jobs USING btree (status)",
      },
    ];

    expect(shapeIndexes(rows)).toEqual([
      {
        table: "jobs",
        name: "jobs_status_idx",
        definition: "CREATE INDEX jobs_status_idx ON public.jobs USING btree (status)",
      },
    ]);
  });
});

describe("shapeEnums", () => {
  it("groups values by enum type, preserving declaration order", () => {
    const rows: EnumRow[] = [
      { enum_name: "job_status", value: "draft" },
      { enum_name: "job_status", value: "open" },
      { enum_name: "job_status", value: "closed" },
      { enum_name: "employment_type", value: "full_time" },
      { enum_name: "employment_type", value: "part_time" },
    ];

    expect(shapeEnums(rows)).toEqual([
      { name: "job_status", values: ["draft", "open", "closed"] },
      { name: "employment_type", values: ["full_time", "part_time"] },
    ]);
  });
});

describe("quoteValidatedTableName", () => {
  const validTables = ["jobs", "candidates", "applications"];

  it("quotes a name present in the live catalog listing", () => {
    expect(quoteValidatedTableName("jobs", validTables)).toBe('"jobs"');
  });

  it("throws UnknownTableError, naming the offending value and the valid tables, for a name absent from the listing", () => {
    expect(() => quoteValidatedTableName("no_such_table", validTables)).toThrow(UnknownTableError);

    try {
      quoteValidatedTableName("no_such_table", validTables);
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(UnknownTableError);
      expect((error as UnknownTableError).message).toContain("no_such_table");
      expect((error as UnknownTableError).message).toContain("jobs");
    }
  });

  it("rejects a name carrying a quote or a semicolon rather than quoting it — it is never in the live listing", () => {
    expect(() => quoteValidatedTableName('jobs"; drop table x; --', validTables)).toThrow(
      UnknownTableError,
    );
  });
});

describe("assertKnownTables", () => {
  const validTables = ["jobs", "candidates"];

  it("does not throw when every name is present", () => {
    expect(() => assertKnownTables(["jobs", "candidates"], validTables)).not.toThrow();
  });

  it("throws UnknownTableError naming the first absent name", () => {
    expect(() => assertKnownTables(["jobs", "no_such_table"], validTables)).toThrow(
      UnknownTableError,
    );
  });
});

describe("countRowsSql", () => {
  it("counts from the quoted identifier, never pg_class's row-count estimate", () => {
    expect(countRowsSql('"jobs"')).toBe('select count(*) as n from "jobs"');
  });
});

describe("sampleRowsSql", () => {
  it("selects from the quoted identifier with the row limit left as a bind parameter", () => {
    expect(sampleRowsSql('"jobs"')).toBe('select * from "jobs" limit $1');
  });
});
