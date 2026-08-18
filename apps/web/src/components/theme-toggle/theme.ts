/** The themes TalentScout renders. Mirrors the `:root` and `.dark` palettes in `globals.css`. */
export type Theme = "light" | "dark";

/** `localStorage` key holding the recruiter's chosen theme. */
export const THEME_STORAGE_KEY = "talentscout-theme";

/**
 * Class on `<html>` that the `dark` Tailwind variant keys off — see the
 * `@custom-variant dark (&:is(.dark *))` declaration at the top of `globals.css`.
 */
export const DARK_CLASS = "dark";

/** Theme used when nothing is stored and the operating system expresses no preference. */
export const DEFAULT_THEME: Theme = "light";

const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Source of the inline `<script>` the root layout runs in `<head>`. The browser executes it
 * synchronously while parsing the document, so the stored theme is on `<html>` before the first
 * paint rather than after hydration.
 *
 * It toggles a single class instead of assigning `className`, because `<html>` also carries the
 * font classes — overwriting the class list would render the page unstyled. A stored value that
 * is not a known theme, or a `localStorage` that throws, both fall through to the system
 * preference and then to the default.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)});if(t!=="light"&&t!=="dark"){t=window.matchMedia(${JSON.stringify(
  PREFERS_DARK_QUERY,
)}).matches?"dark":"light"}document.documentElement.classList.toggle(${JSON.stringify(
  DARK_CLASS,
)},t==="dark")}catch(e){}})();`;

/**
 * The stored theme, or `null` when nothing valid is stored or storage cannot be read — Safari's
 * private mode and blocked third-party storage both throw on access rather than returning `null`.
 */
export function readStoredTheme(): Theme | null {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : null;
  } catch {
    // An unreadable store is indistinguishable from an empty one for our purposes.
    return null;
  }
}

/** Persists the chosen theme, ignoring a store that refuses writes (private mode, quota). */
export function storeTheme(theme: Theme): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Losing the preference across reloads beats breaking the toggle in this session.
  }
}

/** Applies a theme to `<html>`, matching what {@link THEME_INIT_SCRIPT} does before first paint. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS, theme === "dark");
}

/**
 * The theme to start from: the stored preference when valid, otherwise the operating system's,
 * otherwise {@link DEFAULT_THEME}. Returns the default during server rendering, where neither
 * source exists — the inline script corrects `<html>` before the browser paints it.
 */
export function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;

  const stored = readStoredTheme();
  if (stored) return stored;

  return window.matchMedia(PREFERS_DARK_QUERY).matches ? "dark" : DEFAULT_THEME;
}
