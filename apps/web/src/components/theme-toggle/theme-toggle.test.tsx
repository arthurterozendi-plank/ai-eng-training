import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DARK_CLASS, THEME_STORAGE_KEY } from "@/components/theme-toggle/theme";
import { ThemeToggle } from "@/components/theme-toggle/theme-toggle";

/** The classes the root layout puts on `<html>` before any theme is applied. */
const LAYOUT_CLASSES = "font-sans __variable_geist";

function stubPrefersDark(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({ matches, media })),
  );
}

function isDarkDocument() {
  return document.documentElement.classList.contains(DARK_CLASS);
}

function getToggle() {
  return screen.getByRole("button", { name: "Dark theme" });
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = LAYOUT_CLASSES;
  stubPrefersDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("announces the current theme as a pressed state", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("button", { name: "Dark theme", pressed: false })).toBeInTheDocument();
  });

  it("applies the dark theme immediately when selected", async () => {
    render(<ThemeToggle />);

    await userEvent.click(getToggle());

    expect(isDarkDocument()).toBe(true);
    expect(screen.getByRole("button", { name: "Dark theme", pressed: true })).toBeInTheDocument();
  });

  it("switches back to light on a second press", async () => {
    render(<ThemeToggle />);

    await userEvent.click(getToggle());
    await userEvent.click(getToggle());

    expect(isDarkDocument()).toBe(false);
    expect(screen.getByRole("button", { name: "Dark theme", pressed: false })).toBeInTheDocument();
  });

  it("persists the choice so it survives a reload", async () => {
    render(<ThemeToggle />);

    await userEvent.click(getToggle());

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("comes up in the stored theme on a later visit", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(<ThemeToggle />);

    expect(isDarkDocument()).toBe(true);
    expect(screen.getByRole("button", { name: "Dark theme", pressed: true })).toBeInTheDocument();
  });

  it("is reachable and operable from the keyboard", async () => {
    render(<ThemeToggle />);

    await userEvent.tab();
    expect(getToggle()).toHaveFocus();

    await userEvent.keyboard("{Enter}");
    expect(isDarkDocument()).toBe(true);

    await userEvent.keyboard(" ");
    expect(isDarkDocument()).toBe(false);
  });

  it("falls back to the default theme when the stored preference is unreadable", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "{corrupted}");

    render(<ThemeToggle />);

    expect(isDarkDocument()).toBe(false);
    expect(document.documentElement.className).toBe(LAYOUT_CLASSES);
  });

  it("still renders and toggles when storage is unavailable", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });

    render(<ThemeToggle />);
    await userEvent.click(getToggle());

    expect(isDarkDocument()).toBe(true);
  });

  it("forwards props to the underlying button", () => {
    render(<ThemeToggle className="fixed top-4 right-4" />);

    expect(getToggle()).toHaveClass("fixed");
  });
});
