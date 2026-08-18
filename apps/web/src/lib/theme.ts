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
 * font classes — overwriting the class list would render the page unstyled.
 *
 * Each fallible read gets its own `try`, and the apply always runs. Storage and `matchMedia` fail
 * independently — blocked storage throws on `getItem`, and an embedded WebView may not implement
 * `matchMedia` at all — so one shared `try` would abort the whole script on either, skipping both
 * the remaining fallback and the apply. `resolveInitialTheme` recovers from exactly the same two
 * failures, and the two must agree on every combination or the recruiter sees one theme painted
 * and the other applied a moment later.
 *
 * The app sets no Content-Security-Policy today. Whoever adds one must give this script a
 * nonce or hash — an inline script rendered through `dangerouslySetInnerHTML` gets neither
 * automatically, and it would start failing silently rather than loudly.
 */
export const THEME_INIT_SCRIPT = `(function(){var t=null;try{t=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}if(t!=="light"&&t!=="dark"){t=${JSON.stringify(
  DEFAULT_THEME,
)};try{if(window.matchMedia(${JSON.stringify(
  PREFERS_DARK_QUERY,
)}).matches)t="dark"}catch(e){}}try{var r=document.documentElement;r.classList.toggle(${JSON.stringify(
  DARK_CLASS,
)},t==="dark");r.style.colorScheme=t}catch(e){}})();`;

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

/**
 * Applies a theme to `<html>`, matching what {@link THEME_INIT_SCRIPT} does before first paint.
 *
 * `color-scheme` is set alongside the class so the browser's own surfaces — scrollbars, form
 * controls, and the canvas it paints before the stylesheet arrives — follow the theme too.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, theme === "dark");
  root.style.colorScheme = theme;
}

/**
 * Whether the operating system asks for a dark theme. Falls back to `false` where `matchMedia`
 * is unavailable or throws — some embedded WebViews and test environments have no implementation.
 *
 * The guard is not defensive padding: this runs inside `useState`'s lazy initializer in
 * `ThemeToggle`, which the root layout renders with no error boundary above it, so an
 * unhandled throw here fails the entire page render rather than just the toggle.
 */
function prefersDarkTheme(): boolean {
  try {
    return window.matchMedia(PREFERS_DARK_QUERY).matches;
  } catch {
    return false;
  }
}

/**
 * The theme to start from: the stored preference when valid, otherwise the operating system's,
 * otherwise {@link DEFAULT_THEME}. Returns the default during server rendering, where neither
 * source exists — the inline script corrects `<html>` before the browser paints it.
 *
 * Every failure mode here is recovered exactly as {@link THEME_INIT_SCRIPT} recovers from it, so
 * the theme React starts in always matches the one already painted.
 */
export function resolveInitialTheme(): Theme {
  if (typeof window === "undefined") return DEFAULT_THEME;

  const stored = readStoredTheme();
  if (stored) return stored;

  return prefersDarkTheme() ? "dark" : DEFAULT_THEME;
}
