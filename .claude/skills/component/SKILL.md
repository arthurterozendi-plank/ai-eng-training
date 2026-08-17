---
name: component
description: Scaffold a React component in this repo — component file, co-located Vitest + Testing Library render test, at the conventional path, following the conventions in CLAUDE.md. Use when asked to create, scaffold, or add a new component.
allowed-tools: Read, Write, Edit, Glob, Grep, Bash
---

# Scaffold a component

Create one new component and its test, following this repository's conventions. Nothing else —
do not wire it into a page, do not invent props the caller did not ask for.

## Usage

```
/component <Name> [--client] [--ui]
```

- `<Name>` — PascalCase (`DataCard`) or kebab-case (`data-card`). Both are accepted.
- `--client` — emit a Client Component (`"use client"`). **Omit unless the component needs
  state, effects, refs, or browser APIs.** Server Component is the default.
- `--ui` — place it in `src/components/ui/` as a shadcn-style primitive instead of its own
  directory. Only for genuinely generic primitives.

If `<Name>` is missing, ask for it. Do not guess a name.

## Step 1 — Read the conventions

Read `CLAUDE.md` before writing anything. It is the source of truth for paths, naming, import
rules, and the no-barrel rule. If it disagrees with anything below, **CLAUDE.md wins** — and say
so in your report.

Then read `src/components/ui/button.tsx` and `src/components/ui/button.test.tsx` as the worked
example of the house style: `data-slot` attribute, `cn()` composition, props via
`React.ComponentProps<"tag">`, named export at the bottom of the file.

## Step 2 — Derive names and paths

From `<Name>` derive:

- `PascalName` — the exported symbol (`DataCard`)
- `kebab-name` — the file and directory name (`data-card`)

Paths:

| Flag      | Component                            | Test                                      |
| --------- | ------------------------------------ | ----------------------------------------- |
| (default) | `src/components/<kebab>/<kebab>.tsx` | `src/components/<kebab>/<kebab>.test.tsx` |
| `--ui`    | `src/components/ui/<kebab>.tsx`      | `src/components/ui/<kebab>.test.tsx`      |

**Check both paths first.** If either exists, stop and report it — never overwrite a component
someone already wrote.

## Step 3 — Write the component

Server Component (default):

```tsx
import * as React from "react";

import { cn } from "@/lib/utils";

function DataCard({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="data-card"
      className={cn("rounded-lg border border-border bg-background p-4", className)}
      {...props}
    />
  );
}

export { DataCard };
```

Client Component (`--client`) is identical but opens with `"use client";` followed by a blank
line.

Rules that are not negotiable:

- Import `cn` from `@/lib/utils` and compose every class through it. Never concatenate class
  strings.
- Use the shadcn CSS variables (`bg-background`, `text-muted-foreground`, `border-border`),
  never hardcoded colours.
- Spread `...props` onto the root element so callers can pass `id`, `aria-*`, and handlers.
- Named export at the bottom: `export { DataCard }`. No default export.
- Pick a semantic root element. If the component is clickable it is a `<button>`, not a
  `<div onClick>`. If it labels an input it needs `htmlFor`.

## Step 4 — Write the co-located test

```tsx
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataCard } from "@/components/data-card/data-card";

describe("DataCard", () => {
  it("renders its children", () => {
    render(<DataCard>Card content</DataCard>);

    expect(screen.getByText("Card content")).toBeInTheDocument();
  });
});
```

Query by accessible role or name whenever the root element has one — `getByRole("button", {
name: "..." })` for a button, `getByRole("heading")` for a heading. Fall back to `getByText`
only for a generic container. Never `getByTestId` in a fresh scaffold.

If `--client` was passed and the component takes a handler, add a second case using
`userEvent` from `@testing-library/user-event`, mirroring `button.test.tsx`.

## Step 5 — Do NOT create or update a barrel file

This repository has **no barrel files** by deliberate choice — see the Imports section of
`CLAUDE.md`. Consumers import the module directly:

```tsx
import { DataCard } from "@/components/data-card/data-card";
```

Do not create `index.ts`, do not add a re-export to one, and do not "helpfully" suggest it.
`src/types/index.ts` is a real module, not a barrel — leave it alone.

## Step 6 — Verify

```bash
pnpm typecheck && pnpm vitest run src/components/<kebab>
```

Then format, because the import sorter and Tailwind class sorter both rewrite what you wrote:

```bash
pnpm format
```

If typecheck or the test fails, fix it. Never hand back a red tree.

## Report

Three lines: the two files created, the import path a consumer should use, and the
`typecheck`/`test` result. If you made a judgment call — chose a root element, added
`"use client"`, picked a variant of the accessible query — say which and why in one line.
