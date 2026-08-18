"use client";

import { useCallback, useMemo, useRef, useState } from "react";

import { useMounted } from "@/hooks/use-mounted";

/** Row density options a recruiter can choose for list-style surfaces. */
export const DENSITY_OPTIONS = ["comfortable", "compact"] as const;

/** Date rendering strategies a recruiter can choose for timestamps. */
export const DATE_FORMAT_OPTIONS = ["relative", "absolute"] as const;

/** Page sizes a recruiter can choose for paginated lists. */
export const RESULTS_PER_PAGE_OPTIONS = [10, 25, 50] as const;

/** Row density for list-style surfaces. */
export type Density = (typeof DENSITY_OPTIONS)[number];

/** How timestamps are rendered. */
export type DateFormat = (typeof DATE_FORMAT_OPTIONS)[number];

/** Number of rows shown per page on a paginated list. */
export type ResultsPerPage = (typeof RESULTS_PER_PAGE_OPTIONS)[number];

/** A recruiter's display preferences, persisted client-side only. */
export interface Preferences {
  density: Density;
  dateFormat: DateFormat;
  resultsPerPage: ResultsPerPage;
}

/** Preferences applied when nothing is stored yet, or storage cannot be read. */
export const DEFAULT_PREFERENCES: Preferences = {
  density: "comfortable",
  dateFormat: "relative",
  resultsPerPage: 25,
};

/** `localStorage` key preferences are read from and written to. */
export const PREFERENCES_STORAGE_KEY = "talentscout:preferences";

/** "loading" until hydration completes; then whether changes reach localStorage. */
export type PreferencesStatus = "loading" | "persisted" | "session-only";

/** Return value of {@link usePreferences}. */
export interface UsePreferencesResult {
  preferences: Preferences;
  setPreference: <K extends keyof Preferences>(key: K, value: Preferences[K]) => void;
  status: PreferencesStatus;
}

/** Returns `value` if it is one of `options`, otherwise `fallback` — a plain membership check, deliberately not a coercion (a stringified `"25"` does not become `25`). */
function coerce<T>(options: readonly T[], value: unknown, fallback: T): T {
  return (options as readonly unknown[]).includes(value) ? (value as T) : fallback;
}

// Two layers, because the stored JSON is untrusted and can be any shape at
// all: the `typeof`/`null` guard below handles a value that is not an object
// to begin with (an array, a bare string, ...), and per-field `coerce` keeps
// the good fields when only one is corrupt or missing.
function parsePreferences(value: unknown): Preferences {
  if (typeof value !== "object" || value === null) return DEFAULT_PREFERENCES;

  const record = value as Record<string, unknown>;
  return {
    density: coerce(DENSITY_OPTIONS, record.density, DEFAULT_PREFERENCES.density),
    dateFormat: coerce(DATE_FORMAT_OPTIONS, record.dateFormat, DEFAULT_PREFERENCES.dateFormat),
    resultsPerPage: coerce(
      RESULTS_PER_PAGE_OPTIONS,
      record.resultsPerPage,
      DEFAULT_PREFERENCES.resultsPerPage,
    ),
  };
}

/** Parses a raw stored value into `Preferences`, falling back to defaults on any shape it does not recognize. */
function parseStored(raw: string | null): Preferences {
  if (raw === null) return DEFAULT_PREFERENCES;

  // JSON.parse gets its own try/catch so malformed JSON degrades to defaults
  // without being mistaken for unwritable storage by the caller.
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_PREFERENCES;
  }

  return parsePreferences(parsed);
}

/** Probes whether `localStorage` currently accepts writes, without disturbing any stored preferences. */
function isWritable(): boolean {
  const probeKey = `${PREFERENCES_STORAGE_KEY}:probe`;
  try {
    window.localStorage.setItem(probeKey, "1");
    window.localStorage.removeItem(probeKey);
    return true;
  } catch {
    return false;
  }
}

/** Reads the currently stored preferences and whether storage is writable, tolerating a `localStorage` that throws on touch. */
function readStoredPreferences(): { preferences: Preferences; writable: boolean } {
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY);
    return { preferences: parseStored(raw), writable: isWritable() };
  } catch {
    // Touching `localStorage` itself can throw (e.g. SecurityError in a
    // locked-down browser context) before any method is even called.
    return { preferences: DEFAULT_PREFERENCES, writable: false };
  }
}

/** Writes preferences to `localStorage`, reporting success without ever throwing. */
function writeStoredPreferences(next: Preferences): boolean {
  try {
    window.localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(next));
    return true;
  } catch {
    return false;
  }
}

/**
 * A recruiter's display preferences, hydrated from `localStorage` and kept in
 * sync with it. Falls back to session-only state (and reports that via
 * `status`) when storage is unavailable, full, or blocked by the browser.
 */
export function usePreferences(): UsePreferencesResult {
  const mounted = useMounted();
  // The storage read happens in the render `useMounted` triggers, not in a
  // `useEffect`: the server snapshot is `false`, so server HTML and the first
  // client render are identical, and React re-reads real values before paint.
  const initial = useMemo(() => (mounted ? readStoredPreferences() : null), [mounted]);
  const [changed, setChanged] = useState<Preferences | null>(null);
  // Mirrors `changed` so two `setPreference` calls inside one synchronous
  // event handler merge onto each other rather than both onto the value the
  // render they were called from closed over — `changed` itself is not
  // readable until the next render.
  const changedRef = useRef<Preferences | null>(null);
  // Evidence from the most recent real write; `null` until the first one, so
  // the initial probe result decides `status` until then.
  const [lastWriteOk, setLastWriteOk] = useState<boolean | null>(null);

  const preferences = changed ?? initial?.preferences ?? DEFAULT_PREFERENCES;
  const status: PreferencesStatus = !initial
    ? "loading"
    : (lastWriteOk ?? initial.writable)
      ? "persisted"
      : "session-only";

  const setPreference = useCallback(
    <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
      const base = changedRef.current ?? initial?.preferences ?? DEFAULT_PREFERENCES;
      const next = { ...base, [key]: value };
      changedRef.current = next;
      setChanged(next);
      setLastWriteOk(writeStoredPreferences(next));
    },
    [initial],
  );

  return { preferences, setPreference, status };
}
