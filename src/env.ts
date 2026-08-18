import { z } from "zod";

/**
 * Thrown when an environment variable fails schema validation. Named so callers can
 * distinguish a bad `.env` value from any other error a getter might raise.
 */
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Environment variables, validated at module load.
 *
 * Server-only values live in `serverSchema` and must never be imported from a
 * Client Component. Anything the browser needs must be prefixed NEXT_PUBLIC_
 * and referenced literally below so Next.js can inline it at build time.
 */
// `.claude/skills/pre-deploy/scripts/check-env.sh` finds validated keys by matching
// `KEY: z.` at the start of a line, so each key's schema must be written out inline
// rather than through a shared constant — otherwise it silently drops out of that check.
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  // Postgres connection strings only — this project talks to Postgres directly, never to
  // Supabase's REST API, so http(s) and other protocols are rejected here rather than downstream.
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  DIRECT_DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
});

const clientSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url().default("http://localhost:3000"),
});

// Literal property access is required: Next.js replaces `process.env.NEXT_PUBLIC_*`
// at build time only for statically analyzable references.
const clientRuntime = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
};

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

const client = parse(clientSchema, clientRuntime, "client");

// On the client, `process.env` only contains the inlined NEXT_PUBLIC_ values, so the server
// schema is parsed lazily. Each server key gets its own getter — parsing only that key's slice
// of `serverSchema` via `.pick()` — so reading one key never fails because a sibling key (e.g.
// an unset DATABASE_URL) is invalid or missing.
export const env = {
  ...client,
  get NODE_ENV() {
    return parse(serverSchema.pick({ NODE_ENV: true }), process.env, "server").NODE_ENV;
  },
  get DATABASE_URL() {
    return parse(serverSchema.pick({ DATABASE_URL: true }), process.env, "server").DATABASE_URL;
  },
  get DIRECT_DATABASE_URL() {
    return parse(serverSchema.pick({ DIRECT_DATABASE_URL: true }), process.env, "server")
      .DIRECT_DATABASE_URL;
  },
};
