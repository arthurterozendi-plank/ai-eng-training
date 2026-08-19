# `apps/web/src/components/` — conventions the root does not cover

The root `CLAUDE.md` states the rules for this folder under "Components" and "Layout and naming".
This file does not repeat them. It adds a worked skeleton, the export-style decision the root
leaves open, and the failure modes agents actually hit here — read it after the root, not instead
of it.

Governs: `job-card/`, `candidate-profile/`, `settings-form/`, `theme-toggle/`, and the shadcn
primitives in `ui/`.

## A. The skeleton

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function StatusBadge({
  status,
  className,
  ...props
}: React.ComponentProps<"span"> & { status: "open" | "closed" }) {
  return (
    <span
      className={cn(
        "rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground",
        className,
      )}
      {...props}
    >
      {status}
    </span>
  );
}

export { StatusBadge };
```

The one contract the root does not state: destructure `className`, merge it **last** through
`cn(base, className)` so a caller's class wins a Tailwind conflict, and spread `...props` onto the
root element so the intrinsic tag's own props keep working. Both of our components that take a
`className` do this (`job-card.tsx:13-25`, `candidate-profile.tsx:63-68`); `settings-form` takes no
props and `theme-toggle` forwards to `<Button>` without merging one of its own. The `ui/`
primitives differ — `button.tsx:61` routes `className` through `cva`, which is theirs alone.

## B. Local facts

| Fact                                                                                                                                                                       | Evidence                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Private sub-components stay unexported in the same file — they do not get their own directory                                                                              | `candidate-profile.tsx` holds `ApplicationSection`, `DetailRow`, `DetailLink`     |
| A `data-*` attribute marks state a test asserts, not just styling                                                                                                          | `job-card.tsx:44` (`data-terminal`), asserted `job-card.test.tsx:50-51`           |
| Props take rich types (`Date`, `PipelineStageKey`); the page converts, the component does not                                                                              | `candidate-profile.tsx:36` takes `Date`; `candidates/[id]/page.tsx:60` passes one |
| An absent optional field renders nothing — return `null`, do not render an empty row                                                                                       | `candidate-profile.tsx:149-160`                                                   |
| An empty collection gets explicit copy, not a blank region                                                                                                                 | `candidate-profile.tsx:88` ("No applications yet.")                               |
| Bottom named export — `function X() {} … export { X }`. **`job-card.tsx` and `settings-form.tsx` use `export function` instead, a known deviation, not the shape to copy** | `ui/button.tsx:67`, `candidate-profile.tsx:184`                                   |

## C. Hydration and determinism

Four separate comments in this codebase exist because someone was bitten by one of these. Each
rule below carries the reason, not just the instruction.

- Build `Intl.*Format` formatters once at module scope, never inside the render body —
  construction is not free, so doing it per render pays that cost on every re-render
  (`candidate-profile.tsx:11-17`).
- Pass `timeZone: "UTC"` to any formatter whose output a test asserts. Without it the rendered day
  shifts with the machine's local timezone: the assertion passes locally and fails in CI
  (`settings-form.tsx:43-49`).
- Never call `Date.now()` or `new Date()` during render. The server and the client evaluate it at
  different instants, so the two renders disagree — a hydration mismatch and a flaky test
  (`settings-form.tsx:33-37`).
- Withhold browser-only state until the component has mounted. `ThemeToggle` renders
  `aria-pressed={mounted ? isDark : undefined}` because the server has no way to know the
  recruiter's stored preference (`theme-toggle.tsx:38-40`, `hooks/use-mounted.ts`).

## D. The client boundary, concretely

| Component           | Boundary | Why                                                                                        |
| ------------------- | -------- | ------------------------------------------------------------------------------------------ |
| `job-card`          | server   | renders props only                                                                         |
| `candidate-profile` | server   | renders props, sorts applications and their transitions locally                            |
| `theme-toggle`      | client   | `useState` + `useLayoutEffect`; reads and writes the theme via `localStorage`/`matchMedia` |
| `settings-form`     | client   | `usePreferences` reads and writes `localStorage`                                           |

The push-down this proves: `settings/page.tsx` is a Server Component whose only client content is
`<SettingsForm />`.

## E. Accessibility the tests actually assert

- A decorative glyph carries `aria-hidden="true"` with an `sr-only` text equivalent beside it
  (`candidate-profile.tsx:131-132`, `theme-toggle.tsx:44-46`).
- Tabular data is a real `<table>` with `scope="row"` cells and an `sr-only` `<caption>` —
  `JobCard`'s own JSDoc explains why a `<ul>` of "Applied 3" strings does not bind the count to
  its stage for a screen reader (`job-card.tsx:6-12,38-39,47-48`).
- A labelled region points `aria-labelledby` at its own heading's `id`
  (`candidate-profile.tsx:55,65`).

## F. Do not

- Do not treat a client-only child as reason to mark its parent — a Server Component may render
  a Client Component.
- Do not sort, `push`, `splice`, or otherwise mutate an array that arrived as a prop. Copy it
  first, and tie-break the sort so rows with equal keys render in the same order every time
  instead of depending on input order (`candidate-profile.tsx:57-58,105-110`).
- Do not add `data-slot` or `cva` to one of our components — both belong to `ui/` primitives only.
- Do not build a clickable `<div>`. Anything clickable is a `<button>`.
