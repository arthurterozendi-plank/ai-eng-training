import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  applyTheme,
  DARK_CLASS,
  readStoredTheme,
  resolveInitialTheme,
  storeTheme,
  THEME_INIT_SCRIPT,
  THEME_STORAGE_KEY,
  type Theme,
} from "@/lib/theme";

/** The classes the root layout puts on `<html>` before any theme is applied. */
const LAYOUT_CLASSES = "font-sans __variable_geist";

function stubPrefersDark(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((media: string) => ({ matches, media })),
  );
}

function blockStorage() {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("storage is blocked");
  });
}

function runInitScript() {
  new Function(THEME_INIT_SCRIPT)();
}

function paintedTheme(): Theme {
  return document.documentElement.classList.contains(DARK_CLASS) ? "dark" : "light";
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.className = LAYOUT_CLASSES;
  document.documentElement.style.colorScheme = "";
  stubPrefersDark(false);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("THEME_INIT_SCRIPT", () => {
  /**
   * The script paints before React exists and `resolveInitialTheme` seeds React's state. If the
   * two ever disagree the recruiter sees the wrong theme first and a correction after hydration —
   * exactly the flash this feature exists to prevent — so every input is checked against both.
   */
  const cases: {
    when: string;
    stored: string | null;
    prefersDark: boolean;
    blocked: boolean;
    expected: Theme;
  }[] = [
    {
      when: "dark is stored",
      stored: "dark",
      prefersDark: false,
      blocked: false,
      expected: "dark",
    },
    {
      when: "light is stored but the system prefers dark",
      stored: "light",
      prefersDark: true,
      blocked: false,
      expected: "light",
    },
    {
      when: "nothing is stored and the system prefers dark",
      stored: null,
      prefersDark: true,
      blocked: false,
      expected: "dark",
    },
    {
      when: "nothing is stored and the system prefers light",
      stored: null,
      prefersDark: false,
      blocked: false,
      expected: "light",
    },
    {
      when: "the stored value is corrupt and the system prefers dark",
      stored: '{"corrupted":true}',
      prefersDark: true,
      blocked: false,
      expected: "dark",
    },
    {
      when: "the stored value is corrupt and the system prefers light",
      stored: "sepia",
      prefersDark: false,
      blocked: false,
      expected: "light",
    },
    {
      when: "storage is blocked and the system prefers dark",
      stored: null,
      prefersDark: true,
      blocked: true,
      expected: "dark",
    },
    {
      when: "storage is blocked and the system prefers light",
      stored: null,
      prefersDark: false,
      blocked: true,
      expected: "light",
    },
  ];

  it.each(cases)(
    "paints $expected, and agrees with resolveInitialTheme, when $when",
    ({ stored, prefersDark, blocked, expected }) => {
      if (stored !== null) window.localStorage.setItem(THEME_STORAGE_KEY, stored);
      stubPrefersDark(prefersDark);
      if (blocked) blockStorage();

      runInitScript();

      expect(paintedTheme()).toBe(expected);
      expect(resolveInitialTheme()).toBe(expected);
      expect(document.documentElement.style.colorScheme).toBe(expected);
    },
  );

  it("removes a dark class the document already carries when light wins", () => {
    document.documentElement.classList.add(DARK_CLASS);
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    stubPrefersDark(true);

    runInitScript();

    expect(paintedTheme()).toBe("light");
  });

  it("never discards the classes the layout already put on the document", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    runInitScript();

    expect(paintedTheme()).toBe("dark");
    expect(document.documentElement.classList.contains("font-sans")).toBe(true);
    expect(document.documentElement.classList.contains("__variable_geist")).toBe(true);
  });

  it("leaves the document styled when storage throws", () => {
    blockStorage();

    expect(() => runInitScript()).not.toThrow();
    expect(document.documentElement.classList.contains("font-sans")).toBe(true);
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
    blockStorage();

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
  it("adds the dark class and matching color-scheme", () => {
    applyTheme("dark");

    expect(paintedTheme()).toBe("dark");
    expect(document.documentElement.style.colorScheme).toBe("dark");
  });

  it("removes them again without touching the layout's classes", () => {
    applyTheme("dark");
    applyTheme("light");

    expect(document.documentElement.className).toBe(LAYOUT_CLASSES);
    expect(document.documentElement.style.colorScheme).toBe("light");
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
});
