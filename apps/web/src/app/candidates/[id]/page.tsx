import { notFound } from "next/navigation";
import { z } from "zod";

import { loadCandidateProfile } from "@/lib/candidates";
import { DatabaseTimeoutError } from "@/lib/database-timeout";
import { createCorrelationId, logServerError } from "@/lib/logger";
import { CandidateProfile } from "@/components/candidate-profile/candidate-profile";
import { ErrorFallback } from "@/components/error-fallback/error-fallback";
import { Button } from "@/components/ui/button";

// Live data — must never be prerendered at build time, where the connection string is absent.
export const dynamic = "force-dynamic";

export default async function CandidatePage({ params }: PageProps<"/candidates/[id]">) {
  const { id } = await params;
  const parsed = z.uuid().safeParse(id);

  // A non-uuid segment passed straight to a `uuid` column throws in Postgres, which would
  // surface as a 500 instead of a 404 — validate before querying.
  if (!parsed.success) {
    notFound();
  }

  let candidate: Awaited<ReturnType<typeof loadCandidateProfile>>;

  try {
    candidate = await loadCandidateProfile(parsed.data);
  } catch (error) {
    const correlationId = createCorrelationId();
    logServerError("/candidates/[id] failed to load the candidate", {
      correlationId,
      error,
      candidateId: parsed.data,
    });

    return (
      <main className="mx-auto flex min-h-dvh max-w-3xl flex-col p-8">
        <ErrorFallback
          title="This candidate could not be loaded"
          reference={correlationId}
          action={
            // A plain anchor, not a Link: this is the page we are already on, and only a full
            // request re-runs the query that failed.
            <Button asChild variant="outline">
              <a href={`/candidates/${parsed.data}`}>Try again</a>
            </Button>
          }
        >
          {error instanceof DatabaseTimeoutError
            ? "Loading this candidate took too long, so we stopped waiting. Nothing was lost — try again."
            : "We could not load this candidate just now. Nothing was lost — try again."}
        </ErrorFallback>
      </main>
    );
  }

  // Outside the `try`: `notFound()` works by throwing, and catching it would turn every unknown
  // candidate into a load failure.
  if (!candidate) {
    notFound();
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col p-8">
      <CandidateProfile
        candidate={{
          fullName: candidate.fullName,
          email: candidate.email,
          phone: candidate.phone,
          location: candidate.location,
          headline: candidate.headline,
          summary: candidate.summary,
          yearsExperience: candidate.yearsExperience,
          linkedinUrl: candidate.linkedinUrl,
          resumeUrl: candidate.resumeUrl,
        }}
        applications={candidate.applications.map((application) => ({
          id: application.id,
          jobTitle: application.job.title,
          stage: application.stage,
          appliedAt: application.appliedAt,
          transitions: application.transitions.map((transition) => ({
            id: transition.id,
            fromStage: transition.fromStage,
            toStage: transition.toStage,
            occurredAt: transition.occurredAt,
            reason: transition.reason,
          })),
        }))}
      />
    </main>
  );
}
