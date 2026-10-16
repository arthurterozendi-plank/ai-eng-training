import { db } from "@talentscout/db/client";

import { withDatabaseTimeout } from "@/lib/database-timeout";

/**
 * One candidate with their applications, each application's job title and its stage history —
 * everything the candidate profile page and `GET /api/candidates/[id]` render. `resumeText` is
 * never loaded.
 *
 * Resolves `undefined` when no candidate has this id. Rejects with `DatabaseTimeoutError` when
 * the database has not answered within `DATABASE_TIMEOUT_MS`, and with the driver's own error
 * when it fails outright. `id` must already be a validated uuid: Postgres rejects anything else
 * as a query error, not a miss.
 */
export function loadCandidateProfile(id: string) {
  return withDatabaseTimeout(
    db.query.candidates.findFirst({
      where: (c, { eq }) => eq(c.id, id),
      columns: { resumeText: false }, // never load the RAG-sized body
      with: {
        applications: {
          columns: { id: true, jobId: true, stage: true, appliedAt: true, stageChangedAt: true },
          orderBy: (a, { desc }) => [desc(a.appliedAt)],
          with: {
            job: { columns: { id: true, title: true } },
            transitions: {
              columns: { id: true, fromStage: true, toStage: true, occurredAt: true, reason: true },
              orderBy: (t, { asc }) => [asc(t.occurredAt), asc(t.id)],
            },
          },
        },
      },
    }),
  );
}
