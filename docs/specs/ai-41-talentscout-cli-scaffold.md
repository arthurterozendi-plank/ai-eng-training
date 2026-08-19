# AI-41 — Scaffold the TalentScout CLI repo for engineers building the Week 2 chatbot

**Linear:** AI-41 · Type: Chore · Parent: AI-9 · Milestone: Week 1 — Use AI: Workflow
**Blocks:** AI-48, AI-39
**Monorepo branch:** `arthurterozendi/ai-41-scaffold-the-talentscout-cli-repo`
(worktree `ai-eng-training-ai-41`, based on `origin/main` at `467a076`)
**New repo:** `../talentscout-cli`, a sibling checkout
**Status:** implemented — slices 1–5 and 7–8 complete; slice 6 (the remote) deferred under RED-1
option C. Hardened over three rounds (`APPROVED`); dispositions at the end of §6.

---

## 0. Escalations (RED — blocking, need a human)

### RED-1 — Create a GitHub remote for `talentscout-cli`?

Everything else in this ticket is local and reversible. Creating a repository is the one action
that reaches outside this machine, uses the user's GitHub identity, and picks a name, an owner
and a visibility that are annoying to unwind once anything is pushed.

**Correcting a stated fact:** the brief said `gh` auth is broken and blocks pushing. Verified
otherwise — both `gh` and SSH authenticate once a stale environment variable is excluded from the
call, so nothing here is blocked by tooling. **This is therefore a judgement call, not a blocked
one** — which is exactly why it needs the human rather than a silent default. (The specifics of
the local credential state were reported to the user out of band; they are machine hygiene, not a
project decision, and this document is committed to a public repository.)

| Option                                                                                                     | Consequence                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| **A (recommended)** — create `arthurterozendi-plank/talentscout-cli` as **private**, push the first commit | Day 4/6/7 engineers can clone it; matches how `ai-eng-training` is hosted (personal account, SSH) |
| B — create it under a `joinplank` org instead                                                              | Correct if this coursework is meant to be company-visible; I have no evidence either way          |
| C — local only, no remote                                                                                  | Satisfies every AC (see §5); costs nothing to add the remote later                                |

**Default if I hear nothing: C.** I will `git init` and commit locally and leave `git remote`
unset. No AC requires a remote — AC 1 says "given a clone of the new repo", and cloning from the
local path is a real clone. Slice 6 is the only slice gated on this;
**slices 1–5 and 7–8 proceed now.**

---

## 1. Problem statement

**User story:** As an engineer on the training, I want a second, separate TypeScript project
scaffolded so that Day 4's multi-project workflow is real and Day 6 has somewhere to build the
CLI chatbot.

Day 4 practises workspace switching, which is only a real exercise if the two workspaces are
genuinely different codebases with different rules. Pointing the exercise at two directories
inside one monorepo — same lockfile, same ESLint config, same CLAUDE.md — teaches nothing.
Making the second project the Day 6 CLI means the scaffold is not throwaway: AI-48 builds the
chatbot in it and Day 7 uses it as the tool sandbox.

### In scope

- A new repository at `../talentscout-cli`: TypeScript, a
  runner, pnpm, its own CLAUDE.md, a working `--help`, a smoke test.
- One cmux workspace pointed at that directory.
- A README edit **in `ai-eng-training`** recording the decision that the Week 2 CLI lives outside
  the monorepo (required by `CLAUDE.md` -> "Record project decisions in the README"; the README's
  "Layout" section currently argues the opposite way).

### Out of scope

- Any chatbot behaviour, conversation loop, or streaming — AI-48 onward.
- Anthropic SDK wiring, the API key, any `src/env.ts`. AI-48 owns its own env module.
- cmux **pane** layout / split configuration and any edit to `~/.config/cmux/cmux.json` — AI-39
  owns that. AI-41 creates one workspace and stops.
- Tests beyond the smoke test. No coverage thresholds, no CI workflow.
- A build step, a `bin` field, publishing to npm.

### Acceptance criteria (verbatim from the ticket)

1. Given a clone of the new repo, when `pnpm install` and the run command execute, then `--help`
   prints usage.
2. The repo has its own CLAUDE.md describing its conventions, not a copy of the web app's.
3. Typecheck and lint pass on the empty skeleton.
4. Edge cases / error states handled: an unknown flag prints usage and exits non-zero.

### AC -> slice traceability

| AC  | Satisfied by | Mechanically checked by                                                                                                         |
| --- | ------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Slices 1, 2  | Slice 7: clone to a scratch dir, `pnpm install`, `pnpm --silent cli --help` -> usage on stdout, exit 0                          |
| 2   | Slice 3      | Slice 3 DoD: a negative grep for web-app _rules_ returns 0, and positive greps confirm the CLI's own rules are present          |
| 3   | Slice 2      | Slice 2 DoD: `pnpm check` exits 0; a deliberate type error and a deliberate lint error each make it exit non-zero               |
| 4   | Slice 2      | Slice 2 DoD: `pnpm --silent cli --bogus` prints usage on **stderr** with empty stdout and exits 1; a unit test asserts the same |

Note on AC 3's wording: "the empty skeleton" means the scaffold before any chatbot behaviour
exists, not a literally empty `src/`. A literally empty `src/` cannot typecheck — see the TS18003
land-mine in §2.

---

## 2. Verified facts this plan rests on

Every claim below was executed against this machine on 2026-08-19. None is recalled.

**Toolchain**

- pnpm `11.5.0`, node `v22.20.0`, bun `1.3.14`, `tsx` **not** on PATH globally.
- Monorepo installed versions: TypeScript `5.9.3`, ESLint `9.39.5`, Vitest `4.1.10`,
  Prettier `3.9.6`, and `tsx@4.23.12` inside `packages/db`.
- Latest published: `eslint@10.8.1`, `typescript@7.0.2` — **deliberately not used** (see YELLOW-13).

**LAND-MINE 1: pnpm 11 hard-fails on unapproved build scripts.** `tsx` depends on `esbuild`, which
has a postinstall script. In a fresh single-package repo, _every_ `pnpm <script>` invocation aborts
before running anything:

```
$ pnpm cli --help
[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: esbuild@0.28.2
[ERROR] Command failed with exit code 1: pnpm install
exit=1
```

AC 1 fails outright without a fix. Two candidate fixes were tested:

| Mechanism                                                            | Result                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `pnpm-workspace.yaml` with `allowBuilds: { esbuild: true }`          | WORKS — esbuild postinstall runs, `pnpm cli --help` exits 0                                      |
| `package.json` -> `"pnpm": { "onlyBuiltDependencies": ["esbuild"] }` | **IGNORED** — `[WARN] The "pnpm" field in package.json is no longer read by pnpm.` Still exits 1 |

`pnpm-workspace.yaml` is the only mechanism that works on pnpm 11, and it is required even though
the repo declares no workspaces — it is pnpm 11's settings file, not a workspace declaration.
`ai-eng-training/pnpm-workspace.yaml` already carries the same `allowBuilds: esbuild: true`.

The successful run does print `esbuild postinstall: Done`, but **the DoD deliberately asserts the
symptom rather than that string**: `pnpm --silent cli --help` exiting 0 is exactly what
`ERR_PNPM_IGNORED_BUILDS` destroys, and it does not depend on a log format that pnpm is free to
change.

**LAND-MINE 2: `tsc --noEmit` fails on a literally empty `src/`.** Probed with this plan's own
tsconfig shape (`nodenext`, `include: ["src/**/*.ts"]`, no source files):

```
error TS18003: No inputs were found in config file '.../tsconfig.json'.
Specified 'include' paths were '["src/**/*.ts"]' and 'exclude' paths were '["node_modules"]'.
exit=2
```

Adding one real file makes the same command exit 0. Consequence for the plan: the tooling config
and the first source file **cannot be separate slices** — a config-only slice has an
unsatisfiable typecheck DoD. They are merged into Slice 2.

**LAND-MINE 3: `moduleResolution: "nodenext"` forbids extensionless relative imports.**

```
src/main.ts(1,21): error TS2835: Relative import paths need explicit file extensions in
ECMAScript imports when '--moduleResolution' is 'node16' or 'nodenext'. Did you mean './cli.js'?
```

Rewriting the specifier to `./cli.js` makes `tsc --noEmit`, `tsx`, **and** Vitest 4 all pass
simultaneously — verified in one probe. This is the single most surprising rule in the new repo
and must be stated in its CLAUDE.md. The monorepo uses `moduleResolution: "bundler"` and so never
hits it — another reason its CLAUDE.md cannot be copied across.

**LAND-MINE 4: `prettier --check .` fails on the lockfile that `pnpm install` just wrote.**
Probed in a fresh single-package repo of this plan's exact shape, with every source file already
formatted:

```
$ prettier --check .            # no .prettierignore
[warn] pnpm-lock.yaml
[warn] Code style issues found in the above file.
exit=1

$ prettier --check .            # .prettierignore containing the single line pnpm-lock.yaml
All matched files use Prettier code style!
exit=0
```

`node_modules` is never flagged — Prettier ignores it by default, verified — so in this repo
`.prettierignore` has exactly one job, and omitting it makes Slice 2's headline `pnpm check` DoD
fail. Same shape as land-mine 1: a DoD asserting exit 0 against a default that exits 1.
`ai-eng-training/.prettierignore` carries `pnpm-lock.yaml` for the same reason, alongside entries
for build output this repo does not produce.

**The lockfile is committed.** `git ls-files` in `ai-eng-training` lists `pnpm-lock.yaml`, and
`git check-ignore` confirms it is not ignored. The new repo follows suit: without it, Slice 7's
clean clone re-resolves every caret-ranged devDependency and would verify AC 1 against a
dependency tree nobody tested.

**Argument parsing.** `node:util`'s `parseArgs` in strict mode already satisfies AC 4 with zero
dependencies — an unrecognised flag throws `ERR_PARSE_ARGS_UNKNOWN_OPTION` with the message
`Unknown option '--nope'.` Verified.

**Runner.** All three candidates run the same file successfully: `tsx src/main.ts --help`,
`bun src/main.ts --help`, and bare `node src/main.ts --help` (node 22.20 strips types by default).
The choice is therefore not about capability; see YELLOW-4.

**Argument pass-through.** `pnpm cli --help` forwards the flag without needing `--`; both forms
verified. `pnpm --silent cli --help` suppresses pnpm's `$ tsx src/main.ts` banner, so the DoD
commands below can assert stdout exactly.

**Shared configs cannot cross the repo boundary.**

- `packages/eslint-config` and `packages/typescript-config` are both `"private": true`, version
  `0.0.0`, consumed as `workspace:*`. Unpublished, so a separate repo cannot depend on them.
- `packages/eslint-config/base.js` re-exports `eslint-config-next/typescript`. That package's
  dependencies are `@next/eslint-plugin-next`, `eslint-import-resolver-node`,
  `eslint-import-resolver-typescript`, `eslint-plugin-import`, `eslint-plugin-jsx-a11y`,
  `eslint-plugin-react`, `eslint-plugin-react-hooks`, `globals`, `typescript-eslint` — nine
  packages, including React and JSX-a11y plugins, to reach `typescript-eslint`'s recommended set.
  Reproducing that in a repo with no React would be dishonest weight.

**Vitest needs no config file here.** Its default environment is already `node`.
`packages/db/vitest.config.mts` exists only for the `@/*` alias and coverage settings — neither
applies; see YELLOW-8.

**Prettier config cannot be copied either.** `ai-eng-training/prettier.config.mjs` loads
`prettier-plugin-tailwindcss` and points `tailwindStylesheet` at a file inside `apps/web`, and its
`importOrder` is a list of `@/components`, `@/hooks`, `@/lib` groups that do not exist in a flat
CLI `src/`.

**The monorepo's `pnpm check` includes a root Prettier pass over the whole tree** — `turbo run
typecheck lint test` followed by `prettier --check .`, per the root `package.json`. Markdown is not
in `.prettierignore`, so a hand-wrapped `README.md` or `docs/specs/*.md` is subject to it. Any
monorepo-side slice must therefore run `pnpm check`, not just `git` and `grep` assertions.

**cmux — established, not assumed.** A cmux "workspace" is **runtime session state, not a
committed config file.**

- `cmux --help` states: `cmux <path>  Open a directory in a new workspace (launches cmux if needed)`.
- Workspaces are persisted in cmux's own session file under Application Support, as
  `windows[].tabManager.workspaces[]`, each entry carrying a `currentDirectory`.
- `~/.config/cmux/cmux.json` is the **settings** file (appearance, terminal, shortcuts,
  `workspaceColors`, `workspaceGroups.newWorkspacePlacement`). It contains no workspace registry.
  cmux's own help warns to back it up before editing. AI-41 does not touch it; AI-39 owns it.
- `cmux workspace list` (legacy alias `cmux list-workspaces`) prints workspaces by title and exits
  0 — verified live, so the slice has a real check.
- Consequence: **the cmux slice produces no repository artifact.** It is a one-time local machine
  action. Claiming otherwise would require inventing a config format that does not exist.

**`ai-eng-training` README** contained, _before_ the Slice 4 edit this spec plans, no occurrence
of "cmux", "Day 4", "Day 6" or "Day 7", and none of "CLI" in its Layout section (line 162
mentions the Supabase CLI, unrelated). Slice 4 is what introduces them.
Its "Layout" section justifies the monorepo on the grounds that "the later days add a scraper, a
long-running extraction pipeline and a voice service, and each needs the same schema and the same
lint and TypeScript rules as the web app." That is the sentence Slice 4 must reconcile.

**A spec convention already exists** (contrary to the brief): `docs/specs/ai-130-theme-toggle.md`
and `docs/specs/ai-34-domain-model.md` are both committed, both shaped like this document.
See YELLOW-11.

---

## 3. The structural question: separate repo vs `apps/cli`

**Decision: separate repo.** Recorded here because the monorepo README currently argues the other
way and a reviewer deserves to see the road not taken.

The case for `apps/cli` is real: `CLAUDE.md`'s workspace-layout rules would apply unchanged, the
shared ESLint and TypeScript configs would be reusable via `workspace:*`, one `pnpm check` would
cover everything, and a future CLI command that reads the hiring pipeline could import
`@talentscout/db` for free. The README's own stated rationale for the monorepo — "each needs the
same schema and the same lint and TypeScript rules" — points straight at it.

It loses anyway, on three grounds:

1. **The ticket's purpose is the separation itself.** "a separate repo", "two genuinely different
   codebases to practise workspace switching", "its own cmux workspace". An `apps/cli` directory
   sharing a lockfile, a `pnpm check` and a CLAUDE.md is one codebase with two folders. Day 4
   would be exercising a directory change, not a workspace switch.
2. **AC 2 becomes unsatisfiable in spirit.** `CLAUDE.md` is repo-root and inherited; an
   `apps/cli/CLAUDE.md` would be an _addendum_ to the web app's rules, not "its own conventions,
   not a copy". The verified `nodenext` versus `bundler` split (§2) is a concrete case where the
   CLI needs a rule that contradicts the monorepo's.
3. **The shared-config benefit is smaller than it looks.** The CLI needs `typescript-eslint`
   directly, not the nine-package `eslint-config-next` chain, and a `nodenext` tsconfig, not
   `library.json`'s `bundler`. It would override most of what it inherited.

**Cost accepted:** if the Day 6 CLI later needs the schema, `@talentscout/db` is unreachable
across the repo boundary. That is a Week 2 problem with three known outs (publish the package,
`pnpm link`, or copy the few types the CLI needs) and none of them is a one-way door today.
Recorded as a risk in §7, not solved now.

---

## 4. Target shape of `talentscout-cli`

```
talentscout-cli/
  .gitignore
  .prettierignore           # one load-bearing entry: pnpm-lock.yaml — see land-mine 4
  CLAUDE.md                 # its own conventions — AC 2
  README.md
  eslint.config.mjs         # typescript-eslint + eslint-config-prettier, standalone
  package.json              # private, type: module, packageManager pnpm@11.5.0, engines node >=22
  pnpm-lock.yaml            # committed, as in ai-eng-training — Slice 7's clone installs from it
  pnpm-workspace.yaml       # settings only: allowBuilds.esbuild — required, see land-mine 1
  prettier.config.mjs       # monorepo's formatting values, without the Tailwind plugin
  tsconfig.json             # nodenext, strict, no @/ alias
  src/
    cli.ts                  # the pure core
    cli.test.ts             # the smoke test
    main.ts                 # the process adapter
```

**The one contract worth pinning:** `src/cli.ts` exports a pure `run(argv: string[])` returning
`{ text, stream, exitCode }` — _what to print, on which stream, with which exit code_ — and
performs no I/O. `src/main.ts` is the sole owner of `process`: `process.argv`, `process.stdout`,
`process.stderr`, `process.exitCode` appear nowhere else. That is what lets the smoke test assert
real CLI behaviour without spawning a subprocess, and it is the seam AI-48 will need to test a
conversation loop. It rhymes with the monorepo's "one module owns the boundary" idea
(`src/env.ts`) without copying any of that rule's content.

Everything below that line — export names, file lengths, how the test file splits its cases — is
the implementer's call against real code. The DoD commands in Slice 2 pin the observable
behaviour, which is what actually matters.

Scripts on `package.json`: `cli`, `typecheck`, `lint`, `lint:fix`, `test`, `test:watch`,
`format`, `format:check`, and `check` = typecheck + lint + test + format:check.

---

## 5. Plan (slices)

Eight slices. Each is independently verifiable, and each DoD is a command with an exit code or a
file assertion. Unless stated, commands run from
`../talentscout-cli`.

**Slices 1–5 and 7–8 are unblocked and proceed now. Slice 6 is gated on RED-1.** Slice 7
(clean-clone) depends on Slice 5 (first commit), not on Slice 6, so the RED-1 answer never blocks
AC 1.

### Slice 1 — Repo skeleton, git, pnpm settings

Create the directory, `git init` with default branch `main`, `.gitignore`, `.prettierignore`,
`package.json` (`name: talentscout-cli`, `private: true`, `type: "module"`,
`packageManager: "pnpm@11.5.0"`, `engines.node: ">=22"`), and `pnpm-workspace.yaml` carrying
`allowBuilds: { esbuild: true }` plus a comment explaining why a workspace file exists in a repo
that declares no workspaces.

No dependencies are installed yet, so nothing here can exercise land-mine 1 — that check lives in
Slice 2, which is the first slice where `esbuild` exists.

**DoD**

- `test -d .git` exits 0 and `git branch --show-current` prints `main`.
- Reading `package.json` shows `type === "module"` and `packageManager === "pnpm@11.5.0"`.
- `grep -c "esbuild" pnpm-workspace.yaml` is at least 1, under an `allowBuilds` key.
- `grep -c "node_modules" .gitignore` is at least 1, and `grep -c "pnpm-lock.yaml" .gitignore`
  returns **0** — the lockfile is tracked, not ignored.
- `grep -c "pnpm-lock.yaml" .prettierignore` is at least 1 (land-mine 4). The file it names does
  not exist until Slice 2 installs dependencies, which is why the entry is written now and
  exercised then.

### Slice 2 — Toolchain and the CLI

Tooling config and the first source file land together: a config-only slice cannot satisfy a
typecheck DoD (land-mine 2, TS18003).

`tsconfig.json`: `module` and `moduleResolution` both `nodenext`, `target` and `lib` ES2023,
`types: ["node"]`, `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `isolatedModules`,
`noEmit`, no `paths`.
`eslint.config.mjs`: `typescript-eslint`'s recommended set with `eslint-config-prettier` last.
`prettier.config.mjs`: the monorepo's `semi` / `singleQuote` / `trailingComma` /
`printWidth: 100` / `tabWidth: 2`, plus `@ianvs/prettier-plugin-sort-imports` ordering
`^node:` -> third-party -> relative, and **no** `prettier-plugin-tailwindcss`.
devDependencies: `typescript@^5`, `@types/node@^22`, `eslint@^9`, `typescript-eslint@^8`,
`eslint-config-prettier@^10`, `prettier@^3`, `@ianvs/prettier-plugin-sort-imports@^4`,
`vitest@^4`, `tsx@^4`. All nine `package.json` scripts including `check`.

`src/cli.ts` (the pure `run(argv)` of §4), `src/main.ts` (the process adapter), `src/cli.test.ts`.
Parsing is `node:util`'s `parseArgs` in strict mode. Relative imports carry `.js`.

Behaviour: `--help` and `-h` print usage on stdout and exit 0. An unknown flag prints usage on
stderr, names the offending flag, shows no stack trace, and exits 1 (YELLOW-16). No arguments
prints usage on stdout and exits 0 (YELLOW-17).

**DoD — run each command verbatim**

- `pnpm install` exits 0.
- `pnpm --silent cli --help` -> stdout matches `^Usage: talentscout`, exit `0`.
  **This is the land-mine 1 check**: `ERR_PNPM_IGNORED_BUILDS` breaks exactly this, and the
  assertion does not depend on a pnpm log string.
- `pnpm --silent cli -h` -> exit `0`.
- `pnpm --silent cli --bogus 2>/dev/null` -> **empty stdout**, exit `1`.
- `pnpm --silent cli --bogus 2>&1 >/dev/null` -> output contains `--bogus` and `Usage:` and
  contains no `   at` stack frame.
- `pnpm test` exits 0, and deleting the unknown-flag branch makes it fail — the test is not
  vacuous. Phrased against behaviour, not against a named internal call: how the flag is parsed is
  the implementer's to choose.
- `pnpm check` exits 0. **This is the AC 3 check.**
- Gates are live, verified then reverted: an unused variable makes `pnpm check` exit non-zero
  (lint), and `const x: number = "s"` makes it exit non-zero (types). `pnpm check` back to 0
  afterwards.
- `grep -c "eslint-config-next" package.json` returns 0, and reading `tsconfig.json` shows
  `moduleResolution === "nodenext"`.

### Slice 3 — `talentscout-cli/CLAUDE.md` and `README.md` (AC 2)

Written from the CLI's own constraints. Headings are the implementer's choice; the required
_content_ is what the DoD checks, so the document can be as short as it honestly needs to be.

Required content:

1. **What this repo is** — the Day 6 CLI chatbot and Day 7 tool sandbox for TalentScout; a sibling
   of `ai-eng-training` that shares no code with it and inherits none of its rules.
2. **Toolchain** — node >=22, pnpm 11.5.0, tsx, TypeScript 5.9 strict, ESLint 9 with
   typescript-eslint 8, Vitest 4, Prettier 3.
3. **Layout and the import rule** — flat `src/`, no `@/` alias yet; **relative imports carry a
   `.js` extension**, with TS2835 named as the reason. This is the rule someone will otherwise
   trip over.
4. **The seam and the CLI contract** — `run(argv)` pure, returning `{ text, stream, exitCode }`;
   `main.ts` the sole owner of `process`; `--help` to stdout with 0, usage error to stderr with 1,
   unexpected error to stderr with 1 and a generic message, never a stack trace.
5. **Verification** — `pnpm check` before handing work back.

`README.md` covers install, run, and check.

**DoD**

- `test -f CLAUDE.md` and `test -f README.md` both exit 0.
- **Negative check — the "not a copy" half of AC 2.** This greps for the web app's _rules_, not
  for technology names, because naming a technology the CLI does not use is legitimate content
  whereas importing the web app's rules is not:
  `grep -Eic '"use client"|Server Components by default|@/components|cn\(\)' CLAUDE.md`
  returns **0**.
- **Positive checks — the "its own conventions" half.** Each of these `grep -c` results is at
  least 1: `TS2835`; `run(argv)`; `main.ts`; `pnpm check`. Together with the negative check these
  are AC 2's mechanical evidence.
- `pnpm check` still exits 0 (Prettier covers markdown here too).

### Slice 4 — `ai-eng-training` README records the decision

In the worktree `ai-eng-training-ai-41`. Edit, do not
append: the "Layout" section's monorepo rationale is currently unqualified, so qualify it and
state the exception with its reason. Draft wording:

> The Week 2 CLI chatbot is the deliberate exception: it lives in its own repository,
> `talentscout-cli`, rather than under `apps/`. Day 4 of the programme practises switching between
> workspaces, which is only a real exercise when the two are genuinely separate — different
> lockfile, different lint and TypeScript rules, its own CLAUDE.md. An `apps/cli` directory would
> have inherited all three and taught nothing. The CLI shares no code with this repository; if it
> later needs the schema, `@talentscout/db` gets published rather than reached into.

Also add a short "Related repositories" line naming `talentscout-cli` and what it is for.

**DoD**

- **`pnpm check` exits 0 from the worktree root.** Markdown is not in `.prettierignore`, so
  hand-wrapped prose at `printWidth: 100` is subject to the root Prettier pass; `CLAUDE.md`
  requires this before handing work back regardless.
- `git diff --stat README.md` shows README.md modified, and `git diff README.md` contains removed
  lines as well as added ones — proof it is an edit, not an append.
- `grep -c "talentscout-cli" README.md` is at least 1.
- No other file appears in the diff except the spec document from YELLOW-11.

**No commit DoD here, deliberately.** Committing this worktree and opening the PR is the harness's
release step after review, not work this plan performs — which is why the DoD asserts a working-tree
diff. The asymmetry with Slice 5 is real but not an oversight: that commit exists because Slice 7
clones from it. If the harness expects the implementer to commit, it is one `git commit` on the
same content and changes nothing above.

### Slice 5 — First commit in `talentscout-cli`

Stage everything and commit. No remote, no push.

This commit is in the plan because Slice 7 clones from it — it is a functional dependency of AC
1's only real check, not a release step. The monorepo side has no matching slice on purpose: see
the note under Slice 4.

**DoD**

- `git log --oneline` shows exactly one commit and `git status --porcelain` is empty.
- `git ls-files` includes `CLAUDE.md`, `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`,
  `.prettierignore`, `src/main.ts`, `src/cli.ts`, `src/cli.test.ts`.
- `git ls-files | grep -c node_modules` returns 0.

### Slice 6 — GATED on RED-1 — GitHub remote

Only if the human picks option A or B: create the repository private, add it as `origin`, push
`main`.

**DoD**

- `git remote -v` shows `origin`, `git ls-remote origin` exits 0, and `git status -sb` reports
  neither ahead nor behind.

### Slice 7 — Clean-clone verification (AC 1)

The only check that actually proves AC 1, because it is the only one starting from a tree with no
`node_modules`: clone `../talentscout-cli` into a scratch
directory, install, run. It proves AC 1 against the tree that was actually tested only because
Slice 5 committed `pnpm-lock.yaml`; without it, `pnpm install` here would re-resolve every
caret-ranged devDependency.

**DoD**

- `git clone` exits 0 and `pnpm install` exits 0.
- `pnpm --silent cli --help` prints usage on stdout and exits 0.
- `pnpm --silent cli --bogus` exits 1.
- `pnpm check` exits 0.
- Scratch clone removed afterwards.

### Slice 8 — cmux workspace

`cmux new-workspace --name "talentscout-cli" --cwd ../talentscout-cli`

Produces no repository artifact (§2). `~/.config/cmux/cmux.json` is not touched.

**DoD**

- `cmux workspace list` exits 0 and its output contains `talentscout-cli`.
- The SHA-256 of `~/.config/cmux/cmux.json` is unchanged from before the slice. A content hash
  rather than an mtime: the property wanted is that AI-41 left AI-39's settings alone, and a
  rewrite with identical content would false-fail an mtime comparison.

---

## 6. Assumptions / decisions log (YELLOW — challenge these in review)

This section is what goes in the PR body.

**YELLOW-1 — The CLI lives in a separate repository, not `apps/cli`.** The ticket says so three
different ways and AC 2 is unsatisfiable under an inherited root CLAUDE.md. Full argument and the
accepted cost in §3. _Rejected:_ `apps/cli` — it would have given free `@talentscout/db` access
and one `pnpm check`, at the price of the exercise the ticket exists to create.

**YELLOW-2 — Location `../talentscout-cli`.** Sibling of
`ai-eng-training`, `claude-skills`, `poc-ltm-group` and `prosperity-base44`, matching the existing
layout; nothing of that name exists there. _Rejected:_ nesting it inside `ai-eng-training/` — a
git repo inside a git repo, which would land in either the monorepo's ignore file or its index.
Reversible: it is a directory move.

**YELLOW-3 — Name `talentscout-cli`, package `private: true`, unscoped.** Not `@talentscout/cli`:
in this codebase the `@talentscout/*` scope means "workspace of the monorepo", and reusing it
across the boundary would imply a `workspace:*` link that cannot exist. _Rejected:_
`talentscout-chat` — AI-41 is scaffolding and Day 7 makes it a tool sandbox, not only a chatbot.

**YELLOW-4 — Runner: `tsx` as a devDependency, not `bun`, not node's native type stripping.** All
three were verified to run the same file, so this is not a capability choice. `tsx` wins on AC 1
specifically: the AC is "`pnpm install` **and** the run command execute", and `pnpm install` is
exactly what installs tsx — so the AC is self-contained on any machine with node. bun would make
AC 1 depend on a global runtime `pnpm install` cannot provide, and running bun while pnpm owns the
lockfile is a split brain. `tsx@4.23.12` is also already this programme's script runner in
`packages/db` — precedent, not novelty. _Rejected:_ bare `node src/main.ts`, which works on node
22.20 but relies on experimental type stripping, pins node >=22.18, and is not what the ticket
asked for.

**YELLOW-5 — Argument parsing: `node:util`'s `parseArgs`, zero dependencies.** Verified to reject
unknown flags in strict mode, which _is_ AC 4. `CLAUDE.md`'s "extract a package when a second
consumer exists, not before" is the same instinct applied to dependencies. _Rejected:_
`commander` / `citty` / `yargs` — each would earn its place the moment AI-48 adds subcommands with
typed options; none earns it for one boolean flag. The new CLAUDE.md records this as the worked
example so AI-48 can revisit it honestly rather than inheriting a taboo.

**YELLOW-6 — Lint stands alone on `typescript-eslint@8` plus `eslint-config-prettier@10`.**
`@talentscout/eslint-config` is `private: true` and consumed via `workspace:*` — literally
unreachable from another repo. Reproducing it would mean depending on `eslint-config-next` and its
nine transitive plugins, including React and JSX-a11y, in a repo with no React.
`typescript-eslint` recommended is the same underlying ruleset `eslint-config-next/typescript`
re-exports, minus the framework. _Rejected:_ publishing `@talentscout/eslint-config` to npm —
real infrastructure for a single consumer.

**YELLOW-7 — TypeScript config: standalone, `moduleResolution: "nodenext"`, no `@/` alias.**
`@talentscout/typescript-config` is unpublished, so there is nothing to extend. `nodenext` is the
honest setting for a program node executes and it survives a future `tsc` build; the monorepo's
`bundler` is right for Next and wrong here. The cost — TS2835, relative imports must carry `.js` —
was verified compatible with tsc, tsx and Vitest simultaneously, and is required content in the
new CLAUDE.md. No `@/` alias because `src/` is flat: the rule being honoured is that a relative
import _crossing a directory_ is a defect, and with no subdirectories that cannot happen. Add the
alias with the first subdirectory. _Rejected:_ copying `library.json` verbatim — it would drift
silently from a source it is no longer linked to.

**YELLOW-8 — Vitest 4, node environment, no config file.** Node is Vitest's default environment,
so a config file here would be pure ceremony: `packages/db/vitest.config.mts` exists only for the
`@/*` alias (YELLOW-7: none) and coverage settings (out of scope). _Rejected:_ `node:test` —
Vitest is the programme's convention and AI-48 will want its mocking.

**YELLOW-9 — The smoke test covers the CLI's whole observable contract, not one case.** "Tests
beyond a smoke test" is out of scope, but a single `--help` assertion would still pass with half
the feature deleted. The contract is `--help`, `-h`, unknown flag, and no arguments; how the test
file splits those is the implementer's call, and the Slice 2 DoD pins the behaviour either way.
Testing the pure `run()` rather than spawning a subprocess keeps it fast; Slice 7's clean-clone
check covers the wiring `run()` cannot see. _Rejected:_ a subprocess-spawning test — slower, and
Slice 7 already proves the same thing once.

**YELLOW-10 — Prettier config is the monorepo's formatting values without its plugins.** Same
`semi`, `singleQuote`, `trailingComma`, `printWidth: 100`, `tabWidth: 2`, so an engineer switching
workspaces on Day 4 is not also fighting two whitespace styles. But no `prettier-plugin-tailwindcss`
(no Tailwind, and `tailwindStylesheet` points into the other repo) and a three-group `importOrder`
instead of the web app's seven. Formatting is cosmetic; conventions are not — matching the former
while diverging on the latter is precisely what AC 2 is asking for.

**YELLOW-11 — Commit this spec to
`ai-eng-training/docs/specs/ai-41-talentscout-cli-scaffold.md`.** Contrary to the brief, that
convention already exists (`ai-130-theme-toggle.md`, `ai-34-domain-model.md`, both shaped like
this). Following it makes the monorepo PR — otherwise a single README paragraph — self-explanatory.
Decline this freely; nothing depends on it.

**YELLOW-12 — No `bin` field, no shebang, no build step in v1.** A `bin` entry pointing at a `.ts`
file without a build or a shebang is broken on install, and publishing is out of scope.
`pnpm cli --help` is the run command the AC asks for, and it is what the README and CLAUDE.md
document. Revisit when the CLI is meant to be installed rather than run from a clone.

**YELLOW-13 — Pin ESLint 9 and TypeScript 5.9, not the published 10 and 7.** `eslint@10.8.1` and
`typescript@7.0.2` exist, but the monorepo runs 9.39.5 and 5.9.3. Two repos on two major versions
of the same tools would make Day 4's workspace switching about version shock rather than
convention shock, and neither major has been exercised anywhere in this programme.

**YELLOW-14 — Slice 8 creates a cmux workspace via the CLI and produces no committed artifact.**
This follows from §2's verification, not from a preference: cmux has no declarative workspace
file. Saying so plainly beats inventing a format. AI-39 owns pane layout and
`~/.config/cmux/cmux.json`; AI-41 deliberately touches neither.

**YELLOW-15 — Corrected the brief's `gh` claim rather than designing around it.** The brief stated
that pushing and repo creation are blocked. Verified otherwise: SSH auth works, and `gh` works
once the invalid environment token is excluded from the call. The remote is still deferred — but
as a judgement call escalated to the human (RED-1), not as a workaround for tooling that turned
out not to be broken. Designing around a constraint that does not exist would have been the worse
error.

**YELLOW-16 — An unknown flag writes usage to stderr and leaves stdout empty.** AC 4 says only
"prints usage and exits non-zero", so the stream is my call, not the ticket's. Usage-on-stderr is
the Unix convention and it keeps `cli ... | something` from being fed an error page as if it were
output. The DoD asserts _empty stdout_ as well as exit 1, which is stricter than AC 4 requires.
_Rejected:_ usage on stdout with a non-zero exit — simpler to assert, but it makes the failure
path indistinguishable from the success path to any consumer that only reads stdout.

**YELLOW-17 — No arguments prints usage on stdout and exits 0.** No AC covers this, and it is a
real fork: many CLIs treat "no input" as a usage error and exit 1 or 2. Exit 0 is right _for this
scaffold_ because there are no subcommands yet, so "no arguments" is not yet a mistake a user can
make — there is nothing else they could have typed. AI-48 inherits this and should revisit it the
moment a subcommand exists, at which point bare invocation becomes a genuine usage error.
_Rejected:_ exiting non-zero on no arguments — it would make the scaffold's own happy path fail
its own `pnpm cli` script.

### Critic dispositions (harden round 1)

**[BLOCKER] Slice 5 DoD contradicted its own content; AC 2 had no working mechanical check —
ACCEPTED, both halves fixed.** Confirmed by probe: a line reading "Explicitly absent: React,
Next.js, Tailwind, shadcn/ui, Drizzle, Turborepo" makes the old case-insensitive grep return
non-zero, so the DoD could never pass. Two changes. (a) The mandated "Explicitly absent" list is
gone — it was padding, and it is what created the collision. (b) The negative grep now targets
_rules copied from the web app_ — `"use client"`, `Server Components by default`, `@/components`,
`cn()` — verified to return 0 against that same line. Naming a technology the CLI does not use is
legitimate content; importing the web app's rules is not, and only the second is what "not a copy"
means. Added four positive greps (`TS2835`, `run(argv)`, `main.ts`, `pnpm check`) so AC 2 has
evidence in both directions rather than only an absence.

**[SHOULD] Slice 1's `esbuild postinstall: Done` DoD was unsatisfiable — ACCEPTED.** Correct: every
devDependency landed in the next slice, so Slice 1 had no build script to run. One clarification
on the evidence — that string _was_ observed in the §2 probe, so it was not invented, but the
finding's remedy is better anyway and is adopted: the land-mine check moves to Slice 2 (the first
slice where `esbuild` exists) and asserts the symptom, `pnpm --silent cli --help` exiting 0, which
is exactly what `ERR_PNPM_IGNORED_BUILDS` destroys and does not depend on a pnpm log format. §2
now says why the symptom is asserted rather than the string. Slice 1's DoD is now four things it
can actually check at that point.

**[SHOULD] `pnpm typecheck` on an empty `src/` is false — ACCEPTED, verified independently.**
Reproduced with this plan's tsconfig shape: `error TS18003: No inputs were found in config file`,
`exit=2`; adding one real file takes the same command to exit 0. Old Slices 2 and 3 are merged
into one Slice 2 so the config and the first source file land together. Did **not** add a
placeholder file, as the finding warned against. Also added a note under AC 3 that "the empty
skeleton" means the scaffold before chatbot behaviour, not a literally empty `src/` — otherwise
the AC reads as requiring the impossible.

**[SHOULD] Ten mandated CLAUDE.md sections were over-built — ACCEPTED, cut to five content
requirements with headings left to the implementer.** Dropped the "Working agreement" section: the
finding is right that re-importing the parent's rules is the thing AC 2 pushes against, and I have
no evidence the CLI repo needs its own copy before anyone works in it. Dropped "Deliberately
absent, and why" as a duplicate of this section. What remains is what the CLI actually turns on:
what the repo is, toolchain, the `.js`/TS2835 import rule, the seam and exit-code contract, and
`pnpm check`. The DoD now checks content, not heading presence, so a short honest document passes
and a padded one gains nothing.

**[SHOULD] No monorepo-side slice ran `pnpm check` — ACCEPTED.** Added as the first DoD item on
Slice 4, with the reason stated: markdown is not in `.prettierignore`, so hand-wrapped prose at
`printWidth: 100` is subject to the root Prettier pass, and `CLAUDE.md` requires `pnpm check`
before handing work back regardless. Recorded the root-`pnpm check` composition in §2 so the
requirement is traceable to a verified fact rather than to a memory of the convention.

**[SHOULD] Two behaviour decisions were unlogged — ACCEPTED.** Added YELLOW-16 (unknown flag ->
stderr, empty stdout, exit 1 — stream choice is mine, AC 4 only says non-zero) and YELLOW-17
(no arguments -> stdout, exit 0 — defensible only while there are no subcommands, and flagged for
AI-48 to revisit). No design change; both were already the planned behaviour and are now
challengeable.

**[NIT] Slice 4 was not a slice — ACCEPTED, folded.** The `check` script joins the other eight
scripts in Slice 2, and the two gate-is-live probes join Slice 2's DoD. Combined with the merge
above, the plan drops from ten slices to eight.

**[NIT] Lines below design altitude — ACCEPTED, deleted.** Removed "exports `USAGE`", "four-line
adapter", and the enumerated four test cases from §4 and the plan. Kept the seam itself (`run(argv)`
pure returning `{ text, stream, exitCode }`; `main.ts` sole owner of `process`) — that is a real
contract AI-48 depends on. §4 now says explicitly that everything below that line is the
implementer's call, and YELLOW-9 was reworded from "one test file, four cases" to the contract the
tests must cover.

**[NIT] cmux flags check out — no action.** Noted so it is not re-raised.

**Scope held.** Nothing in this round added a file, a dependency, a script, or a slice. Net change
is ten slices to eight, ten mandated CLAUDE.md sections to five content requirements, and three
DoD assertions replaced with ones that can actually pass.

### Critic dispositions (harden round 2)

**[SHOULD] `pnpm-lock.yaml` missing in two places — ACCEPTED, both fixed, and the second was worse
than reported.** Verified independently rather than taken on report: `ai-eng-training` tracks
`pnpm-lock.yaml` (`git ls-files` lists it, `git check-ignore` confirms it is not ignored), and
`ai-eng-training/.prettierignore` carries the `pnpm-lock.yaml` line. Reproduced the failure in a
fresh single-package repo of this plan's shape with every source file already formatted: without
`.prettierignore`, `prettier --check .` exits 1 with `pnpm-lock.yaml` as the **sole** offender;
with the one-line file, exit 0. `node_modules` was never flagged, confirming the finding's claim
that this is the file's only job here. Changes: `pnpm-lock.yaml` added to §4's tree and to Slice
5's `git ls-files` DoD; `.prettierignore` annotated in §4; a new land-mine 4 in §2 with the probe
output; a new §7 risk 3 (others renumbered); Slice 1's DoD now greps for the `.prettierignore`
line _and_ asserts the lockfile is **not** in `.gitignore`, which the finding did not raise but is
the other way to lose it; Slice 7 now states that its clone only tests the tested tree because the
lockfile is committed. Slice 5's DoD also picks up `.prettierignore` itself, which was likewise
absent from the tracked-files list.

**[NIT] Monorepo/CLI commit asymmetry — ACCEPTED, resolved by stating the boundary rather than
adding a DoD.** Took the finding's first option. Added a note under Slice 4 that committing the
worktree and opening the PR is the harness's release step after review, not work this plan
performs — which is why its DoD asserts a working-tree diff — and a note under Slice 5 that
_that_ commit is in the plan only because Slice 7 clones from it, making it a functional
dependency of AC 1's check rather than a release step. Declined the second option (a commit DoD on
Slice 4): it would duplicate what the harness does, and a plan that commits the monorepo before
review inverts the order the harness expects. The note says explicitly that if the harness does
expect the implementer to commit, it is one `git commit` on the same content and nothing above
changes.

**Scope held.** No file, dependency, script or slice was added. Net change is one line in
`.prettierignore`, one tracked artifact, and four DoD assertions that were missing.

---

### Critic dispositions (harden round 3)

`VERDICT: APPROVED`. No BLOCKERs; four NITs, three of them applied directly to this document
rather than through another planning round.

**[NIT] Slice 8's cmux DoD compared an mtime — accepted.** The property wanted is "AI-41 left
AI-39's settings file alone", and an mtime false-fails on a rewrite with identical content — a
case §2 never probed. Now compares a SHA-256 of `~/.config/cmux/cmux.json` before and after. Same
cost, no false-fail.

**[NIT] Slice 2's non-vacuity check named an internal call — accepted.** "Removing the `parseArgs`
call" pinned a _how_ the implementer owns; `parseArgs` may legitimately sit behind a wrapper. Now
phrased against behaviour: deleting the unknown-flag branch must make `pnpm test` fail.

**[NIT] §7 risk 10 was session housekeeping, not a risk of this plan — accepted, deleted.** The
scratch probe directories live outside the artifact. §7 is stronger at nine load-bearing entries.

**[NIT] A local credential-hygiene issue — out of band, no action taken.** Reported to the user
directly rather than recorded here: it is a problem on one machine, not a defect in this plan, and
not something an agent should silently edit. Details deliberately stay out of this document, which
is committed to a public repository.

**Land-mine probed and cleared, recorded so nobody re-derives it.** The root workspace file's
`minimumReleaseAgeExclude` implies a `minimumReleaseAge` setting that would stall a fresh install
in the new repo. It does not: there is no repo `.npmrc` and `pnpm config get minimumReleaseAge`
returns `undefined`.

---

## 7. Risks / land-mines

1. **`allowBuilds` is load-bearing for AC 1.** Omit `pnpm-workspace.yaml` and every `pnpm` script
   in the new repo fails with `ERR_PNPM_IGNORED_BUILDS` before running anything (§2, verified).
   The `package.json` `pnpm` field does **not** work as a substitute on pnpm 11. Slice 2's DoD
   catches this by asserting the symptom that error destroys.
2. **TS18003 makes "typecheck the empty skeleton" a trap.** A tooling slice with no source file
   cannot pass its own typecheck (`exit=2`, verified). This is why Slice 2 is one slice and not
   two, and it will recur for anyone who later splits it.
3. **`.prettierignore` is load-bearing for Slice 2's `pnpm check`.** `pnpm install` writes
   `pnpm-lock.yaml` at root, and `prettier --check .` fails on it (exit 1, verified) unless that
   one line is present. The file exists for nothing else here — Prettier ignores `node_modules`
   by default. Slice 1's DoD greps for the line before anything can install.
4. **TS2835 will bite the next person.** Under `nodenext`, `import { run } from "./cli"` runs fine
   under tsx while failing typecheck — a green run and a red `pnpm check`. Stating it is required
   content in the new CLAUDE.md, and the DoD greps for it.
5. **`@talentscout/db` is unreachable from the CLI.** The accepted cost of YELLOW-1. If a Week 2
   command needs the hiring pipeline, the outs are publish, `pnpm link`, or copy the handful of
   types. Do not pre-solve it.
6. **Two lockfiles, two toolchains, one human.** ESLint 9 and TS 5.9 are pinned in both today
   (YELLOW-13), but nothing enforces that they stay aligned. Long-run drift is fine and expected;
   a surprise mid-Day-4 is not.
7. **The invalid token in the shell environment will keep breaking `gh` for later tickets** until
   it is cleared at its source. Not this ticket's to fix, and not something an agent should
   silently edit in a user's shell profile.
8. **CLAUDE.md drift is the real risk to AC 2**, not its first draft. The moment someone copies a
   rule across from the monorepo without re-deriving it, AC 2 quietly stops holding. Slice 3's
   negative grep is cheap enough to keep re-running, and now targets rules rather than technology
   names, so it stays meaningful as the document grows.
9. **AI-39 and AI-48 both depend on this landing.** Keep the scaffold boring: every extra opinion
   added here is one AI-48 has to work around or undo.
