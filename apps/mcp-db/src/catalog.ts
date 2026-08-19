/**
 * Catalog SQL and shaping for the `schema` and `describe-table` tools (AI-43 §4, YELLOW-6). Every
 * statement here reads `pg_catalog` / `information_schema` live — never the Drizzle schema
 * objects in `packages/db/src/schema/*.ts`. Those describe intent; this describes what is
 * actually on the server, including the hand-written migration's triggers and seeded rows, which
 * appear in no Drizzle object at all.
 *
 * A table-name filter is bound as a single `$1::text[]` parameter, `null` meaning "every table" —
 * one query text serves both the filtered and unfiltered case, so no identifier is ever
 * concatenated into these six statements. The three statements that cannot bind an identifier
 * (an exact row count and a sample-rows query, twice over — once here for `describe-table`, once
 * more in slice 5's `tables` resource) go through {@link quoteValidatedTableName}, the only
 * function in this codebase allowed to put one into SQL.
 */

/** Every base table in `public`, ordered by name — the live catalog listing every table-name argument is validated against. */
export const TABLE_NAMES_SQL = `
select c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname
`.trim();

/**
 * Every column of every table in `public`, or only those named in the `$1::text[]` filter when
 * one is passed. `format_type` is read off `pg_attribute` rather than
 * `information_schema.columns.data_type` because the latter collapses `numeric(10,2)` and
 * `varchar(255)` to bare type names, discarding the precision `format_type` keeps.
 *
 * `information_schema.columns` includes views, unlike {@link TABLE_NAMES_SQL}'s `relkind = 'r'`
 * filter — a real asymmetry, accepted rather than fixed because `public` holds no view today
 * (review AI-43 round 2, accept-without-change).
 */
export const COLUMNS_SQL = `
select
  cols.table_name,
  cols.column_name,
  cols.ordinal_position,
  format_type(attr.atttypid, attr.atttypmod) as data_type,
  (cols.is_nullable = 'YES') as is_nullable,
  cols.column_default
from information_schema.columns cols
join pg_attribute attr
  on attr.attrelid = (quote_ident(cols.table_schema) || '.' || quote_ident(cols.table_name))::regclass
  and attr.attname = cols.column_name
where cols.table_schema = 'public'
  and ($1::text[] is null or cols.table_name = any($1::text[]))
order by cols.table_name, cols.ordinal_position
`.trim();

/**
 * Every foreign key declared on a table in `public`, or only those on tables named in the
 * `$1::text[]` filter. `pg_get_constraintdef` is what surfaces the `ON UPDATE` / `ON DELETE`
 * action — information no Drizzle schema object records.
 */
export const FOREIGN_KEYS_SQL = `
select
  c.relname as table_name,
  con.conname as constraint_name,
  pg_get_constraintdef(con.oid) as definition
from pg_constraint con
join pg_class c on c.oid = con.conrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and con.contype = 'f'
  and ($1::text[] is null or c.relname = any($1::text[]))
order by c.relname, con.conname
`.trim();

/**
 * Every index defined on a table in `public`, or only those on tables named in the `$1::text[]`
 * filter.
 */
export const INDEXES_SQL = `
select
  tablename as table_name,
  indexname as index_name,
  indexdef as definition
from pg_indexes
where schemaname = 'public'
  and ($1::text[] is null or tablename = any($1::text[]))
order by tablename, indexname
`.trim();

/**
 * Every user-defined trigger on a table in `public`, or only those on tables named in the
 * `$1::text[]` filter. `tgisinternal` excludes the constraint-enforcement triggers Postgres
 * generates for every foreign key — those already surface through `pg_get_constraintdef` in
 * {@link FOREIGN_KEYS_SQL}, so listing them again here would be noise, not information.
 * `pg_get_triggerdef` is what surfaces a trigger's timing, event and function — the hand-written
 * migration's `_set_updated_at` triggers appear in no Drizzle schema object at all.
 */
export const TRIGGERS_SQL = `
select
  c.relname as table_name,
  t.tgname as trigger_name,
  pg_get_triggerdef(t.oid) as definition
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and not t.tgisinternal
  and ($1::text[] is null or c.relname = any($1::text[]))
order by c.relname, t.tgname
`.trim();

/**
 * Every value of every enum type in `public`, ordered by declaration order. Not filterable by
 * table — an enum type can back columns on more than one table, and there are only six of them,
 * so `schema` always returns the whole set regardless of its `tables` filter.
 */
export const ENUMS_SQL = `
select t.typname as enum_name, e.enumlabel as value
from pg_type t
join pg_enum e on e.enumtypid = t.oid
join pg_namespace n on n.oid = t.typnamespace
where n.nspname = 'public'
order by t.typname, e.enumsortorder
`.trim();

/** A row of {@link TABLE_NAMES_SQL}. */
export interface TableNameRow {
  table_name: string;
}

/** A row of {@link COLUMNS_SQL}. */
export interface ColumnRow {
  table_name: string;
  column_name: string;
  ordinal_position: number;
  data_type: string;
  is_nullable: boolean;
  column_default: string | null;
}

/** A row of {@link FOREIGN_KEYS_SQL}. */
export interface ForeignKeyRow {
  table_name: string;
  constraint_name: string;
  definition: string;
}

/** A row of {@link INDEXES_SQL}. */
export interface IndexRow {
  table_name: string;
  index_name: string;
  definition: string;
}

/** A row of {@link TRIGGERS_SQL}. */
export interface TriggerRow {
  table_name: string;
  trigger_name: string;
  definition: string;
}

/** A row of {@link ENUMS_SQL}. */
export interface EnumRow {
  enum_name: string;
  value: string;
}

/** One column, shaped for `schema` / `describe-table` output. */
export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default: string | null;
}

/** One table's columns, shaped for `schema` / `describe-table` output. */
export interface TableSchema {
  table: string;
  columns: ColumnInfo[];
}

/** One foreign key, shaped for `schema` output. */
export interface ForeignKeyInfo {
  table: string;
  name: string;
  definition: string;
}

/** One index, shaped for `schema` output. */
export interface IndexInfo {
  table: string;
  name: string;
  definition: string;
}

/** One trigger, shaped for `schema` output. */
export interface TriggerInfo {
  table: string;
  name: string;
  definition: string;
}

/** One enum type and its ordered values, shaped for `schema` output. */
export interface EnumInfo {
  name: string;
  values: string[];
}

/**
 * Groups `rows` by `keyOf(row)`, preserving each group's first-seen order and the row order
 * within it — the property {@link shapeColumns} and {@link shapeEnums} both rely on, since their
 * SQL already orders rows by the grouping column.
 */
function groupBy<Row>(rows: Row[], keyOf: (row: Row) => string): Map<string, Row[]> {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const key = keyOf(row);
    const group = groups.get(key);
    if (group) {
      group.push(row);
    } else {
      groups.set(key, [row]);
    }
  }

  return groups;
}

/**
 * Groups {@link COLUMNS_SQL} rows into one {@link TableSchema} per table, columns in ordinal
 * order. `describe-table` calls this on a single-table result and reads its one entry;
 * `schema` calls it on the full (or filtered) result and keeps the array.
 */
export function shapeColumns(rows: ColumnRow[]): TableSchema[] {
  const grouped = groupBy(rows, (row) => row.table_name);

  return [...grouped.entries()].map(([table, tableRows]) => ({
    table,
    columns: tableRows.map((row) => ({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable,
      default: row.column_default,
    })),
  }));
}

/** Maps {@link FOREIGN_KEYS_SQL} rows straight through to {@link ForeignKeyInfo}. */
export function shapeForeignKeys(rows: ForeignKeyRow[]): ForeignKeyInfo[] {
  return rows.map((row) => ({
    table: row.table_name,
    name: row.constraint_name,
    definition: row.definition,
  }));
}

/** Maps {@link INDEXES_SQL} rows straight through to {@link IndexInfo}. */
export function shapeIndexes(rows: IndexRow[]): IndexInfo[] {
  return rows.map((row) => ({
    table: row.table_name,
    name: row.index_name,
    definition: row.definition,
  }));
}

/** Maps {@link TRIGGERS_SQL} rows straight through to {@link TriggerInfo}. */
export function shapeTriggers(rows: TriggerRow[]): TriggerInfo[] {
  return rows.map((row) => ({
    table: row.table_name,
    name: row.trigger_name,
    definition: row.definition,
  }));
}

/** Groups {@link ENUMS_SQL} rows into one {@link EnumInfo} per enum type, values in declaration order. */
export function shapeEnums(rows: EnumRow[]): EnumInfo[] {
  const grouped = groupBy(rows, (row) => row.enum_name);

  return [...grouped.entries()].map(([name, enumRows]) => ({
    name,
    values: enumRows.map((row) => row.value),
  }));
}

/**
 * Thrown when a caller-supplied table name is not present in the live catalog listing —
 * {@link TABLE_NAMES_SQL}, queried fresh on every call rather than cached, so a table created or
 * dropped mid-session is reflected immediately. Every `schema` / `describe-table` catch site turns
 * this into `isError: true`, naming the offending value and the valid tables (AI-43 §4).
 */
export class UnknownTableError extends Error {
  constructor(
    public readonly table: string,
    public readonly validTables: string[],
  ) {
    super(`Unknown table "${table}". Valid tables: ${validTables.join(", ")}.`);
    this.name = "UnknownTableError";
  }
}

/**
 * Throws {@link UnknownTableError} for the first name in `tables` absent from `validTables`.
 * Shared validation for every tool argument that names a table, whether or not the caller goes on
 * to quote one — `schema`'s `tables` filter only needs this; `describe-table` needs this plus a
 * quoted identifier, via {@link quoteValidatedTableName} below, which calls this first.
 */
export function assertKnownTables(tables: string[], validTables: string[]): void {
  for (const table of tables) {
    if (!validTables.includes(table)) {
      throw new UnknownTableError(table, validTables);
    }
  }
}

/**
 * The single place in this codebase allowed to put an identifier into a SQL string (AI-43 §4). A
 * bind parameter can carry a value, never an identifier, so the three statements that count or
 * sample a specific table have no other way to name it. `table` is validated against
 * `validTables` — the live catalog listing — before anything is quoted, so a name that never
 * appeared there never reaches a statement string at all; what survives is double-quoted, the
 * quote itself doubled defensively even though a name drawn from `pg_class.relname` can never
 * carry one.
 */
export function quoteValidatedTableName(table: string, validTables: string[]): string {
  assertKnownTables([table], validTables);
  return `"${table.replaceAll('"', '""')}"`;
}

/**
 * Builds `select count(*) from <quotedTable>` — an exact count, never the planner's row-count
 * estimate, which was measured to read `-1` for two of the seven tables here because they had
 * never been analysed. `quotedTable` must come from {@link quoteValidatedTableName}.
 */
export function countRowsSql(quotedTable: string): string {
  return `select count(*) as n from ${quotedTable}`;
}

/**
 * Builds a sample-rows query over `<quotedTable>`; the row limit is the caller's `$1` bind
 * parameter, never interpolated. `quotedTable` must come from {@link quoteValidatedTableName}.
 */
export function sampleRowsSql(quotedTable: string): string {
  return `select * from ${quotedTable} limit $1`;
}
