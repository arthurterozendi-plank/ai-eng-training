import type { PipelineStageKey } from "@talentscout/db/schema/pipeline-stages";
import { z } from "zod";

/** Path parameters accepted by `GET /api/candidates/[id]`. */
export const candidateParams = z.object({ id: z.uuid() });

export type CandidateParams = z.infer<typeof candidateParams>;

/** Success payload of `GET /api/candidates/[id]`. */
export type CandidateResponse = {
  candidate: {
    id: string;
    fullName: string;
    email: string;
    phone: string | null;
    location: string | null;
    headline: string | null;
    summary: string | null;
    yearsExperience: number | null;
    linkedinUrl: string | null;
    resumeUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  applications: Array<{
    id: string;
    jobId: string;
    jobTitle: string;
    stage: PipelineStageKey;
    appliedAt: string;
    stageChangedAt: string;
    transitions: Array<{
      id: string;
      fromStage: PipelineStageKey | null;
      toStage: PipelineStageKey;
      occurredAt: string;
      reason: string | null;
    }>;
  }>;
};

/** Payload returned by every non-2xx response from this route. */
export type ErrorResponse = {
  error: string;
  issues?: unknown;
};
