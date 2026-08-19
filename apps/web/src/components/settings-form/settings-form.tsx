"use client";

import { cn } from "@/lib/utils";
import {
  DATE_FORMAT_OPTIONS,
  DENSITY_OPTIONS,
  RESULTS_PER_PAGE_OPTIONS,
  usePreferences,
  type DateFormat,
  type Density,
  type ResultsPerPage,
} from "@/hooks/use-preferences";

const DENSITY_LABELS: Record<Density, string> = {
  comfortable: "Comfortable",
  compact: "Compact",
};

const DATE_FORMAT_LABELS: Record<DateFormat, string> = {
  relative: "Relative (2 days ago)",
  absolute: "Exact (Aug 16, 2026, 2:30 PM)",
};

const selectClassName = cn(
  "rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none",
);

/** Names shown in the preview's two sample candidate rows. */
const SAMPLE_CANDIDATES = ["Jordan Lee", "Priya Shah"] as const;

const TOTAL_PREVIEW_CANDIDATES = 128;

// Fixed, not `Date.now()`: a live clock would both hydration-mismatch (the
// server and client would compute different "days ago" values) and make the
// preview's text flaky across CI runs.
const SAMPLE_APPLIED_AT = new Date("2026-08-16T14:30:00Z");
const SAMPLE_NOW = new Date("2026-08-18T14:30:00Z");
const SAMPLE_APPLIED_DAYS_AGO = Math.round(
  (SAMPLE_APPLIED_AT.getTime() - SAMPLE_NOW.getTime()) / (24 * 60 * 60 * 1000),
);

const relativeAppliedAtFormatter = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });
// `timeZone: "UTC"` is required: without it the rendered day shifts with the
// machine's local timezone, which passes locally and fails in CI.
const absoluteAppliedAtFormatter = new Intl.DateTimeFormat("en-US", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

function formatSampleAppliedAt(dateFormat: DateFormat): string {
  return dateFormat === "relative"
    ? relativeAppliedAtFormatter.format(SAMPLE_APPLIED_DAYS_AGO, "day")
    : absoluteAppliedAtFormatter.format(SAMPLE_APPLIED_AT);
}

export function SettingsForm() {
  const { preferences, setPreference, status } = usePreferences();

  return (
    <form
      aria-label="Display preferences"
      className="flex flex-col gap-6 rounded-lg border border-border bg-card p-6"
    >
      {status === "session-only" && (
        <p
          role="status"
          className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
        >
          Your browser is blocking or has run out of storage, so these preferences will apply for
          this visit only and will not survive a reload.
        </p>
      )}

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium text-foreground">Row density</legend>
        <div className="flex flex-col gap-2">
          {DENSITY_OPTIONS.map((option) => (
            <label key={option} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="radio"
                name="density"
                value={option}
                checked={preferences.density === option}
                onChange={() => setPreference("density", option)}
                className={cn(
                  "size-4 border-input text-primary focus-visible:ring-3 focus-visible:ring-ring/50",
                )}
              />
              {DENSITY_LABELS[option]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <label htmlFor="date-format" className="text-sm font-medium text-foreground">
          Date display
        </label>
        <select
          id="date-format"
          value={preferences.dateFormat}
          onChange={(event) => setPreference("dateFormat", event.target.value as DateFormat)}
          className={selectClassName}
        >
          {DATE_FORMAT_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {DATE_FORMAT_LABELS[option]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="results-per-page" className="text-sm font-medium text-foreground">
          Results per page
        </label>
        <select
          id="results-per-page"
          value={preferences.resultsPerPage}
          onChange={(event) =>
            setPreference("resultsPerPage", Number(event.target.value) as ResultsPerPage)
          }
          className={selectClassName}
        >
          {RESULTS_PER_PAGE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>

      <section
        aria-label="Preview"
        className="flex flex-col gap-3 rounded-lg border border-border bg-muted p-4"
      >
        <p className="text-sm font-medium text-foreground">Preview</p>
        <ul className="overflow-hidden rounded-lg border border-border bg-card">
          {SAMPLE_CANDIDATES.map((name) => (
            <li
              key={name}
              className={cn(
                "flex items-center justify-between border-b border-border px-3 last:border-b-0",
                preferences.density === "compact" ? "py-1.5" : "py-3",
              )}
            >
              <span className="text-sm text-foreground">{name}</span>
              <span className="text-xs text-muted-foreground">
                Applied {formatSampleAppliedAt(preferences.dateFormat)}
              </span>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted-foreground">
          Showing 1–{preferences.resultsPerPage} of {TOTAL_PREVIEW_CANDIDATES} candidates
        </p>
      </section>
    </form>
  );
}
