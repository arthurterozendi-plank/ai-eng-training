import * as React from "react";
import { PIPELINE_STAGE_SEED, type PipelineStageKey } from "@talentscout/db/schema/pipeline-stages";

import { cn } from "@/lib/utils";

/** Human label for a pipeline stage key, e.g. `"screening"` -> `"Screening"`. */
const STAGE_LABELS: Record<PipelineStageKey, string> = Object.fromEntries(
  PIPELINE_STAGE_SEED.map((stage) => [stage.key, stage.label]),
) as Record<PipelineStageKey, string>;

// Built once at module scope, not per row — Intl.DateTimeFormat construction is not free.
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

/** Props for {@link CandidateProfile}: a candidate and every application they made, each with its own stage-transition timeline. */
export type CandidateProfileProps = {
  candidate: {
    fullName: string;
    email: string;
    phone: string | null;
    location: string | null;
    headline: string | null;
    summary: string | null;
    yearsExperience: number | null;
    linkedinUrl: string | null;
    resumeUrl: string | null;
  };
  applications: ReadonlyArray<{
    id: string;
    jobTitle: string;
    stage: PipelineStageKey;
    appliedAt: Date;
    transitions: ReadonlyArray<{
      id: string;
      fromStage: PipelineStageKey | null;
      toStage: PipelineStageKey;
      occurredAt: Date;
      reason: string | null;
    }>;
  }>;
} & React.ComponentProps<"article">;

/** A recruiter-facing candidate profile: details plus every application's dated stage-transition timeline, ready for a call. */
function CandidateProfile({
  candidate,
  applications,
  className,
  id,
  ...props
}: CandidateProfileProps) {
  const headingId = id ? `${id}-heading` : "candidate-profile-heading";

  // Copy before sorting — the props arrays must not be mutated.
  const sortedApplications = [...applications].sort(
    (a, b) => b.appliedAt.getTime() - a.appliedAt.getTime(),
  );

  return (
    <article
      id={id}
      aria-labelledby={headingId}
      className={cn("flex flex-col gap-6", className)}
      {...props}
    >
      <h1 id={headingId} className="text-2xl font-semibold text-foreground">
        {candidate.fullName}
      </h1>

      <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        <DetailRow label="Email" value={candidate.email} />
        <DetailRow label="Phone" value={candidate.phone} />
        <DetailRow label="Location" value={candidate.location} />
        <DetailRow label="Headline" value={candidate.headline} />
        <DetailRow
          label="Years of experience"
          value={candidate.yearsExperience === null ? null : String(candidate.yearsExperience)}
        />
        <DetailRow label="Summary" value={candidate.summary} />
        <DetailLink label="LinkedIn" href={candidate.linkedinUrl} />
        <DetailLink label="Resume" href={candidate.resumeUrl} />
      </dl>

      {sortedApplications.length === 0 ? (
        <p className="text-sm text-muted-foreground">No applications yet.</p>
      ) : (
        <div className="flex flex-col gap-6">
          {sortedApplications.map((application) => (
            <ApplicationSection key={application.id} application={application} />
          ))}
        </div>
      )}
    </article>
  );
}

function ApplicationSection({
  application,
}: {
  application: CandidateProfileProps["applications"][number];
}) {
  // Copy before sorting — occurredAt ascending, tie-broken by id so equal timestamps
  // render deterministically instead of depending on input order.
  const sortedTransitions = [...application.transitions].sort((a, b) => {
    const byTime = a.occurredAt.getTime() - b.occurredAt.getTime();
    return byTime !== 0 ? byTime : a.id.localeCompare(b.id);
  });

  return (
    <section className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4 text-card-foreground">
      <h2 className="text-lg font-medium">{application.jobTitle}</h2>
      <p className="text-sm text-muted-foreground">
        Current stage: {STAGE_LABELS[application.stage]} · Applied{" "}
        <time dateTime={application.appliedAt.toISOString()}>
          {dateFormatter.format(application.appliedAt)}
        </time>
      </p>

      {sortedTransitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">No stage changes recorded.</p>
      ) : (
        <ol className="flex flex-col gap-1">
          {sortedTransitions.map((transition) => (
            <li key={transition.id} className="text-sm text-foreground">
              {transition.fromStage ? (
                <>
                  {STAGE_LABELS[transition.fromStage]}
                  <span aria-hidden="true"> → </span>
                  <span className="sr-only"> to </span>
                </>
              ) : null}
              {STAGE_LABELS[transition.toStage]}
              {" — "}
              <time dateTime={transition.occurredAt.toISOString()}>
                {dateTimeFormatter.format(transition.occurredAt)}
              </time>
              {transition.reason ? ` (${transition.reason})` : null}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null }) {
  if (value === null) {
    return null;
  }

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{value}</dd>
    </div>
  );
}

function DetailLink({ label, href }: { label: string; href: string | null }) {
  if (href === null) {
    return null;
  }

  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-primary"
        >
          {href}
        </a>
      </dd>
    </div>
  );
}

export { CandidateProfile };
