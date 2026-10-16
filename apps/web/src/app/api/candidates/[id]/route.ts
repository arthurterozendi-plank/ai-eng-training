import { z } from "zod";

import { loadCandidateProfile } from "@/lib/candidates";
import { DatabaseTimeoutError } from "@/lib/database-timeout";
import { createCorrelationId, logServerError } from "@/lib/logger";

import { candidateParams, type CandidateResponse, type ErrorResponse } from "./schema";

// Live data — without both this and the `Cache-Control` header below, Next prerenders the
// route at build time and serves a stale candidate.
export const dynamic = "force-dynamic";

// Applied to every branch, error responses included — a cached 400/404/500 outlives the
// condition that caused it.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(
  request: Request,
  context: RouteContext<"/api/candidates/[id]">,
): Promise<Response> {
  const { id } = await context.params;
  const parsed = candidateParams.safeParse({ id });

  if (!parsed.success) {
    const body: ErrorResponse = {
      error: "Invalid candidate id",
      issues: z.treeifyError(parsed.error),
    };

    return Response.json(body, { status: 400, headers: NO_STORE });
  }

  // TODO: authorization

  try {
    const candidate = await loadCandidateProfile(parsed.data.id);

    if (!candidate) {
      const body: ErrorResponse = { error: "Candidate not found" };

      return Response.json(body, { status: 404, headers: NO_STORE });
    }

    const payload: CandidateResponse = {
      candidate: {
        id: candidate.id,
        fullName: candidate.fullName,
        email: candidate.email,
        phone: candidate.phone,
        location: candidate.location,
        headline: candidate.headline,
        summary: candidate.summary,
        yearsExperience: candidate.yearsExperience,
        linkedinUrl: candidate.linkedinUrl,
        resumeUrl: candidate.resumeUrl,
        createdAt: candidate.createdAt.toISOString(),
        updatedAt: candidate.updatedAt.toISOString(),
      },
      applications: candidate.applications.map((application) => ({
        id: application.id,
        jobId: application.jobId,
        jobTitle: application.job.title,
        stage: application.stage,
        appliedAt: application.appliedAt.toISOString(),
        stageChangedAt: application.stageChangedAt.toISOString(),
        transitions: application.transitions.map((transition) => ({
          id: transition.id,
          fromStage: transition.fromStage,
          toStage: transition.toStage,
          occurredAt: transition.occurredAt.toISOString(),
          reason: transition.reason,
        })),
      })),
    };

    return Response.json(payload, { headers: NO_STORE });
  } catch (error) {
    const correlationId = createCorrelationId();
    logServerError("GET /api/candidates/[id] failed", {
      correlationId,
      error,
      candidateId: parsed.data.id,
    });

    const body: ErrorResponse = {
      error:
        error instanceof DatabaseTimeoutError
          ? "Timed out loading candidate"
          : "Internal server error",
      correlationId,
    };

    return Response.json(body, { status: 500, headers: NO_STORE });
  }
}
