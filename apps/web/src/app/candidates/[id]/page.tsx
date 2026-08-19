import { notFound } from "next/navigation";
import { db } from "@talentscout/db/client";
import { z } from "zod";

import { CandidateProfile } from "@/components/candidate-profile/candidate-profile";

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

  const candidate = await db.query.candidates.findFirst({
    where: (c, { eq }) => eq(c.id, parsed.data),
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
