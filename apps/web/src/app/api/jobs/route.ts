import { db } from "@talentscout/db/client";

import {
  DEFAULT_JOBS_SEARCH_PARAMS,
  jobsSearchParamsSchema,
  type JobsResponseBody,
  type JobsSearchParams,
  type JobSummary,
} from "./schema";

// A recruiter is looking at today's pipeline; a response prerendered at build time would show
// the counts as they stood when the app was deployed.
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Loads up to `params.limit` open roles (20 by default), most recently opened first, each with
 * a candidate count for every pipeline stage.
 *
 * Exported so `apps/web/src/app/jobs/page.tsx` can render it directly instead of fetching this
 * route over HTTP — the Next.js data-fetching guide points Server Components at the ORM rather
 * than at their own API surface. It would sit more naturally in `src/lib/jobs.ts`, which this
 * ticket's file footprint puts out of bounds; see the PR body.
 *
 * The tally is computed here rather than by a SQL `GROUP BY` because `drizzle-orm` is not a
 * dependency of this workspace, so its aggregate helpers cannot be imported. The relational
 * query is still one round trip and selects only the single `stage` column it counts.
 */
export async function loadOpenJobs(
  params: JobsSearchParams = DEFAULT_JOBS_SEARCH_PARAMS,
): Promise<JobSummary[]> {
  const [stages, rows] = await Promise.all([
    db.query.pipelineStages.findMany({
      columns: { key: true, label: true, isTerminal: true },
      orderBy: (stage, { asc }) => [asc(stage.position)],
    }),
    db.query.jobs.findMany({
      columns: { id: true, title: true, location: true, department: true },
      where: (job, { eq }) => eq(job.status, "open"),
      orderBy: (job, { desc }) => [desc(job.openedAt)],
      limit: params.limit,
      with: { applications: { columns: { stage: true } } },
    }),
  ]);

  // Without the stage rows every role would report an empty breakdown and zero candidates, which
  // reads as "nobody has applied" rather than "the lookup table did not load". Failing here puts
  // the caller into its error state instead of quietly lying.
  if (stages.length === 0) {
    throw new Error("pipeline_stages returned no rows");
  }

  return rows.map((job) => {
    const tally = new Map<string, number>();

    for (const application of job.applications) {
      tally.set(application.stage, (tally.get(application.stage) ?? 0) + 1);
    }

    const stageCounts = stages.map((stage) => ({
      key: stage.key,
      label: stage.label,
      isTerminal: stage.isTerminal,
      count: tally.get(stage.key) ?? 0,
    }));

    return {
      id: job.id,
      title: job.title,
      location: job.location,
      department: job.department,
      activeCandidates: stageCounts.reduce(
        (total, stage) => (stage.isTerminal ? total : total + stage.count),
        0,
      ),
      stageCounts,
    };
  });
}

/** Returns the open roles and their pipeline counts as JSON. */
export async function GET(request: Request): Promise<Response> {
  const parsed = jobsSearchParamsSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams),
  );

  if (!parsed.success) {
    return Response.json(
      {
        error: "Invalid search parameters.",
        issues: parsed.error.issues.map((issue) => ({
          param: issue.path.join("."),
          message: issue.message,
        })),
      },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const jobs = await loadOpenJobs(parsed.data);

    return Response.json({ jobs } satisfies JobsResponseBody, { headers: NO_STORE });
  } catch (error) {
    // The caller gets a generic message; the cause stays in the server log, where a connection
    // string or a query fragment cannot leak to the browser.
    console.error("GET /api/jobs failed to load open roles", error);

    return Response.json(
      { error: "Could not load open roles." },
      { status: 500, headers: NO_STORE },
    );
  }
}
