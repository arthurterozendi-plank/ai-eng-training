import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  DARK_CLASS,
  DEFAULT_THEME,
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
} from "@/components/theme-toggle/theme";

/** The classes the root layout puts on `<html>` before any theme is applied. */
const LAYOUT_CLASSES = "font-sans __variable_geist";

function stubPrefersDark(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({ matches, media })),
  );
}

function runInitScript() {
  new Function(THEME_INIT_SCRIPT)();
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

describe("THEME_INIT_SCRIPT", () => {
  it("applies a stored dark preference before React runs", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("leaves the document light when light is stored, even if the system prefers dark", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    stubPrefersDark(true);

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false);
  });

  it("falls back to the system preference when nothing is stored", () => {
    stubPrefersDark(true);

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);
  });

  it("falls back to the default theme when the stored value is unreadable", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "{corrupted}");

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(DEFAULT_THEME === "dark");
  });

  it("keeps the document styled when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });

    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.className).toBe(LAYOUT_CLASSES);
  });

  it("never discards the classes the layout already put on the document", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(document.documentElement.classList.contains("font-sans")).toBe(true);
    expect(document.documentElement.classList.contains("__variable_geist")).toBe(true);
  });
});

describe("readStoredTheme", () => {
  it("returns the stored theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    expect(readStoredTheme()).toBe("dark");
  });

  it("returns null for a value that is not a theme", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");

    expect(readStoredTheme()).toBeNull();
  });

  it("returns null when storage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("storage is blocked");
    });

    expect(readStoredTheme()).toBeNull();
  });
});

describe("storeTheme", () => {
  it("persists the theme under the key the init script reads", () => {
    storeTheme("dark");

    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("does not throw when storage refuses the write", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota exceeded");
    });

    expect(() => storeTheme("dark")).not.toThrow();
  });
});

describe("applyTheme", () => {
  it("adds and removes the dark class without touching the other classes", () => {
    applyTheme("dark");
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true);

    applyTheme("light");
    expect(document.documentElement.className).toBe(LAYOUT_CLASSES);
  });
});

describe("resolveInitialTheme", () => {
  it("prefers the stored theme over the system preference", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    stubPrefersDark(true);

    expect(resolveInitialTheme()).toBe("light");
  });

  it("uses the system preference when nothing is stored", () => {
    stubPrefersDark(true);

    expect(resolveInitialTheme()).toBe("dark");
  });

  it("agrees with the init script for every input, so hydration cannot disagree", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    stubPrefersDark(true);

    runInitScript();

    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(
      resolveInitialTheme() === "dark",
    );
  });
});
