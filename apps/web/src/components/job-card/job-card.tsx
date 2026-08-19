import * as React from "react";

import { cn } from "@/lib/utils";
import type { JobSummary } from "@/app/api/jobs/schema";

/**
 * One open role and where its candidates sit.
 *
 * The stage breakdown is a real `<table>` rather than a list of chips: a recruiter reading with
 * a screen reader needs each count announced with the stage it belongs to, which `rowheader` and
 * `cell` give for free and a `<ul>` of "Applied 3" strings does not.
 */
export function JobCard({
  job,
  className,
  ...props
}: React.ComponentProps<"article"> & { job: JobSummary }) {
  return (
    <article
      className={cn(
        "flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-5 text-card-foreground",
        className,
      )}
      {...props}
    >
      <header className="flex flex-col gap-1">
        <h2 className="text-base font-semibold tracking-tight">{job.title}</h2>
        <p className="text-sm text-muted-foreground">
          {job.department ? `${job.department} · ${job.location}` : job.location}
        </p>
      </header>

      <p className="text-sm text-muted-foreground">
        <span className="font-semibold text-foreground">{job.activeCandidates}</span>{" "}
        {job.activeCandidates === 1 ? "candidate" : "candidates"} still in play
      </p>

      <table className="w-full text-sm">
        <caption className="sr-only">Pipeline for {job.title}</caption>
        <tbody>
          {job.stageCounts.map((stage) => (
            <tr
              key={stage.key}
              data-terminal={stage.isTerminal || undefined}
              className="border-t border-border"
            >
              <th
                scope="row"
                className={cn(
                  "py-1.5 text-left font-normal",
                  stage.isTerminal && "text-muted-foreground",
                )}
              >
                {stage.label}
              </th>
              <td
                className={cn(
                  "py-1.5 text-right font-medium tabular-nums",
                  (stage.count === 0 || stage.isTerminal) && "text-muted-foreground",
                )}
              >
                {stage.count}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </article>
  );
}
