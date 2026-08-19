# AI-41 — the executed plan

What was actually planned, decided and carried out. The full hardened spec — verified facts,
land-mine probes, the road not taken — is committed at
[`docs/specs/ai-41-talentscout-cli-scaffold.md`](../../specs/ai-41-talentscout-cli-scaffold.md).

**Ticket:** AI-41 · Chore · parent AI-9 · milestone "Week 1 — Use AI: Workflow" · blocks AI-39, AI-48
**Outcome:** shipped; RED-1 resolved — no remote for now, by decision.

---

## The change in one paragraph

The Week 2 CLI chatbot needed somewhere to live. It got its own repository — `../talentscout-cli`,
a sibling of this checkout, not an `apps/cli` workspace inside it — holding a TypeScript skeleton
that runs under `tsx`, parses `--help` with zero dependencies, exits non-zero on an unknown flag,
and passes its own `pnpm check`. This repository gained one README section recording _why_ that
split exists, because the README previously argued the other way.

---

## Slices, as executed

The plan was sliced into ten, hardened down to eight, and all eight ran except the one gated on a
human decision.

| #   | Slice                                          | Outcome                                                                                       |
| --- | ---------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 1   | Repo skeleton, git, pnpm settings              | ✅ `git init -b main`, `package.json`, `pnpm-workspace.yaml`, `.gitignore`, `.prettierignore` |
| 2   | Toolchain + the CLI + its test                 | ✅ merged during hardening (see below); `pnpm check` exits 0, both gates proven live          |
| 3   | `talentscout-cli/CLAUDE.md` and README         | ✅ AC 2 verified in both directions                                                           |
| 4   | This repository's README records the decision  | ✅ commit `9f696d2`, an edit rather than an append                                            |
| 5   | First commit in `talentscout-cli`              | ✅ commit `383e063`, 13 tracked files, lockfile included                                      |
| 6   | GitHub remote                                  | ⛔ **blocked on RED-1** — not done, deliberately                                              |
| 7   | Clean-clone verification (the real AC 1 proof) | ✅ clone → install → `--help` exit 0 → `--bogus` exit 1 → `pnpm check` exit 0                 |
| 8   | cmux workspace                                 | ✅ `workspace:8 talentscout-cli`; `~/.config/cmux/cmux.json` SHA-256 unchanged                |

**Why slices 2 and 3 merged.** The original plan asserted `pnpm typecheck` exits 0 against an empty
`src/`. It does not — `tsc` fails `TS18003: No inputs were found`, exit 2. Config and first source
had to land together. A throwaway placeholder file was explicitly rejected as the fix.

---

## Acceptance criteria → evidence

| AC                                            | Evidence                                                                                                                                                                                                                           |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — clone, install, `--help` prints usage     | Verified from a **genuine clean clone**, not the working tree: `pnpm install` exit 0, `pnpm --silent cli --help` prints usage exit 0, `--frozen-lockfile` clean                                                                    |
| 2 — its own CLAUDE.md, not a copy             | Negative grep for web-app _rules_ (`"use client"`, `Server Components by default`, `@/components`, `cn()`) = 0; a further 19-pattern sweep clean; four positive greps (`TS2835`, `run(argv)`, `main.ts`, `pnpm check`) all present |
| 3 — typecheck and lint pass                   | `pnpm check` exit 0, and both gates proven **live**: `const x: number = "s"` → exit 2; unused variable → exit 1                                                                                                                    |
| 4 — unknown flag prints usage, exits non-zero | exit 1, usage on stderr, **empty stdout**, flag named, zero stack frames — plus 8 further argv shapes probed (`foo`, `--help=yes`, `-x`, `--nope=1`, `--`, `-h extra`, `--help --bogus`, `-hx`)                                    |

---

## Decisions log (🟡 — resolved without escalating)

1. **Separate repo, not `apps/cli`.** The ticket says so three ways, and AC 2 is unsatisfiable under
   an inherited root CLAUDE.md. _Cost accepted:_ `@talentscout/db` is unreachable from the CLI. Three
   known outs (publish, `pnpm link`, copy the types); none is a one-way door today.
2. **Location `../talentscout-cli`**, sibling of this checkout. Rejected nesting it inside the
   monorepo — a git repo inside a git repo.
3. **Name `talentscout-cli`, unscoped, private.** Not `@talentscout/cli`: that scope means
   "workspace of the monorepo" here, implying a `workspace:*` link that cannot exist.
4. **Runner: `tsx` as a devDependency, not `bun`.** All three candidates (tsx, bun, node 22's native
   type stripping) were verified to run the file — this was never a capability choice. `tsx` wins on
   AC 1 specifically: `pnpm install` is what installs it, so the criterion is self-contained on any
   machine with node. bun would make AC 1 depend on a global runtime pnpm cannot provide.
5. **Argument parsing: `node:util`'s `parseArgs`, zero dependencies.** Strict mode rejects unknown
   flags, which _is_ AC 4. `commander`/`citty`/`yargs` each earn their place the moment AI-48 adds
   subcommands with typed options; none earns it for one boolean flag.
6. **Lint stands alone** on `typescript-eslint@8` + `eslint-config-prettier@10`. Reproducing
   `@talentscout/eslint-config` would mean depending on `eslint-config-next` and its **nine**
   transitive plugins — React and JSX-a11y included — in a repo with no React.
7. **TypeScript stands alone, `moduleResolution: "nodenext"`, no `@/` alias.** `nodenext` is honest
   for a program node executes. Cost: relative imports must carry `.js`. No alias because `src/` is
   flat — add one with the first subdirectory.
8. **Vitest 4, node environment, no config file.** Node is already the default; a config here would
   be ceremony.
9. **One test file, four cases.** "Beyond a smoke test" is out of scope, but a single `--help`
   assertion would still pass with half the feature deleted.
10. **Prettier matches the monorepo's formatting values, not its plugins.** Same `semi`,
    `singleQuote`, `printWidth: 100` so Day 4 is not also a whitespace fight; no Tailwind plugin, and
    a three-group import order instead of seven.
11. **The spec is committed** to `docs/specs/`, following the existing convention.
12. **No `bin` field, no shebang, no build step.** A `bin` pointing at a `.ts` file without a build
    is broken on install. `pnpm cli` is the documented run command.
13. **ESLint 9 and TypeScript 5.9 pinned**, not the published 10 and 7 — Day 4 should be convention
    shock, not version shock.
14. **The cmux slice produces no repository artifact.** Established, not assumed: a cmux workspace is
    runtime session state, and `~/.config/cmux/cmux.json` holds settings with no workspace registry.
    AI-39 owns pane layout; AI-41 touches neither.
15. **Unknown flag → stderr, empty stdout.** AC 4 says only "prints usage and exits non-zero";
    routing to stderr is a reading of it, logged so review could challenge it.
16. **No arguments → stdout, exit 0.** Defensible only while there are no subcommands. **AI-48
    should revisit this** the moment one exists.

---

## The escalation, and how it was resolved

**🔴 RED-1 — should `talentscout-cli` get a GitHub remote?**

Recommended: private `arthurterozendi-plank/talentscout-cli`. Alternative: a `joinplank` org, if the
coursework is meant to be company-visible. **Resolved 2026-08-19: neither — local only, no remote.** Deferred by decision rather than by
silence; the remote was not rejected, only taken separately.

No acceptance criterion needs one; AC 1 says "given a clone of the new repo", and cloning from the
local path is a real clone. Slice 6 is the only slice this gates, and adding the remote later costs
nothing. It was escalated rather than defaulted silently because creating a repository picks an
owner, a name and a visibility that are awkward to unwind once anything is pushed.

---

## How this was hardened and reviewed

**Spec hardening — 3 rounds, converged `APPROVED`.** Round 1 found a **blocker**: Slice 5's own
required content guaranteed its AC-2 grep could never return 0, so the only mechanical check behind
AC 2 was unsatisfiable. Round 2 found the committed tree would omit `pnpm-lock.yaml` and
`.prettierignore` would miss its one load-bearing entry. Round 3 approved. Net effect was a _scope
reduction_: 10 slices → 8, ten mandated CLAUDE.md sections → five content requirements, and three
unsatisfiable DoD assertions replaced with ones that discriminate.

**Code review — 2 rounds, both repos, converged `APPROVED`.** The CLI reviewer ran eleven refutation
attempts; all held, including deleting `pnpm-workspace.yaml` and `.prettierignore` to prove each
load-bearing, and three mutations of `cli.ts` to prove the test non-vacuous. The monorepo reviewer
caught the README edit shipping as a pure append (30 added, 0 removed) and a spec header still
claiming the work was unstarted.

**One finding was promoted to blocking during review.** The committed spec recorded local
credential forensics for a named developer. This repository is **public**, which by the reviewer's
own rule made that a blocker rather than a nit; it was scrubbed before anything was pushed, and the
underlying machine-hygiene issue was reported to the user out of band instead.

**Known non-blocking findings, carried forward for AI-48:**

- `src/main.ts` has no test. Mutating it to always write stdout and exit 0 leaves `pnpm check` green
  while breaking AC 4 — the seam is guarded on one side only. A subprocess smoke test would close it;
  the spec rejected one on speed grounds, which is defensible but leaves this gap.
- `main.ts`'s bare `catch` discards the error object entirely. Unreachable today, but it is the catch
  that will fire for AI-48's network and SDK errors, and it currently leaves no diagnostic anywhere.
- `eslint.config.mjs`'s `globalIgnores(["node_modules/**", "coverage/**"])` is inert; two
  `prettier.config.mjs` import-order keys are unearned; `*.tsbuildinfo` in `.gitignore` is never
  produced. All verified inert, all cosmetic.
- The usage string reads `Usage: talentscout-cli`, but there is no `bin` field, so that command does
  not exist — `pnpm cli` is the real invocation.
- The seam is documented but unenforced; a `no-restricted-globals` rule would make it mechanical.

**Not run:** the advisory concept-check pass — its checker CLI (`codex`) is not installed. Both
reviews and all three hardening rounds ran same-model for the same reason, which weakens their
independence.
