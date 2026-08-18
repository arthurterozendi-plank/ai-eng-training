import type { Metadata } from "next";

import { JobCard } from "@/components/job-card/job-card";
import { Button } from "@/components/ui/button";
import { loadOpenJobs } from "@/app/api/jobs/route";
import { MAX_JOBS_LIMIT, type JobSummary } from "@/app/api/jobs/schema";

export const metadata: Metadata = {
  title: "Open roles",
};

// Pipeline counts move all day; a page prerendered at build time would show a recruiter where
// candidates stood at deploy time.
export const dynamic = "force-dynamic";

export default async function JobsPage() {
  let jobs: JobSummary[];

  try {
    // The list is the "every open role" surface, so it asks for the endpoint's ceiling rather
    // than the smaller default a scripted caller gets.
    jobs = await loadOpenJobs({ limit: MAX_JOBS_LIMIT });
  } catch (error) {
    // The reader gets a retry, not a stack trace; the cause stays in the server log.
    console.error("/jobs failed to load open roles", error);

    return (
      <PageShell>
        <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-card-foreground">
          <p className="text-sm text-muted-foreground">
            We could not load the open roles just now. Nothing was lost — try again.
          </p>
          {/* A plain anchor, not a Link: this is the page we are already on, and only a full
              request re-runs the query that failed. */}
          <Button asChild variant="outline">
            <a href="/jobs">Try again</a>
          </Button>
        </div>
      </PageShell>
    );
  }

  if (jobs.length === 0) {
    return (
      <PageShell>
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          No roles are open right now. Roles appear here as soon as they are opened.
        </p>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {jobs.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ul>
    </PageShell>
  );
}

function PageShell({ children }: React.ComponentProps<"main">) {
  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 bg-background p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Open roles</h1>
        <p className="text-sm text-muted-foreground">
          Every live role and how many candidates sit in each stage today.
        </p>
      </header>
      {children}
    </main>
  );
}
