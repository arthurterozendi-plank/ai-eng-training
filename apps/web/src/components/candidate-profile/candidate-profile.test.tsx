import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  CandidateProfile,
  type CandidateProfileProps,
} from "@/components/candidate-profile/candidate-profile";

const baseCandidate: CandidateProfileProps["candidate"] = {
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+1-555-0100",
  location: "London, UK",
  headline: "Senior Software Engineer",
  summary: "Pioneering computer scientist.",
  yearsExperience: 12,
  linkedinUrl: "https://linkedin.com/in/ada",
  resumeUrl: "https://example.com/resume/ada.pdf",
};

/** Collapses the whitespace React introduces between text nodes so assertions read as the UI does. */
function normalized(element: Element): string {
  return element.textContent?.replace(/\s+/g, " ").trim() ?? "";
}

describe("CandidateProfile", () => {
  it("renders the candidate's name as the page heading", () => {
    render(<CandidateProfile candidate={baseCandidate} applications={[]} />);

    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
  });

  it("renders the candidate's details", () => {
    render(<CandidateProfile candidate={baseCandidate} applications={[]} />);

    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.getByText("London, UK")).toBeInTheDocument();
    expect(screen.getByText("Senior Software Engineer")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("renders one level-2 heading per application, newest first regardless of input order", () => {
    render(
      <CandidateProfile
        candidate={baseCandidate}
        applications={[
          // Deliberately oldest first, so the rendered order can only come from the sort.
          {
            id: "app-2",
            jobTitle: "Frontend Engineer",
            stage: "applied",
            appliedAt: new Date("2026-01-01T00:00:00.000Z"),
            transitions: [],
          },
          {
            id: "app-1",
            jobTitle: "Backend Engineer",
            stage: "interview",
            appliedAt: new Date("2026-02-01T00:00:00.000Z"),
            transitions: [],
          },
        ]}
      />,
    );

    const headings = screen.getAllByRole("heading", { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "Backend Engineer",
      "Frontend Engineer",
    ]);
  });

  it("renders an application's transitions oldest to newest, regardless of input order", () => {
    render(
      <CandidateProfile
        candidate={baseCandidate}
        applications={[
          {
            id: "app-1",
            jobTitle: "Backend Engineer",
            stage: "interview",
            appliedAt: new Date("2026-03-14T00:00:00.000Z"),
            // Deliberately out of order: newest first, oldest last.
            transitions: [
              {
                id: "c-trans",
                fromStage: "screening",
                toStage: "interview",
                occurredAt: new Date("2026-03-16T15:00:00.000Z"),
                reason: null,
              },
              {
                id: "a-trans",
                fromStage: null,
                toStage: "applied",
                occurredAt: new Date("2026-03-14T09:00:00.000Z"),
                reason: null,
              },
              {
                id: "b-trans",
                fromStage: "applied",
                toStage: "screening",
                occurredAt: new Date("2026-03-15T12:00:00.000Z"),
                reason: null,
              },
            ],
          },
        ]}
      />,
    );

    const items = screen.getAllByRole("listitem").map(normalized);
    expect(items).toHaveLength(3);
    expect(items[0]).toContain("Applied");
    // Each move names where it came from as well as where it went, and the "to" comes from the
    // screen-reader-only word paired with the decorative arrow.
    expect(items[1]).toContain("Applied");
    expect(items[1]).toContain("to Screening");
    expect(items[2]).toContain("Screening");
    expect(items[2]).toContain("to Interview");
  });

  it("shows an explicit empty state when the candidate has no applications", () => {
    render(<CandidateProfile candidate={baseCandidate} applications={[]} />);

    expect(screen.getByText("No applications yet.")).toBeInTheDocument();
  });

  it("shows an explicit per-application empty state when an application has no transitions", () => {
    render(
      <CandidateProfile
        candidate={baseCandidate}
        applications={[
          {
            id: "app-1",
            jobTitle: "Backend Engineer",
            stage: "applied",
            appliedAt: new Date("2026-02-01T00:00:00.000Z"),
            transitions: [],
          },
        ]}
      />,
    );

    expect(screen.getByText("No stage changes recorded.")).toBeInTheDocument();
    expect(screen.queryAllByRole("listitem")).toHaveLength(0);
  });

  it("renders a stage key as its seed label", () => {
    render(
      <CandidateProfile
        candidate={baseCandidate}
        applications={[
          {
            id: "app-1",
            jobTitle: "Backend Engineer",
            stage: "screening",
            appliedAt: new Date("2026-02-01T00:00:00.000Z"),
            transitions: [],
          },
        ]}
      />,
    );

    expect(screen.getByText(/Current stage: Screening/)).toBeInTheDocument();
  });

  it("formats dates deterministically and exposes an ISO dateTime attribute", () => {
    const appliedAt = new Date("2026-03-14T00:00:00.000Z");

    render(
      <CandidateProfile
        candidate={baseCandidate}
        applications={[
          {
            id: "app-1",
            jobTitle: "Backend Engineer",
            stage: "applied",
            appliedAt,
            transitions: [],
          },
        ]}
      />,
    );

    const timeElement = screen.getByText("Mar 14, 2026");
    expect(timeElement.tagName).toBe("TIME");
    expect(timeElement).toHaveAttribute("datetime", appliedAt.toISOString());
  });

  it("tolerates null fields without rendering an empty labelled row", () => {
    const candidateWithNulls: CandidateProfileProps["candidate"] = {
      ...baseCandidate,
      phone: null,
      location: null,
      headline: null,
      summary: null,
      yearsExperience: null,
    };

    render(<CandidateProfile candidate={candidateWithNulls} applications={[]} />);

    expect(screen.getByRole("heading", { level: 1, name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.queryByText(/Phone/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Location/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Headline/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Summary/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Years of experience/)).not.toBeInTheDocument();
  });
});
