import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * What a recruiter sees in place of a page that failed: a heading, an explanation (`children`),
 * the reference id to quote when reporting it, and a way to try again (`action`). The heading is
 * an `<h1>` because the fallback always replaces a page's whole content.
 */
function ErrorFallback({
  title,
  reference,
  action,
  children,
  className,
  ...props
}: React.ComponentProps<"div"> & {
  title: string;
  reference?: string;
  action: React.ReactNode;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-5 text-card-foreground",
        className,
      )}
      {...props}
    >
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{children}</p>
      {reference ? (
        <p className="text-xs text-muted-foreground">
          Reference: <code className="font-mono">{reference}</code>
        </p>
      ) : null}
      {action}
    </div>
  );
}

export { ErrorFallback };
