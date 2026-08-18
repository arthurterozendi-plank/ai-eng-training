# AI-130 — Switch between light and dark themes for recruiters working late

**Linear:** AI-130 · Type: Feature · Parent: AI-42
**Branch:** `arthurterozendi/ai-130-switch-between-light-and-dark-themes-for-recruiters-working`
(worktree `ai-eng-training-ai-130`, based on `origin/main` at `58aa8f3`)
**Status:** implemented

---

## 1. Problem statement

**User story:** As a recruiter, I want to switch TalentScout to a dark theme so that a screen I
stare at all day is comfortable at the hour I am actually still working.

The scaffold already ships both palettes — `apps/web/src/app/globals.css` defines the full set of
shadcn CSS variables under `:root` and a second set under `.dark`, and line 5 registers
`@custom-variant dark (&:is(.dark *))`. Nothing ever puts the `dark` class on `<html>`, so the
dark palette is dead CSS and the recruiter has no way to reach it.

**In scope**

- `apps/web/src/components/theme-toggle/` — the toggle and the theme module it shares with the
  layout, each with a co-located test.
- The theme class applied to `<html>` in `apps/web/src/app/layout.tsx`.
- The preference persisted client-side.
- A README entry recording the decision (required by `CLAUDE.md`).

**Out of scope**

- Fixing hardcoded colours on pages other agents own — recorded in §6, not fixed.
- A theme control on the settings page (AI-129 owns that route).
- Following system-preference _changes_ after the first load. The system preference seeds the
  default only.
- **Any new dependency.** Three sibling agents share this `pnpm-lock.yaml`; a lockfile change
  would conflict. `next-themes` in particular is deliberately not added.

### Acceptance criteria (verbatim from the ticket)

1. Given the toggle, when a theme is selected, it applies immediately and survives a reload.
2. No flash of the wrong theme on first paint, and no hydration mismatch warning in the console.
3. The toggle is reachable by keyboard and announces its state to a screen reader.
4. Edge case: an unreadable stored preference falls back to the default theme instead of
   rendering unstyled.
5. _(Deferred — see §8)_ After merging all four features, every new page is checked in dark theme.

### How each AC is verified

| AC  | Verification                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `theme-toggle.test.tsx`: clicking toggles `documentElement.classList.contains("dark")` and writes `localStorage`; a second render with the value already stored comes up in the stored theme |
| 2   | `theme.test.ts` evaluates `THEME_INIT_SCRIPT` itself and asserts it sets the class; `suppressHydrationWarning` on `<html>` plus `useMounted()` gating keep React's two renders identical     |
| 3   | `theme-toggle.test.tsx`: `getByRole("button", { name: "Dark theme" })`, `userEvent.tab()` focus, `{Enter}`/`{ }` activation, `aria-pressed` reflecting the current theme                     |
| 4   | `theme.test.ts`: a garbage stored value and a `localStorage` that throws both fall back to the default, and the script's `classList.toggle` leaves `<html>`'s other classes intact           |

---

## 2. Verified facts this plan rests on

Checked against the worktree on 2026-08-18, not recalled.

- `apps/web/src/app/globals.css:5` — `@custom-variant dark (&:is(.dark *));`. The dark palette is
  **class-based**, not `data-theme`-based, so the layout must toggle a class.
- `apps/web/src/hooks/use-mounted.ts` — `useSyncExternalStore` with a `false` server snapshot and
  a `true` client snapshot. The hydration render uses the server snapshot, so gating an attribute
  on it cannot mismatch.
- `apps/web/node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md` —
  Next 16's own guidance: an inline `<script>` in `<head>` set via `dangerouslySetInnerHTML`,
  `suppressHydrationWarning` on the element the script mutates, and a `useLayoutEffect` re-apply
  because React's dev Strict Mode remount resets `<html>` to the attributes it manages from JSX.
- `lucide-react@1.31.0` is already a dependency of `apps/web` — icons need no new package.
- `apps/web/src/components/ui/button.tsx` exists and spreads `...props`, so `aria-pressed` and
  `onClick` pass straight through. `variant="ghost"` / `size="icon"` are defined.
- No hardcoded colours exist anywhere under `apps/web/src` today (grep over every hex, `rgb(`,
  `hsl(`, and numbered Tailwind palette class).

---

## 3. Design

**Two collaborators, one source of truth.**

`theme.ts` owns the storage key, the class name, the default, and the source of the inline
script. Both the layout (server) and the toggle (client) read it, so the key can never drift
between the code that writes it and the code that reads it before paint.

**First paint (no flash).** The root layout renders an inline `<script>` in `<head>`. The browser
runs it synchronously while parsing, before any paint, and before React exists. It reads the
stored preference, falls back to `prefers-color-scheme`, and calls
`documentElement.classList.toggle("dark", …)`.

`classList.toggle` rather than assigning `className` is load-bearing for AC 4: `<html>` already
carries `font-sans` and the Geist font variable, and overwriting the class list would strip both
and render the page unstyled.

**Hydration.** The script mutates `<html>`'s class list, which React would otherwise report as a
mismatch, so `<html>` carries `suppressHydrationWarning`. That attribute applies to the element
it is on, not to descendants, so it hides exactly the one mutation we make and nothing else.

**The toggle's own appearance is CSS, not state.** Both icons are always in the DOM; the `dark:`
variant shows one and hides the other. The icon therefore cannot flash the wrong way either — it
is painted from the same class the inline script already set.

**The toggle's announced state is React, gated on `useMounted()`.** `aria-pressed` is the only
theme-dependent attribute React renders, and it is omitted until mounted. The hydration render
therefore matches the server exactly; a beat later the button announces pressed/not-pressed.

**Dev remount repair.** `useLayoutEffect` re-applies the class. In production it is a no-op (the
script already set the same value); in development it restores the class React's Strict Mode
remount strips off `<html>`.

## 4. Slices

1. `theme.ts` + `theme.test.ts` — key, class, default, `THEME_INIT_SCRIPT`, and the
   read/store/apply/resolve helpers.
2. `theme-toggle.tsx` + `theme-toggle.test.tsx` — the button.
3. `layout.tsx` — `suppressHydrationWarning`, the `<head>` script, and mounting the toggle.
4. README — record the decision.

**Definition of done:** `pnpm check` green from the worktree root.

## 5. Assumptions log (🟡)

| #   | Decision                                                                             | Why                                                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Two extra files in the component directory (`theme.ts`, `theme.test.ts`)             | The ticket names two files, but the layout and the toggle must agree on one storage key. Duplicating the key in both is a latent bug; a shared module is the smaller risk.             |
| 2   | Storage key `talentscout-theme`, not `theme`                                         | `localhost:3000` is shared by every project on this machine; a namespaced key cannot be poisoned by another app's value.                                                               |
| 3   | Storage is `localStorage`, not a cookie                                              | A cookie read in the root layout opts the whole app out of static prerendering (Next 16 guide, "Storing the theme in a cookie"). Nothing server-side needs the theme.                  |
| 4   | Default when nothing is stored is the OS `prefers-color-scheme`, then light          | The ticket puts "system-preference following _beyond the initial default_" out of scope, which implies the initial default is the system preference.                                   |
| 5   | The toggle is mounted in `layout.tsx`, fixed top-right                               | AC 1 needs a reachable toggle; AI-129 owns the settings page and the other agents own their pages. The app shell is the only surface left, and it is the one file this ticket owns.    |
| 6   | Icon state is CSS (`dark:` variant), not React state                                 | Removes the last thing that could flash on first paint and keeps the component's only stateful output the one `aria-pressed` attribute.                                                |
| 7   | `aria-pressed` on a button named "Dark theme", not a three-way radiogroup or a menu  | Two themes, one control. A pressed-state toggle is the smallest thing a screen reader announces correctly, and it needs no new shadcn primitive (which would touch `components.json`). |
| 8   | `window.matchMedia` is stubbed in tests rather than guarded in `resolveInitialTheme` | jsdom does not implement it; every browser since 2015 does. Guarding production code for a test-environment gap would be testing the guard, not the behaviour.                         |

## 6. Recorded, not fixed

Per the ticket, hardcoded colours on pages other agents own are recorded rather than fixed.

**Nothing to record from this worktree.** It is branched from `origin/main` at `58aa8f3`, before
AI-127/128/129 merged, so their pages do not exist here. A grep for every hex literal, `rgb(`,
`hsl(`, and numbered Tailwind palette class across `apps/web/src` returns nothing — the only
page present (`app/page.tsx`) already uses `text-muted-foreground` and the shadcn variables.

The audit must therefore be re-run on the integration branch once all four features are merged.

## 7. Verification in a real browser

`pnpm check` green from the worktree root. Beyond the 24 unit tests, the running app was driven
through Chrome DevTools against `next dev` on port 3130 (host OS set to prefer dark):

| Check                                                     | Result                                                                                                                                                           |
| --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Inline script position in the served HTML                 | Offset 1786, inside `<head>`, before `</head>` (2102) and `<body>` (2109) — blocking and pre-paint                                                               |
| Cold load, nothing stored                                 | Came up dark from `prefers-color-scheme`; a11y tree reads `button "Dark theme" pressed`                                                                          |
| Console after load, after toggle, and after reload        | Empty — no hydration mismatch, no React warning of any kind                                                                                                      |
| Click the toggle                                          | `<html>` loses `dark`, `aria-pressed="false"`, `localStorage` becomes `light`                                                                                    |
| Hard reload with `light` stored while the OS prefers dark | Stayed light — the stored preference wins over the system default                                                                                                |
| Hard reload with `{"corrupted":true}` stored              | Fell back to the system preference; `font-sans` and the Geist variable class both survived, `font-family: Geist`, background `lab(2.75 0 0)` — styled, not naked |

## 8. Deferred

AC 5 — "after merging all four features, every new page is checked in dark theme" — **cannot be
met from this worktree**, because AI-127, AI-128 and AI-129 are unmerged and their pages are not
present. Deferred to the parent AI-42 write-up: after all four merge, load each new page with the
dark theme active and check for washed-out or invisible elements.
