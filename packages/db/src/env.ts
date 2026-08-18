import { z } from "zod";

/**
 * Thrown when an environment variable fails schema validation. Named so callers can
 * distinguish a bad `.env` value from any other error a getter might raise.
 */
// Deliberately duplicated from `apps/web/src/env.ts` rather than shared: this package must not
// depend on an application, and a shared-errors package would exist only to hold six lines.
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * The database connection strings this package owns, validated on read.
 *
 * Server-only, always — nothing here may be imported from a Client Component. Consumers get
 * these through `@talentscout/db/env` rather than reading `process.env` themselves.
 */
// `.claude/skills/pre-deploy/scripts/check-env.sh` finds validated keys by matching
// `KEY: z.` at the start of a line, so each key's schema must be written out inline
// rather than through a shared constant — otherwise it silently drops out of that check.
const serverSchema = z.object({
  // Postgres connection strings only — this project talks to Postgres directly, never to
  // Supabase's REST API, so http(s) and other protocols are rejected here rather than downstream.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DIRECT_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

function parse<T extends z.ZodType>(schema: T, source: unknown, label: string): z.infer<T> {
  const result = schema.safeParse(source);

  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new EnvValidationError(`Invalid ${label} environment variables:\n${issues}`);
  }

  return result.data;
}

// Each key's single-key schema is built once, here, rather than inside its getter: `.pick()`
// reconstructs a schema every call, which costs ~50x the validation it precedes.
const databaseUrlSchema = serverSchema.pick({ DATABASE_URL: true });
const directDatabaseUrlSchema = serverSchema.pick({ DIRECT_DATABASE_URL: true });

/**
 * Validated Postgres connection strings. Each key gets its own getter, parsing only that key's
 * slice of `serverSchema`, so reading one key never fails because a sibling key is unset —
 * `db:migrate` needs only `DIRECT_DATABASE_URL`, and must not trip over an absent
 * `DATABASE_URL`.
 */
export const env = {
  get DATABASE_URL() {
    return parse(databaseUrlSchema, process.env, "server").DATABASE_URL;
  },
  get DIRECT_DATABASE_URL() {
    return parse(directDatabaseUrlSchema, process.env, "server").DIRECT_DATABASE_URL;
  },
};
