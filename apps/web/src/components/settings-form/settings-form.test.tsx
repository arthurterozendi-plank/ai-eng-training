import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PREFERENCES_STORAGE_KEY } from "@/hooks/use-preferences";
import { SettingsForm } from "@/components/settings-form/settings-form";

describe("SettingsForm", () => {
  beforeEach(() => {
    // jsdom keeps localStorage across tests in a file; without this, tests
    // pass in isolation and fail once run together.
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("exposes itself as a named form", () => {
    render(<SettingsForm />);

    expect(screen.getByRole("form", { name: "Display preferences" })).toBeInTheDocument();
  });

  it("renders the row density controls on empty storage", () => {
    render(<SettingsForm />);

    const group = screen.getByRole("group", { name: "Row density" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Compact" })).not.toBeChecked();
  });

  it("renders the date display and results per page controls on empty storage", () => {
    render(<SettingsForm />);

    expect(screen.getByRole("combobox", { name: "Date display" })).toHaveValue("relative");
    expect(screen.getByRole("combobox", { name: "Results per page" })).toHaveValue("25");
  });

  it("reaches all three groups in tab order", async () => {
    // A native radio group applies roving tabindex: Tab lands on the checked
    // radio (or the first, if none is checked) and only arrow keys move
    // between the other radios in the same group.
    const user = userEvent.setup();
    render(<SettingsForm />);

    await user.tab();
    expect(screen.getByRole("radio", { name: "Comfortable" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("combobox", { name: "Date display" })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole("combobox", { name: "Results per page" })).toHaveFocus();
  });

  it("updates the preview's row padding immediately when density changes", async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);

    const preview = screen.getByRole("region", { name: "Preview" });
    const [firstRow] = within(preview).getAllByRole("listitem");
    expect(firstRow).toHaveClass("py-3");

    await user.click(screen.getByRole("radio", { name: "Compact" }));

    expect(firstRow).toHaveClass("py-1.5");
  });

  it("updates the preview's applied date and page size immediately", async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);

    const preview = screen.getByRole("region", { name: "Preview" });
    expect(within(preview).getAllByText(/ago/).length).toBeGreaterThan(0);
    expect(within(preview).getByText(/Showing 1–25 of 128 candidates/)).toBeInTheDocument();

    await user.selectOptions(screen.getByRole("combobox", { name: "Date display" }), "absolute");
    await user.selectOptions(screen.getByRole("combobox", { name: "Results per page" }), "50");

    expect(within(preview).getAllByText(/2026/).length).toBeGreaterThan(0);
    expect(within(preview).getByText(/Showing 1–50 of 128 candidates/)).toBeInTheDocument();
  });

  it("writes preference changes to localStorage", async () => {
    const user = userEvent.setup();
    render(<SettingsForm />);

    await user.click(screen.getByRole("radio", { name: "Compact" }));

    const stored: unknown = JSON.parse(
      window.localStorage.getItem(PREFERENCES_STORAGE_KEY) ?? "null",
    );
    expect(stored).toEqual({ density: "compact", dateFormat: "relative", resultsPerPage: 25 });
  });

  it("reflects preferences already in localStorage on render", () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ density: "compact", dateFormat: "absolute", resultsPerPage: 50 }),
    );

    render(<SettingsForm />);

    expect(screen.getByRole("radio", { name: "Compact" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Date display" })).toHaveValue("absolute");
    expect(screen.getByRole("combobox", { name: "Results per page" })).toHaveValue("50");
    expect(screen.getByText(/Showing 1–50 of 128 candidates/)).toBeInTheDocument();
  });

  it("keeps a change after an unmount and remount", async () => {
    const user = userEvent.setup();
    const { unmount } = render(<SettingsForm />);

    await user.click(screen.getByRole("radio", { name: "Compact" }));
    unmount();
    render(<SettingsForm />);

    expect(screen.getByRole("radio", { name: "Compact" })).toBeChecked();
  });

  it("falls back to defaults on malformed JSON", () => {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, "{oops");

    render(<SettingsForm />);

    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
  });

  it("defaults only the invalid field and keeps the valid ones", () => {
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ density: "cosy", dateFormat: "absolute", resultsPerPage: 50 }),
    );

    render(<SettingsForm />);

    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
    expect(screen.getByRole("combobox", { name: "Date display" })).toHaveValue("absolute");
    expect(screen.getByRole("combobox", { name: "Results per page" })).toHaveValue("50");
  });

  it("falls back to defaults and shows the notice when reading storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("blocked", "SecurityError");
    });

    render(<SettingsForm />);

    expect(screen.getByRole("radio", { name: "Comfortable" })).toBeChecked();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("still applies a change in the preview and shows the notice when storage is full", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("full", "QuotaExceededError");
    });
    const user = userEvent.setup();

    render(<SettingsForm />);
    await user.click(screen.getByRole("radio", { name: "Compact" }));

    expect(screen.getByRole("radio", { name: "Compact" })).toBeChecked();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows no status notice when storage is healthy", () => {
    render(<SettingsForm />);

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders defaults on the server even when storage already holds different values", () => {
    // Proves invariant 1: the server render (and, by construction, the first
    // client render) always reflects DEFAULT_PREFERENCES, so hydration can
    // never mismatch against whatever happens to be in storage.
    window.localStorage.setItem(
      PREFERENCES_STORAGE_KEY,
      JSON.stringify({ density: "compact", dateFormat: "absolute", resultsPerPage: 50 }),
    );

    const html = renderToString(<SettingsForm />);

    // React SSR emits `checked` before `value` on a controlled radio input,
    // so the two attributes are matched independently rather than in a
    // single ordered pattern.
    const comfortableInput = /<input[^>]*value="comfortable"[^>]*>/.exec(html)?.[0] ?? "";
    const compactInput = /<input[^>]*value="compact"[^>]*>/.exec(html)?.[0] ?? "";
    expect(comfortableInput).toContain("checked");
    expect(compactInput).not.toContain("checked");
    expect(html).not.toContain('role="status"');
  });
});
