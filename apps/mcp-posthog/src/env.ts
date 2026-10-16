import { z } from "zod";

/**
 * Thrown when an environment variable fails schema validation. Named so callers can
 * distinguish a bad `.env` value from any other error a getter might raise.
 */
// Duplicated from `packages/db/src/env.ts` for the reason given there: a shared-errors package
// would exist only to hold six lines.
export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

// The private-API (app) host, not the `i.` ingestion host the browser SDK sends events to.
const API_HOST_MESSAGE =
  "must be the PostHog app host, e.g. https://us.posthog.com or https://eu.posthog.com";
const PROJECT_ID_MESSAGE = "must be the numeric project ID from PostHog's project settings";
const PERSONAL_API_KEY_MESSAGE =
  "must be a personal API key (phx_…), not the project token (phc_…) the browser SDK uses";

// `.claude/skills/pre-deploy/scripts/check-env.sh` finds validated keys by matching
// `KEY: z.` at the start of a line, so each key's schema must be written out inline, on one
// line — a schema Prettier wraps after `z` silently drops out of that check, which is why the
// messages above are hoisted.
const serverSchema = z.object({
  POSTHOG_API_HOST: z.url({ protocol: /^https?$/, error: API_HOST_MESSAGE }),
  POSTHOG_PROJECT_ID: z.string().regex(/^\d+$/, PROJECT_ID_MESSAGE),
  POSTHOG_PERSONAL_API_KEY: z.string().startsWith("phx_", PERSONAL_API_KEY_MESSAGE),
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

// Built once rather than per read: `.pick()` reconstructs a schema on every call.
const apiHostSchema = serverSchema.pick({ POSTHOG_API_HOST: true });
const projectIdSchema = serverSchema.pick({ POSTHOG_PROJECT_ID: true });
const personalApiKeySchema = serverSchema.pick({ POSTHOG_PERSONAL_API_KEY: true });

/**
 * The PostHog private-API settings this workspace owns, validated on read. Each key has its own
 * getter so the error a caller sees names exactly the key that is wrong.
 */
export const env = {
  get POSTHOG_API_HOST() {
    return parse(apiHostSchema, process.env, "server").POSTHOG_API_HOST;
  },
  get POSTHOG_PROJECT_ID() {
    return parse(projectIdSchema, process.env, "server").POSTHOG_PROJECT_ID;
  },
  get POSTHOG_PERSONAL_API_KEY() {
    return parse(personalApiKeySchema, process.env, "server").POSTHOG_PERSONAL_API_KEY;
  },
};
