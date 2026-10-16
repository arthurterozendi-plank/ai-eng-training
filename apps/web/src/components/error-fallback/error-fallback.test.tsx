import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { ErrorFallback } from "@/components/error-fallback/error-fallback";

describe("ErrorFallback", () => {
  it("announces the failure with its heading, explanation, reference and action", () => {
    render(
      <ErrorFallback
        title="This candidate could not be loaded"
        reference="3f2b6c1e-0000-4000-8000-000000000000"
        action={<button type="button">Try again</button>}
      >
        Nothing was lost — try again.
      </ErrorFallback>,
    );

    const alert = screen.getByRole("alert");

    expect(alert).toContainElement(
      screen.getByRole("heading", { level: 1, name: "This candidate could not be loaded" }),
    );
    expect(alert).toHaveTextContent("Nothing was lost — try again.");
    expect(alert).toHaveTextContent("Reference: 3f2b6c1e-0000-4000-8000-000000000000");
    expect(alert).toContainElement(screen.getByRole("button", { name: "Try again" }));
  });

  it("renders no reference line when there is no reference to quote", () => {
    render(
      <ErrorFallback title="Something went wrong" action={<button type="button">Try again</button>}>
        Try again.
      </ErrorFallback>,
    );

    expect(screen.getByRole("alert")).not.toHaveTextContent("Reference");
  });

  it("lets a caller's class win a conflict", () => {
    render(
      <ErrorFallback title="Something went wrong" action={null} className="p-0">
        Try again.
      </ErrorFallback>,
    );

    expect(screen.getByRole("alert")).toHaveClass("p-0");
    expect(screen.getByRole("alert")).not.toHaveClass("p-5");
  });
});
