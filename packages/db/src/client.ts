import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { env } from "@/env";
import { applicationStageTransitions } from "@/schema/application-stage-transitions";
import { applications } from "@/schema/applications";
import { candidates } from "@/schema/candidates";
import { interviews } from "@/schema/interviews";
import { jobs } from "@/schema/jobs";
import { notes } from "@/schema/notes";
import { pipelineStages } from "@/schema/pipeline-stages";
import * as relations from "@/schema/relations";

/**
 * Every table and every `relations()` declaration, in the shape Drizzle's query builder expects.
 * Passing this to `drizzle()` is what makes `db.query.<table>.findMany({ with: … })` resolve;
 * without it the client supports only the hand-written `select()` API.
 */
export const schema = {
  applicationStageTransitions,
  applications,
  candidates,
  interviews,
  jobs,
  notes,
  pipelineStages,
  ...relations,
};

// Next's dev server re-evaluates modules on every hot reload, and each evaluation would open a
// pool the previous one never closed — exhausting Postgres' connection limit within a few edits.
// `globalThis` survives module re-evaluation, so the pool is created once per process.
const globalForDb = globalThis as typeof globalThis & {
  talentscoutSql?: ReturnType<typeof postgres>;
};

/**
 * The application's Postgres client, connected through `DATABASE_URL` — the pooled connection
 * string. Server-only: importing it from a Client Component would put the connection string in
 * the browser bundle.
 *
 * Migrations and seeding deliberately do not use this. They open their own connection against
 * `DIRECT_DATABASE_URL`, because a transaction pooler cannot run DDL.
 */
export const db = drizzle((globalForDb.talentscoutSql ??= postgres(env.DATABASE_URL)), { schema });
