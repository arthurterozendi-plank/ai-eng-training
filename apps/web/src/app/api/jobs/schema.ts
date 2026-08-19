import { z } from "zod";

/** The most roles one request may ask for. */
export const MAX_JOBS_LIMIT = 100;

/**
 * Search params accepted by `GET /api/jobs`.
 *
 * `limit` is capped rather than optional because a public endpoint must never return an
 * unbounded result set. There is deliberately no status, sort, or pagination cursor: the
 * endpoint answers one question — which roles are open right now.
 */
export const jobsSearchParamsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_JOBS_LIMIT).default(20),
});

/** Validated search params for `GET /api/jobs`. */
export type JobsSearchParams = z.infer<typeof jobsSearchParamsSchema>;

/** The search params applied when a caller supplies none. */
export const DEFAULT_JOBS_SEARCH_PARAMS: JobsSearchParams = jobsSearchParamsSchema.parse({});

/**
 * How many candidates sit in one pipeline stage of one job. `isTerminal` mirrors the
 * `pipeline_stages` column so the UI can de-emphasise stages nobody is waiting on without
 * hiding them.
 */
export type JobStageCount = {
  key: string;
  label: string;
  count: number;
  isTerminal: boolean;
};

/** An open role as both the jobs list and `GET /api/jobs` present it. */
export type JobSummary = {
  id: string;
  title: string;
  location: string;
  department: string | null;
  /** Candidates in a non-terminal stage — the ones a recruiter still has to move today. */
  activeCandidates: number;
  /** One entry per pipeline stage, in `pipeline_stages.position` order, zero counts included. */
  stageCounts: JobStageCount[];
};

/** Body returned by a successful `GET /api/jobs`. */
export type JobsResponseBody = {
  jobs: JobSummary[];
};
