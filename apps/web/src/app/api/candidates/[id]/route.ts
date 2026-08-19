import { db } from "@talentscout/db/client";
import { z } from "zod";

import { candidateParams, type CandidateResponse, type ErrorResponse } from "./schema";

// Live data — without both this and the `Cache-Control` header below, Next prerenders the
// route at build time and serves a stale candidate.
export const dynamic = "force-dynamic";

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

    return Response.json(body, { status: 400 });
  }

  // TODO: authorization

  try {
    const candidate = await db.query.candidates.findFirst({
      where: (c, { eq }) => eq(c.id, parsed.data.id),
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
    });

    if (!candidate) {
      const body: ErrorResponse = { error: "Candidate not found" };

      return Response.json(body, { status: 404 });
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

    return Response.json(payload, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/candidates/[id] failed", error);

    const body: ErrorResponse = { error: "Internal server error" };

    return Response.json(body, { status: 500 });
  }
}
