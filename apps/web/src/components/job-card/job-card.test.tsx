import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { JobCard } from "@/components/job-card/job-card";
import type { JobSummary } from "@/app/api/jobs/schema";

const job: JobSummary = {
  id: "0f8c1f2e-0f5f-4a6d-9a5f-8f4f4b1f0001",
  title: "Senior Backend Engineer",
  location: "Remote (US)",
  department: "Engineering",
  activeCandidates: 8,
  stageCounts: [
    { key: "applied", label: "Applied", count: 2, isTerminal: false },
    { key: "screening", label: "Screening", count: 3, isTerminal: false },
    { key: "interview", label: "Interview", count: 0, isTerminal: false },
    { key: "offer", label: "Offer", count: 3, isTerminal: false },
    { key: "hired", label: "Hired", count: 1, isTerminal: true },
  ],
};

function stageRow(label: string): HTMLElement {
  return screen.getByRole("row", { name: new RegExp(`^${label}\\b`) });
}

describe("JobCard", () => {
  it("names the role and where it is based", () => {
    render(<JobCard job={job} />);

    expect(screen.getByRole("heading", { name: "Senior Backend Engineer" })).toBeInTheDocument();
    expect(screen.getByText("Engineering · Remote (US)")).toBeInTheDocument();
  });

  it("falls back to the location alone when the role has no department", () => {
    render(<JobCard job={{ ...job, department: null }} />);

    expect(screen.getByText("Remote (US)")).toBeInTheDocument();
  });

  it("binds each count to its stage so a screen reader announces the pair", () => {
    render(<JobCard job={job} />);

    expect(within(stageRow("Applied")).getByRole("rowheader")).toHaveTextContent("Applied");
    expect(within(stageRow("Applied")).getByRole("cell")).toHaveTextContent("2");
  });

  it("marks closed-out stages as terminal and open ones as not", () => {
    render(<JobCard job={job} />);

    expect(stageRow("Hired")).toHaveAttribute("data-terminal");
    expect(stageRow("Applied")).not.toHaveAttribute("data-terminal");
  });

  it("shows a count for every pipeline stage", () => {
    render(<JobCard job={job} />);

    expect(within(stageRow("Applied")).getByRole("cell")).toHaveTextContent("2");
    expect(within(stageRow("Screening")).getByRole("cell")).toHaveTextContent("3");
    expect(within(stageRow("Offer")).getByRole("cell")).toHaveTextContent("3");
    expect(within(stageRow("Hired")).getByRole("cell")).toHaveTextContent("1");
  });

  it("keeps a stage nobody is in visible rather than dropping the row", () => {
    render(<JobCard job={job} />);

    expect(within(stageRow("Interview")).getByRole("cell")).toHaveTextContent("0");
  });

  it("headlines how many candidates are still in play", () => {
    render(<JobCard job={job} />);

    expect(screen.getByText("8")).toBeInTheDocument();
    expect(screen.getByText(/candidates still in play/)).toBeInTheDocument();
  });

  it("says candidate, not candidates, when only one is in play", () => {
    render(<JobCard job={{ ...job, activeCandidates: 1 }} />);

    expect(screen.getByText(/candidate still in play/)).toBeInTheDocument();
  });

  it("labels the breakdown for screen readers", () => {
    render(<JobCard job={job} />);

    expect(
      screen.getByRole("table", { name: "Pipeline for Senior Backend Engineer" }),
    ).toBeInTheDocument();
  });
});
