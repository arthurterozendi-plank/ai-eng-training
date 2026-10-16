import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import CandidateError from "@/app/candidates/[id]/error";

// In development Next forwards the original message to the boundary; in production it is
// already generic. The boundary must not show it in either case.
const SERVER_DETAIL = "connect ECONNREFUSED 10.0.0.7:6543";

function renderBoundary(digest?: string) {
  const retry = vi.fn();
  render(
    <CandidateError error={Object.assign(new Error(SERVER_DETAIL), { digest })} retry={retry} />,
  );

  return { retry };
}

describe("CandidateError", () => {
  it("explains the failure and quotes Next's digest as the reference", () => {
    renderBoundary("2840135561");

    const alert = screen.getByRole("alert");

    expect(alert).toHaveTextContent("Something went wrong showing this candidate");
    expect(alert).toHaveTextContent("Reference: 2840135561");
    expect(alert).not.toHaveTextContent(SERVER_DETAIL);
  });

  it("re-fetches the segment when the recruiter tries again", async () => {
    const { retry } = renderBoundary("2840135561");

    await userEvent.click(screen.getByRole("button", { name: "Try again" }));

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("still offers a retry when there is no digest to quote", () => {
    renderBoundary(undefined);

    expect(screen.getByRole("alert")).not.toHaveTextContent("Reference");
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});
