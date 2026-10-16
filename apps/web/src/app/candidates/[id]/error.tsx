"use client";

import { ErrorFallback } from "@/components/error-fallback/error-fallback";
import { Button } from "@/components/ui/button";

// Catches what the page's own load handling does not: an error thrown while rendering a
// candidate that did load. `error.message` is never shown — in development it is the raw server
// message. `digest` is the id Next prints beside the error in its own server log.
export default function CandidateError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col p-8">
      <ErrorFallback
        title="This candidate could not be shown"
        reference={error.digest}
        action={
          <Button variant="outline" onClick={() => retry()}>
            Try again
          </Button>
        }
      >
        Something went wrong showing this candidate. Nothing was lost — try again.
      </ErrorFallback>
    </main>
  );
}
