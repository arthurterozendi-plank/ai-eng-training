import { z } from "zod";

/**
 * Environment variables, validated at module load.
 *
 * Server-only values live in `serverSchema` and must never be imported from a
 * Client Component. Anything the browser needs must be prefixed NEXT_PUBLIC_
 * and referenced literally below so Next.js can inline it at build time.
 */
const serverSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
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
    throw new Error(`Invalid ${label} environment variables:\n${issues}`);
  }

  return result.data;
}

const client = parse(clientSchema, clientRuntime, "client");

// On the client, `process.env` only contains the inlined NEXT_PUBLIC_ values, so
// the server schema is parsed lazily and only where it is actually reachable.
export const env = {
  ...client,
  get NODE_ENV() {
    return parse(serverSchema, process.env, "server").NODE_ENV;
  },
};
