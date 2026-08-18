import { describe, expect, it } from "vitest";

import {
  applicationSource,
  employmentType,
  interviewKind,
  interviewRecommendation,
  interviewStatus,
  jobStatus,
} from "@/lib/db/schema/enums";

describe("enums", () => {
  it("declares job_status per §3.1", () => {
    expect(jobStatus.enumValues).toEqual(["draft", "open", "paused", "closed", "filled"]);
  });

  it("declares employment_type per §3.1", () => {
    expect(employmentType.enumValues).toEqual(["full_time", "part_time", "contract", "internship"]);
  });

  it("declares application_source per §3.1", () => {
    expect(applicationSource.enumValues).toEqual([
      "careers_site",
      "referral",
      "linkedin",
      "job_board",
      "agency",
      "email",
      "import",
    ]);
  });

  it("declares interview_kind per §3.1", () => {
    expect(interviewKind.enumValues).toEqual(["phone_screen", "technical", "onsite", "final"]);
  });

  it("declares interview_status per §3.1", () => {
    expect(interviewStatus.enumValues).toEqual(["scheduled", "completed", "cancelled", "no_show"]);
  });

  it("declares interview_recommendation per §3.1", () => {
    expect(interviewRecommendation.enumValues).toEqual(["strong_no", "no", "yes", "strong_yes"]);
  });
});
