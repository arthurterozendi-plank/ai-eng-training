# AI-27 — Set up PostHog event capture for engineers instrumenting TalentScout

**Linear:** AI-27 · Type: Chore · Blocks: AI-44 (PostHog MCP), AI-45 (funnel events), AI-46
**Depends on:** nothing
**Branch:** `arthurterozendi/ai-27-set-up-posthog-event-capture-for-engineers-instrumenting`
(worktree `ai-eng-training-ai-27`, based on `origin/main` at `e46eee5`)
**Status:** revised after harden rounds 1 and 2; every finding's disposition is in §6.

---

## 1. Problem statement

**User story:** As an engineer on the training, I want a PostHog project wired into the app and a
read-scoped API key on hand so that Day 5 can instrument the funnel and then query it back through
MCP.

Day 5's exercise is instrument-then-verify: add events, then have Claude Code check via the PostHog
MCP which ones actually fired. Both halves need a live project and a key that can read it. Nothing
PostHog-related existed in the repository before this ticket — no dependency, no env key, no MCP
server.

This ticket lays the pipe. It does not put anything through it.

**In scope**

- `posthog-js` as a dependency of `apps/web`, and the `pnpm-workspace.yaml` change its transitive
  `core-js` forces.
- `apps/web/src/lib/analytics.ts` — the analytics module and its test.
- `apps/web/src/instrumentation-client.ts` — the Next 16 client-instrumentation entry point.
- `NEXT_PUBLIC_POSTHOG_KEY` and `NEXT_PUBLIC_POSTHOG_HOST` in `apps/web/src/env.ts` and the root
  `.env.example`.
- A README entry recording the decision (required by `CLAUDE.md`), including where the personal API
  key lives.

**Out of scope**

- **AI-45** — the funnel events themselves. Nothing here calls `posthog.capture`.
- **AI-44** — the PostHog MCP server, its `.mcp.json` registration, and its `.env.example` entry for
  `POSTHOG_PERSONAL_API_KEY` (§3.5, 🟡 #13).
- **AI-46** and dashboards of any kind.
- Feature flags, surveys, session replay, error tracking, a reverse-proxy ingestion route.
- `posthog-js/react` and `usePostHog` — no component needs the client yet.
- **The pre-existing test breakage on the base commit** (§2, §7.1). Recorded, not fixed —
  ownership settled: it gets its own ticket.

### The hard constraint this plan is built around

**There is no PostHog project yet.** The user will create it after this merges. Therefore no slice
below may require a live key, a live account, or a network call to PostHog to pass. Every slice is
verifiable offline with `NEXT_PUBLIC_POSTHOG_KEY` **unset**.

Two acceptance criteria cannot be met that way and are **human-gated**, not dropped — §5 is the
checklist that closes them.

### Three repository checks are already red before AI-27 touches anything

Neither is AI-27's, and neither may be quietly inherited into a definition of done.

**`pnpm check`** fails on `origin/main` at `e46eee5`: 48 tests across three files, because **Node
v26.2.0 ships an experimental global `localStorage` that is `undefined`** unless `--localstorage-file`
is passed, and Vitest 4's jsdom environment lets it shadow jsdom's working one (§2, §7.1).

Every slice's DoD therefore reads: **the suite ends with exactly the pre-existing failure set — 48
tests in `src/lib/theme.test.ts`, `src/components/theme-toggle/theme-toggle.test.tsx` and
`src/components/settings-form/settings-form.test.tsx` — and nothing else.** Count and file list are
both pinned, so a new failure cannot hide inside the old ones. None of AI-27's own tests touch
`localStorage`, so all of them must pass outright.

**`check-env.sh`** also already fails, for an unrelated reason: there is no `.env.local` in this
worktree at all, so `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `DIRECT_DATABASE_URL` are all unset
(§2). AI-27 adds two more names to that FAIL list. §5 step 11 is worded against the two names AI-27
owns rather than against a `PASS` that will not arrive.

**`next build`** fails too, and for the same missing `.env.local`: `packages/db/src/client.ts`
reads `env.DATABASE_URL` at module scope, so evaluating any route that imports the database client
throws during Next's page-data collection (§2). Slice 3 DoD 3 therefore asserts the build _artifact_
it needs rather than the build's exit code — the compile phase that emits those artifacts completes
before the phase that fails.

All three clear the moment a populated `.env.local` exists, except the Node 26 one, which needs a
toolchain decision. **None of the three is AI-27's to fix**; each is reported as its own ticket.

If either base failure is fixed before this lands, the corresponding clause collapses back to plain
"green".

### Acceptance criteria (verbatim from the ticket)

1. Given the app running on localhost, when any page loads, then a pageview appears in the PostHog
   UI within a minute
2. Both the public key and the host are read through `@/env`, never from `process.env` directly
3. A read-scoped personal API key is stored and proven to work against the events endpoint
4. Edge cases / error states handled: analytics failing to load never breaks a page render

### How each AC is verified

| AC  | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Human-gated (§5 steps 4–6).** No offline proxy proves an event reached PostHog's UI. Step 6 proves the `history_change` half with a `history.pushState` call from the devtools console rather than by navigating, because the app has no client-side navigation surface yet and a typed URL is a full load whose `$pageview` is indistinguishable from step 5's. Automated evidence, slices 2–3: `capture_pageview: "history_change"` asserted in the options test; `startAnalytics` proven to call `init` with the key; `posthog` present in the built client chunks, which proves Next actually loaded `src/instrumentation-client.ts`. |
| 2   | `env.test.ts` covers both keys, including the empty-string and malformed-URL edges. A source scan asserts `apps/web/src/env.ts` is the **only** file under `apps/web/src` containing `process.env`.                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 3   | **Human-gated (§5 steps 7–10).** Both facts it rests on — the `query:read` scope and the **private** API host, which is not the ingestion host — are verified in §2 rather than assumed.                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 4   | Three failure modes asserted by the `reason` they resolve to, each demonstrated to fail with its guard removed: `loadEnv()` rejects, `loadClient()` rejects, `init()` throws. Plus source scans asserting neither `@/env` nor `posthog-js` is imported at value level in `analytics.ts` or `instrumentation-client.ts`.                                                                                                                                                                                                                                                                                                                     |

---

## 2. Verified facts this plan rests on

Checked against the worktree, the **installed** `posthog-js`, the installed `next`, and PostHog's own
documentation on 2026-08-24 — not recalled. Facts marked **(run)** were executed. `posthog-js` is
installed in this worktree, so every SDK fact below is reproducible from the tree.

**Why the base commit is red**

- **(run) `pnpm check` fails on `e46eee5` with no AI-27 change applied.** 48 tests in
  `src/lib/theme.test.ts`, `src/components/theme-toggle/theme-toggle.test.tsx` and
  `src/components/settings-form/settings-form.test.tsx` fail with
  `TypeError: Cannot read properties of undefined (reading 'clear')` — `window.localStorage` is
  undefined. Confirmed by stashing every AI-27 change, running `pnpm install --frozen-lockfile`
  (exit 0) and re-running the suite.
- **(run) The cause is Node, not jsdom.** This machine runs **Node v26.2.0**, which ships an
  experimental global `localStorage`: `node -e "console.log(typeof localStorage)"` prints
  `undefined` alongside
  `ExperimentalWarning: localStorage is not available because --localstorage-file was not provided`.
  Vitest 4's jsdom environment lets that `undefined` global shadow jsdom's working one.
- **(run) jsdom 30.0.1 is fine.** `new JSDOM("", { url: "http://localhost:3000" }).window.localStorage`
  is a real `object`. This is why adding
  `environmentOptions: { jsdom: { url: "http://localhost:3000" } }` changed nothing when measured —
  the URL was never the problem.
- The remedy is a toolchain decision with repo-wide reach (pin Node via `engines`/`.nvmrc` versus
  restore the storage binding in `vitest.setup.ts`) and it needs its own README decision entry.
  **It is not AI-27's** — §7.1.
- **(run) `check-env.sh` also already fails on the base:**
  `FAIL: unset or empty: NEXT_PUBLIC_APP_URL DATABASE_URL DIRECT_DATABASE_URL`, exit `1`. There is
  no `.env.local` in this worktree (`ls .env.local` → no such file).

**Next 16.3.1**

- `apps/web/node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/instrumentation-client.md`
  documents `instrumentation-client.js|ts` at the root of the app **or inside `src/`**. It runs after
  the HTML loads, **before React hydration**, and its own worked example is titled "Analytics
  tracking". Introduced in v15.3.
- **`next/dist/esm/client/app-next-turbopack.js` requires the instrumentation module at module scope
  with no `try`, before `appBootstrap`:**
  `const instrumentationModules = require('../lib/require-instrumentation-client')`. Same in
  `app-next.js`. **Anything that throws while that module graph is evaluated prevents the entire app
  from hydrating.** This drives §3.3.
- By contrast `next/dist/client/components/router-transition.js` wraps every
  `onRouterTransitionStart` call in `try`/`catch`. Router hooks are isolated; top-level module code
  is not.
- **Next defines only member expressions of `process.env`, never the bare object.**
  `next/dist/build/define-env.js` lines 74–93 define `'process.env.NODE_ENV'`,
  `'process.env.TURBOPACK'` and so on; there is no `'process.env'` entry. The client alias is
  `process: require.resolve('./polyfills/process')` (`webpack-config.js:609`), falling through to
  `next/dist/compiled/process`, whose browser shim sets **`.env={}`**.
  **Consequence:** `env.ts`'s `parse(nodeEnvSchema, process.env, "server")` passes the whole object,
  so on the client it parses `{}` and `NODE_ENV` resolves to its `.default("development")` regardless
  of the real build mode. `env.NODE_ENV` is not trustworthy in the browser.
- **(run) `dotenv -e ../../.env.local -- …` tolerates the file being absent**, which is what lets
  `pnpm --filter @talentscout/web build` run at all in this worktree.

**posthog-js**

- **(run) `pnpm --filter @talentscout/web add posthog-js` resolves and installs `1.418.10`**, writing
  the range `^1.418.10`. The registry's `latest` is `1.418.12`; `1.418.11` and `1.418.12` were both
  published today and pnpm 11's minimum-release-age gate skips them. Take whatever `pnpm add`
  resolves; do not pin by hand.
- **(run) `pnpm add` writes the placeholder line `core-js: set this to true or false` into
  `pnpm-workspace.yaml`'s `allowBuilds`, and `pnpm install` still exits `1`
  (`[ERR_PNPM_IGNORED_BUILDS] Ignored build scripts: core-js@3.50.0`) until it is a boolean. Setting
  `core-js: false` makes `pnpm install` exit `0`.** `core-js` is transitive via `posthog-js`; its
  postinstall is `node -e "try{require('./postinstall')}catch(e){}"`, a funding banner.
- **(run) The lockfile diff is additions only** — 90 insertions, 0 deletions.
- **(run) `dist/module.js` is 256 KB raw, ~83 KB gzipped.** The first heavy client dependency here.
- `posthog-js` exports `posthog` as both the default and a named export, plus the types
  `PostHogConfig` and `ConfigDefaults`. No `peerDependencies`, no install lifecycle scripts.
- **`api_host` defaults to `https://us.i.posthog.com`**; `person_profiles` defaults to
  `'identified_only'`; `disable_session_recording` and `disable_external_dependency_loading` both
  default to `false`.
- **`capture_pageview` is `boolean | 'history_change'`**, and the compiled default is
  `capture_pageview: !t || "2025-05-24" > t || "history_change"` where `t` is `defaults`. The legacy
  default is `true` (capture on init only); `'history_change'` requires `defaults` at `'2025-05-24'`
  or later. `ConfigDefaults` in the installed typings tops out at `'2026-08-29'`.
- **(run) `capture_pageview: "history_change"` and `disable_external_dependency_loading: true` are
  compatible.** Measured on `apps/web/node_modules/posthog-js/dist/module.js`:
  `historyAutocapture` is an **inline class literal in the core bundle** carrying the whole
  implementation (`monitorHistoryChanges(){…this.bh("pushState"),this.bh("replaceState"),this._h()}`);
  it is instantiated **synchronously** from a statically bundled map
  (`u=_({},$l.__defaultExtensionClasses,…)` then `new u.historyAutocapture(this)`), with no
  `__PosthogExtensions__` lookup and no network; and
  `disable_external_dependency_loading` occurs **exactly twice** — once as its own default, once
  inside `Mi`, the `[ExternalScriptsLoader]` `document.createElement("script")` helper, its only
  consumer. It gates session replay, surveys, site apps and the toolbar, and nothing else.

- **(run) `defaults: "2026-08-29"` silently switches on `internal_or_test_user_hostname`, and it
  creates a person profile on localhost.** The defaults resolver reads
  `internal_or_test_user_hostname: t && t >= "2026-01-30" ? /^(localhost|127\.0\.0\.1)$/ : void 0`;
  at init, `Do()` runs
  `if (this.config.internal_or_test_user_hostname && location.hostname) { … e.test(t) && this.setInternalOrTestUser() }`;
  and `setInternalOrTestUser(){ this.Yo("posthog.setInternalOrTestUser") && this.setPersonProperties({$internal_or_test_user:!0}) }`.
  `Yo()` refuses **only** when `person_profiles === "never"` — under `identified_only` it sets the
  process-person flag and returns true. So every localhost load would create a person profile
  carrying `$internal_or_test_user`, and all Day-5 traffic would land under the marker PostHog's
  "filter internal and test users" toggle keys off.
- **(run) Passing `internal_or_test_user_hostname: undefined` would be a no-op — the SDK's config
  merge drops undefined values.** `_init` builds the config as `h = es({}, l, u, {name, token})`
  where `l` is the resolved defaults and `u` the user config, and
  `es = (t, ...i) => { for (var s of i) for (var n in s) void 0 !== s[n] && (t[n] = s[n]); return t }`.
  The `void 0 !== s[n]` test means an explicit `undefined` never overwrites the default. **`null` is
  the value that works**, and it is the SDK's own documented idiom: the typing is
  `internal_or_test_user_hostname?: string | RegExp | null` with the comment "Set to `null` to
  explicitly disable (useful when using `defaults: '2026-01-30'`)". `null` survives `es`, and `Do()`'s
  `if (this.config.internal_or_test_user_hostname && …)` is falsy, so `setInternalOrTestUser` is never
  reached — no profile and no `person_profiles: "never"` console error.
- **(run) Matcher behaviour, measured under `vitest@4.1.10`:** `toEqual` treats `{ a: 1, b: undefined }`
  and `{ a: 1 }` as **equal**; `toStrictEqual` does not. Both distinguish `{ a: 1, b: null }` from
  `{ a: 1 }`. Slice 2 DoD 3 therefore specifies `toStrictEqual`.
- **Benign-defaults audit at `defaults: "2026-08-29"`**, recorded so a future SDK bump has a baseline
  to diff against. Dead for this configuration: `session_recording` (replay disabled),
  `external_scripts_inject_target: "head"` (external loading disabled). Live but harmless:
  `persistence_save_debounce_ms: 250`, `split_storage: true`, `detect_google_search_app: true`,
  `disable_capture_url_hashes: true`, `cookieWinsOnConflict: true`. **`capture_pageleave` defaults to
  `"if_capture_pageview"`, and `Vo()` returns true when `capture_pageview` is `"history_change"` — so
  `$pageleave` ships too**, carrying the same URL data as `$pageview` (🟡 #26 covers that data).

**PostHog API**

- **`GET /api/projects/:project_id/events/` names `query:read` under "Required API key scopes"** —
  checked twice, independently. Not `event:read`.
- **The ingestion host and the API host are different hosts.** PostHog's API reference: on US Cloud
  `https://us.i.posthog.com` serves **public** endpoints and `https://us.posthog.com` serves
  **private** ones; on EU Cloud, `https://eu.i.posthog.com` and `https://eu.posthog.com`. Public
  endpoints are the POST-only ingestion and flag routes authenticated by the project token; private
  endpoints are the `GET`/`POST`/`PATCH`/`DELETE` REST API authenticated by a personal API key.
  **`GET /api/projects/:id/events/` is private, so it lives on `us.posthog.com` / `eu.posthog.com` —
  not on the value of `NEXT_PUBLIC_POSTHOG_HOST`.** Deriving one host from the other by dropping the
  `.i` is a trap; §5 step 9 hard-codes the private host instead.
- **Personal API key scopes can be edited after the key is created**, and keys can be restricted to a
  single project. Authentication is `Authorization: Bearer <key>`.
- The scope set the official PostHog MCP needs is **not** documented anywhere reachable from here. It
  is AI-44's to determine — and because scopes are editable, minting once now with `query:read` costs
  nothing if AI-44 later needs to widen it.

**Why `next build` is red on the base commit**

- **(run) `pnpm --filter @talentscout/web build` fails during "Collecting page data"** with
  `EnvValidationError: Invalid server environment variables: - DATABASE_URL: Invalid input: expected string, received undefined`.
  Reproduced on bare `origin/main` at `e46eee5` with every AI-27 change stashed — nothing here causes
  it.
- **The mechanism is `client.ts`, not `env.ts`.** The stack is exact:
  `get DATABASE_URL (packages/db/src/env.ts:58)` ← `module evaluation (packages/db/src/client.ts:45)`
  ← `module evaluation (src/app/api/jobs/route.ts:1)`. `packages/db/src/env.ts` is _lazy_ by design —
  each key sits behind its own getter — but `client.ts:45` calls that getter at module scope
  (`export const db = drizzle((globalForDb.talentscoutSql ??= postgres(env.DATABASE_URL)), …)`), so
  any route importing the client evaluates it eagerly.
- **Which route fails is nondeterministic** — `/api/jobs` or `/api/candidates/[id]`, depending on
  which of the 9 page-data workers reaches its route first.
- **(run) The chunk proof survives, because Turbopack emits it first.** The build prints
  `✓ Compiled successfully in 2.6s` before `Collecting page data using 9 workers …`, and
  `apps/web/.next/static/chunks` is fully populated when the later phase throws.
- **(run) Syntactically valid connection strings clear it, with no live database.** Re-running the
  build with `DATABASE_URL` and `DIRECT_DATABASE_URL` set to
  `postgresql://postgres:postgres@127.0.0.1:54322/postgres` completes every phase and prints the
  route table. `postgres.js` does not connect until a query, so page-data collection never needs a
  reachable server — only strings that satisfy the `z.url({ protocol: /^postgres(ql)?$/ })` schema.
- **(run) The chunk grep is falsifiable.** With `src/instrumentation-client.ts` present,
  `grep -rl posthog apps/web/.next/static/chunks` returns **2** files; with that one file deleted and
  the build rerun, it returns **0**.

**This repository**

- `apps/web/src/env.ts` parses `clientSchema` **eagerly at module load** and throws
  `EnvValidationError` on failure; `NODE_ENV` alone is lazy behind a getter.
- **`@/env` was not in the client bundle before this ticket.** Its only non-test importer is
  `src/app/api/status/route.ts`, a server route.
- **(run) zod 4.4.3:** `z.string().trim().min(1).optional()` accepts `undefined` and **rejects `""`**;
  `z.url().default(...)` applies the default for `undefined` and **rejects `""`**. Both new keys
  therefore need `"" → undefined` normalisation where `clientRuntime` reads them, or a bare `KEY=`
  line in someone's `.env.local` takes the whole app down.
- `.claude/skills/pre-deploy/scripts/check-env.sh` **fails** (line 61, `status=1`) when a key declared
  in `.env.example` resolves to nothing, and **warns** when a key validated by an `src/env.ts` is
  absent from `.env.example`. It finds validated keys with
  `^\s*(NEXT_PUBLIC_[A-Z0-9_]+|[A-Z][A-Z0-9_]+):\s*z\.`, so each key's schema must be inline.
- `check-console.sh` fails on `console.log`/`console.debug` under `apps/*/src`. **`console.warn` and
  `console.error` are deliberately allowed.**
- `apps/web/vitest.config.mts` collects `src/**/*.{test,spec}.{ts,tsx}` in jsdom, so
  `src/instrumentation-client.test.ts` and `src/lib/analytics.test.ts` are both picked up.
  `apps/web/tsconfig.json` includes `**/*.ts`, so `src/instrumentation-client.ts` is typechecked.
- `apps/web/package.json` pins `next` and `react` exactly and carets everything else.
- `.gitignore` ignores `.env*` and un-ignores `!.env.example`.
- **A sibling worktree is already open on `feat/ai-45-funnel-analytics` at the same base commit**
  (`git worktree list`). AI-45 is blocked by this ticket and is nonetheless in flight. See §7.

---

## 3. Design

### 3.1 The env contract

Added to `clientSchema` in `apps/web/src/env.ts`, each written inline so `check-env.sh` sees it:

| Key                        | Schema                                        | Required?                                | Default                    |
| -------------------------- | --------------------------------------------- | ---------------------------------------- | -------------------------- |
| `NEXT_PUBLIC_POSTHOG_KEY`  | `z.string().trim().min(1).optional()`         | **Optional** — analytics off when absent | none (`undefined`)         |
| `NEXT_PUBLIC_POSTHOG_HOST` | `z.url().default("https://us.i.posthog.com")` | Optional                                 | `https://us.i.posthog.com` |

`clientRuntime` must read both through literal `process.env.NEXT_PUBLIC_*` member access, because
Next only inlines the statically analysable form — and must **normalise empty string to absent**,
because zod rejects `""` for both schemas (§2).

**`NEXT_PUBLIC_POSTHOG_HOST` is the ingestion host only.** It is what the browser SDK posts events
to. The REST API the human calls in §5 lives on a different host (§2), and nothing in the app should
derive one from the other.

**Optional, not required.** A required key would break `pnpm dev` for anyone without a PostHog
project — including the user today — and would make every slice unverifiable. The documented unset
behaviour is: analytics is inert, and nothing else changes.

**The host is validated as a URL and defaults to the US region.** A default keeps the common case
zero-config; naming the key lets the EU region be selected without a code change. A malformed host
throws at env-parse time rather than silently shipping events to the wrong continent — contained by
§3.3 so it cannot take the page down.

**`NEXT_PUBLIC_POSTHOG_KEY` is not a secret.** PostHog project API keys (`phc_…`) are write-only
ingestion tokens designed to sit in the browser bundle. `.env.example` says so, so nobody later
"fixes" it into a server-side proxy.

`POSTHOG_PERSONAL_API_KEY` is deliberately **not** added to `.env.example` — see §3.5.

### 3.2 Where the client initialises: `src/instrumentation-client.ts`

Next 16 ships a first-class convention for exactly this, and its own documentation uses analytics as
the worked example. The file's whole job is to call `startAnalytics()` and ignore the promise.

**Rejected: a `"use client"` `PostHogProvider` wrapping `{children}` in `layout.tsx`.** It would push
a client boundary to the root of the tree, contradicting `CLAUDE.md`'s "push the boundary down to the
smallest leaf", and — decisively — it would put analytics _on the render path_, which is the one
thing AC 4 forbids. With `instrumentation-client.ts` there is no analytics code in the React tree at
all, so there is no render for analytics to break.

**Rejected: `posthog-js/react`.** Nothing calls `usePostHog` yet.

### 3.3 Fail-open, concretely (AC 4)

Four mechanisms, in order of how much they remove rather than catch.

**1. Analytics is never in the React tree.** §3.2. A render cannot fail on code it never runs.

**2. The SDK never injects a script.** `disable_external_dependency_loading: true` stops PostHog
requesting the external bundles for session replay, surveys, site apps and the toolbar. A blocked or
slow third-party script is the classic "analytics broke the page" failure, and this deletes the
category rather than catching it. Verified in §2 to have no effect on pageview capture.

**3. Both module evaluations happen inside the `try`.** The load-bearing one. Next requires the
instrumentation module unguarded, at module scope, before `appBootstrap` (§2) — so a `try` inside our
own module **cannot** catch a throw from a static `import`, and a throw there costs the whole app its
hydration. `@/env` can throw (it parses eagerly) and `posthog-js` is 83 KB of chunk that can fail to
load. Both are therefore reached through dynamic `import()` **inside** the `try`, behind an injectable
`deps` object so tests can drive each failure. `@/env` is still the only source of the key and the
host, so AC 2 holds.

The contract the DoDs assert:

- `startAnalytics(deps?)` resolves — never rejects — with `{ enabled: true }` |
  `{ enabled: false; reason: "missing-key" }` | `{ enabled: false; reason: "init-failed" }`.
- `deps` supplies `loadEnv()` and `loadClient()`; production defaults dynamically import `@/env` and
  `posthog-js` respectively.
- **`loadEnv()` runs first and the missing-key branch returns before `loadClient()` is reached.** The
  order is part of the contract, not an implementation detail: absent is the key's state for every
  developer, every CI run, and the user until §5 step 3, and the `missing-key` answer needs nothing
  from the SDK. Ordering it this way makes the 83 KB chunk (§7.9) conditional on analytics actually
  being configured instead of unconditional.
- `posthog-js` may appear in `analytics.ts` **only** as `import type`.

The cost is that init runs a tick after hydration begins rather than before it. Next's own
documentation blesses fire-and-forget async here for everything except polyfills, and PostHog
captures its first `$pageview` from `location` whenever `init` runs, so AC 1's "within a minute" is
untouched. The side benefit is that 83 KB gzipped stays out of the main client chunk.

**4. Every failure resolves, and says why — out loud.** `startAnalytics` catches around the whole
body. Both the `missing-key` and `init-failed` paths emit exactly one `console.warn` carrying the
reason and, where there is one, the caught error. **The warning is not gated on `NODE_ENV`**: §2
shows `env.NODE_ENV` is untrustworthy in the browser, so a gate would ship to production visitors
anyway while making its own test unfailable. `check-console.sh` allows `console.warn` explicitly.

`on_request_error` is deliberately **not** wired: ingestion requests are the SDK's own async `fetch`,
they never reach our call stack, and a callback is one more thing that could throw.

### 3.4 Pageview capture

`posthog.init(key, analyticsOptions(host))` with exactly these seven options:

| Option                                | Value                          | Why                                                                                                                                                        |
| ------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `api_host`                            | `env.NEXT_PUBLIC_POSTHOG_HOST` | AC 2.                                                                                                                                                      |
| `defaults`                            | `"2026-08-29"`                 | The SDK's behaviour lock. Pinning it stops a future upgrade silently changing defaults under us; leaving it unset freezes us on the legacy set forever.    |
| `capture_pageview`                    | `"history_change"`             | Initial load **and** App Router client-side navigations. Stated explicitly as well as implied by `defaults` — 🟡 #5.                                       |
| `autocapture`                         | `false`                        | Day 5 asks "which of my events fired"; `$autocapture` noise works against that, and it serialises element text from screens that will show candidates.     |
| `disable_session_recording`           | `true`                         | Replay of a recruiting screen is candidate PII, and nothing before Day 9 needs it.                                                                         |
| `disable_external_dependency_loading` | `true`                         | §3.3 mechanism 2. Verified not to interfere with `history_change` (§2).                                                                                    |
| `internal_or_test_user_hostname`      | `null`                         | Cancels the localhost person profile that `defaults: "2026-08-29"` would otherwise create (§2). `null`, not `undefined` — the SDK's merge drops undefined. |

`person_profiles` is left at its `'identified_only'` default — TalentScout has no auth, so every
visitor is anonymous and no person profiles are created. **That sentence is only true because of the
seventh option.** Left to the `defaults` pin, `internal_or_test_user_hostname` would match
`localhost`, call `setInternalOrTestUser()`, and create a profile with `$internal_or_test_user` on
every developer's machine and on every Day-5 run — the only host this app runs on today (§2).

**No `onRouterTransitionStart` hook.** The SDK's `historyAutocapture` already patches
`pushState`/`replaceState` and listens for `popstate`, from the core bundle (§2) — adding the hook
would double-capture. Worse, the hook fires at the _start_ of a transition, before the URL changes,
so its `$current_url` would name the page being left.

**Analytics runs in development too.** AC 1 is stated on localhost, so the common "production only"
guard would fail the ticket outright.

### 3.5 What "the personal API key is stored" means

It is a real secret with account-wide reach, and **no code in this repository reads it yet**. So:

- **The value lives only in the gitignored root `.env.local`**, the repository's single env file for
  every workspace.
- **The provenance is committed in the README** — where to mint it, the `query:read` scope, the
  single-project restriction, that the REST API lives on the private host rather than the ingestion
  host, and that AI-44's server must read the key from `.env.local` rather than inlining it into the
  committed `.mcp.json`. §5 carries the operational steps.
- **It is not added to `.env.example`.** `check-env.sh` _fails_ on a declared key that resolves to
  nothing (§2), so declaring it would add a fifth name to an already-failing list in exchange for
  documentation the README already carries. Under the repository's own "the workspace that reads a
  key owns it" rule, AI-44 adds and validates it when its workspace exists.
- `POSTHOG_PROJECT_ID` is likewise not added — §5's `curl` inlines it.

---

## 4. Slices

Sequential: 2 needs 1's keys to typecheck, 3 needs 2's module, 4 documents 1–3.

**Every DoD below carries the base-red clause from §1:** the suite must end with exactly the 48
pre-existing failures in exactly those three files, and every AI-27 test must pass outright.

### Slice 1 — the env contract

`apps/web/src/env.ts`, `apps/web/src/env.test.ts`, root `.env.example`.

**Definition of done**

1. With neither variable set: `env.NEXT_PUBLIC_POSTHOG_KEY === undefined` and
   `env.NEXT_PUBLIC_POSTHOG_HOST === "https://us.i.posthog.com"`.
   _Fails if_ the key is made required or the host loses its default.
2. With `NEXT_PUBLIC_POSTHOG_KEY=""` and `NEXT_PUBLIC_POSTHOG_HOST=""` stubbed (`vi.stubEnv` +
   `vi.resetModules()` + `await import("@/env")`), importing `@/env` **does not throw** and the key is
   `undefined`. _Fails without_ the empty-string normalisation — measured: zod rejects `""` for both
   schemas.
3. `NEXT_PUBLIC_POSTHOG_KEY="  phc_x  "` yields `"phc_x"`. _Fails without_ `.trim()`.
4. `NEXT_PUBLIC_POSTHOG_HOST="eu.i.posthog.com"` (no scheme) makes the import throw
   `EnvValidationError`. _Fails if_ the host is typed `z.string()`.
5. A source scan (`node:fs` over `apps/web/src`, test files excluded) asserts `src/env.ts` is the only
   file containing `process.env`. AC 2's mechanical guard. _Fails_ the moment any other module reaches
   for `process.env`.
6. `.env.example` declares `NEXT_PUBLIC_POSTHOG_KEY` (commented: not a secret, ingestion-only) and
   `NEXT_PUBLIC_POSTHOG_HOST` (commented: the ingestion host, must match the project region, US and
   EU values given, and **not** the host the REST API uses), **with no values**, and declares nothing
   else.
7. `bash .claude/skills/pre-deploy/scripts/check-env.sh .` prints no
   `WARN: validated … but absent from .env.example`. _Fails if_ a key lands in the schema but not in
   `.env.example`, or if a schema is written through a shared constant the regex cannot see. (Its
   `FAIL` line is pre-existing — §1.)

### Slice 2 — `posthog-js` and the analytics module

`pnpm-workspace.yaml`, `apps/web/package.json`, `pnpm-lock.yaml`, `apps/web/src/lib/analytics.ts`,
`apps/web/src/lib/analytics.test.ts`.

Add with `pnpm add posthog-js --filter @talentscout/web` and **record whatever version pnpm
resolves** — do not hand-pin. `pnpm add` will write a `core-js: set this to true or false` placeholder
into `allowBuilds`; change it to `false`.

**Definition of done**

1. `pnpm install --frozen-lockfile` exits `0` with no `ERR_PNPM_IGNORED_BUILDS` line. _Fails_ with the
   placeholder left in place — measured: exit `1`.
2. `apps/web/package.json` lists `posthog-js` under `dependencies` with a caret range, and the
   lockfile diff is additions only.
3. `expect(analyticsOptions("https://eu.i.posthog.com")).toStrictEqual(...)` against the exact
   **seven**-property object in §3.4, including `internal_or_test_user_hostname: null`.
   **`toStrictEqual` is required, not `toEqual`** — measured under `vitest@4.1.10`, `toEqual` treats an
   explicitly-`undefined` property and an absent one as equal, and an option the assertion cannot see
   is exactly how the round-4 defect entered. _Fails if_ any option is dropped, renamed or changed.
4. Given a stub client and an env with a key, `startAnalytics` calls `init` **exactly once** with
   `(key, analyticsOptions(host))` and resolves `{ enabled: true }`.
5. Given an env with no key, **`loadClient` is never called** and `init` is never called, and it
   resolves `{ enabled: false, reason: "missing-key" }`. _Fails if_ we init with an empty token — the
   vacuous version of this feature — and _fails if_ the short-circuit is removed, because
   `loadClient` then runs and the spy sees a call.
6. Three separate cases — `loadEnv()` rejects, `loadClient()` rejects, `init()` throws — each resolve
   `{ enabled: false, reason: "init-failed" }` and never reject. **The last two must inject an env
   that carries a key**, or DoD 5's ordering short-circuits them and they pass as `missing-key`
   without ever reaching the guard they exist to test. All three remain reachable under the ordering;
   none is dead.
   **The implementer must delete the `try`/`catch`, confirm all three fail, paste the failure output
   into the PR, then restore it.**
7. **A source scan of `src/lib/analytics.ts` asserts every `posthog-js` and `@/env` import in it is
   `import type`** — no value-level static import of either. _Fails_ exactly on the conversion that
   DoD 6 cannot see, because DoD 6 injects `deps` and never exercises the real import style.
8. Both the `missing-key` and `init-failed` paths emit exactly one `console.warn` carrying the reason,
   ungated. _Fails if_ a `NODE_ENV` gate is reintroduced or the warn is dropped.

### Slice 3 — wiring `src/instrumentation-client.ts`

`apps/web/src/instrumentation-client.ts`, `apps/web/src/instrumentation-client.test.ts`.

**Definition of done**

1. `instrumentation-client.test.ts` mocks `@/lib/analytics`, imports the module, and asserts
   `startAnalytics` was called exactly once. _Fails if_ the wiring is deleted.
2. A source scan asserts `src/instrumentation-client.ts` contains no value-level import of
   `posthog-js` or `@/env` — it may only import `@/lib/analytics`. Same reasoning as slice 2 DoD 7: a
   static import here is uncatchable and costs the app its hydration.
3. **Build-artifact proof that Next loaded the file.** With `NEXT_PUBLIC_POSTHOG_KEY` unset, run
   `pnpm --filter @talentscout/web build`; once it prints `✓ Compiled successfully`,
   `grep -rl posthog apps/web/.next/static/chunks` returns at least one file. Nothing else in the app
   imports `posthog-js` — `grep -rn "posthog-js" apps/web/src` shows only `analytics.ts`'s dynamic
   `import()` and test-file string literals — so a chunk containing it can only come from
   `src/instrumentation-client.ts` having been picked up by Next's file convention. _Fails if_ the
   file is misnamed or misplaced, which is the failure mode no unit test can catch: **measured, the
   grep returns 2 files with the module present and 0 with it deleted** (§2).

   **The DoD deliberately does not require the build to exit `0`.** It cannot: `next build` is red on
   the base commit for an unrelated reason (`packages/db/src/client.ts` reads `env.DATABASE_URL` at
   module scope, and there is no `.env.local`), and it fails in the page-data phase that runs _after_
   the compile phase which emits these chunks (§2, §7.4). Asserting the exit code would import a
   third pre-existing failure into this ticket's definition of done. **No `.env.local` is needed**;
   `dotenv -e` tolerates the file being absent (§2).

### Slice 4 — README

`README.md`.

**Definition of done**

1. The **Environment variables** table's `apps/web` row lists `NEXT_PUBLIC_POSTHOG_KEY` and
   `NEXT_PUBLIC_POSTHOG_HOST`.
2. A new **Analytics** section records the _reason_, not the event: PostHog because Day 5 needs a
   funnel it can instrument and then query back through MCP; initialised from
   `src/instrumentation-client.ts` because that runs before hydration and keeps analytics out of the
   React tree entirely; autocapture, session replay and external script loading all off, because the
   corpus is candidate data and the exercise wants deliberate events rather than noise; the key
   optional, because analytics being unconfigured must never be a broken app.
3. The **MCP** section records that `POSTHOG_PERSONAL_API_KEY` lives in `.env.local` only, minted with
   `query:read` and restricted to the TalentScout project, that the REST API is on
   `us.posthog.com`/`eu.posthog.com` rather than the ingestion host, and that AI-44's server must read
   the key from `.env.local` rather than inlining it into the committed `.mcp.json`.
4. A one-line pointer to `docs/specs/ai-27-posthog-event-capture.md` §5 for the account setup.

This DoD is reviewed rather than executed, and that is stated rather than dressed up.

---

## 5. Human handoff — post-merge

**AC 1 and AC 3 are closed here, by the user, not by the implementer.** Both need a PostHog account
that does not exist yet. Run this after the PR merges. Do not paste any key into an agent session.

**Create the project**

1. Sign up or log in at <https://posthog.com> and create a project named `TalentScout`. **Note the
   region** — the US and EU clouds are separate and a key from one is rejected by the other.
2. Project settings → copy the **Project API key** (`phc_…`) and the **host** from the web snippet.
3. Add both to the gitignored root `.env.local`:

   ```
   NEXT_PUBLIC_POSTHOG_KEY=phc_...
   NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com   # or https://eu.i.posthog.com
   ```

   The host must match the region. A US host with an EU project 401s on every request and nothing on
   the page looks different. This is the **ingestion** host; step 9 uses a different one.

**Close AC 1**

4. `pnpm dev`, then load <http://localhost:3000/?__posthog_debug=true>. The browser console prints
   PostHog's debug log, including the `$pageview` capture. If it does not, check the console for the
   `[analytics]` warning and the reason it carries.
5. In PostHog, open **Activity → live events**. **AC 1 is met** when a `$pageview` for
   `http://localhost:3000/` appears within a minute. `$pageleave` events appear alongside it — that is
   expected (§2), not a misconfiguration. No person profile should be created: if you see
   `$internal_or_test_user`, the seventh `init` option (§3.4) is not reaching the SDK.
6. Prove `history_change` from the devtools console, **not by clicking a link** — the app has no
   client-side navigation surface yet (no `next/link` anywhere; the only `next/navigation` import is a
   server-side `notFound()`, and `jobs/page.tsx`'s `<a href="/jobs">` is a plain anchor that reloads
   the document). Typing a URL is a full load, which produces a fresh `init` and a fresh `$pageview`
   that is indistinguishable from step 5's — it would report success whether `history_change` works or
   not. Instead, with the page still open, run in the console:

   ```js
   history.pushState({}, "", "/jobs");
   ```

   That is precisely the method the SDK patches (§2). A second `$pageview` with
   `$current_url` ending `/jobs` should appear in live events **without the page reloading**. If none
   does, `historyAutocapture` did not start: check that `capture_pageview` really reached `init` as
   `"history_change"` — the SDK only patches history when
   `"history_change" === config.capture_pageview` (§2) — and that
   `disable_external_dependency_loading` has not started gating it in a newer SDK (§7.11).

**Close AC 3**

7. PostHog → **Settings → Personal API keys → Create**. Grant **`query:read`** — the scope PostHog's
   own API reference names as required for the events endpoint in step 9 — and restrict the key to the
   TalentScout project. The value is shown once. Scopes are editable later, so AI-44 can widen this
   key rather than minting a second one.
8. Add it to `.env.local` as `POSTHOG_PERSONAL_API_KEY=phx_...`. It is deliberately absent from
   `.env.example` (§3.5); AI-44 adds it there when a workspace reads it.
9. Prove it against the events endpoint. **The REST API is on the private host, not the ingestion
   host** — `https://us.posthog.com` (or `https://eu.posthog.com`), never
   `$NEXT_PUBLIC_POSTHOG_HOST`. Take the numeric project id from the PostHog URL (`/project/<id>/…`)
   and run, from the repository root:

   ```bash
   pnpm exec dotenv -e .env.local -- sh -c \
     'curl -s -o /dev/null -w "%{http_code}\n" \
        -H "Authorization: Bearer $POSTHOG_PERSONAL_API_KEY" \
        "https://us.posthog.com/api/projects/<project-id>/events/?limit=1"'
   ```

   `200` closes **AC 3**. `404` or a redirect means the ingestion host was used — swap in
   `us.posthog.com`/`eu.posthog.com`. `401` means the key is wrong or from the other region. `403`
   means the granted scopes do not cover this endpoint — widen the key to `query:read` and retry. Use
   `dotenv` rather than sourcing `.env.local`: the repository's own `check-env.sh` parses env files
   rather than sourcing them, for the same reason.

**Confirm nothing leaked**

10. `git status --porcelain` shows no `.env.local`, and `git grep -n "phx_"` returns nothing.

**Tidy up**

11. `bash .claude/skills/pre-deploy/scripts/check-env.sh .` no longer lists
    `NEXT_PUBLIC_POSTHOG_KEY` or `NEXT_PUBLIC_POSTHOG_HOST` in its `FAIL: unset or empty:` line.
    **It will still fail** on `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `DIRECT_DATABASE_URL` unless
    you have also populated those — that failure predates AI-27 (§1, §7.4).
12. Record the region, the project id and the date verified in §10, and tick AC 1 and AC 3 on AI-27 in
    Linear.

---

## 6. Assumptions log (🟡)

Decisions made rather than escalated. `CLAUDE.md`'s "ask rather than assume" is answered by recording
every fork here instead of blocking — `/harden` is the adversary that would otherwise have been a
human round trip. Rows amended in review say which round.

| #   | Decision                                                                                                               | Why, and what was rejected                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `posthog-js` at whatever caret range `pnpm add` resolves                                                               | **Measured, not projected:** installed in this worktree as `^1.418.10` / `1.418.10`. The file pins `next` and `react` exactly and carets everything else. Hand-pinning `1.418.12` would fail — pnpm 11's release-age gate refuses versions published today.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 2   | Init in `src/instrumentation-client.ts`, not a `"use client"` provider                                                 | Next 16 ships the convention and documents analytics as its worked example; it runs before hydration; and it keeps analytics out of the React tree entirely, so no render can fail on it. A root `PostHogProvider` would push a client boundary to the root and put analytics on the render path — the thing AC 4 forbids.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 3   | `NEXT_PUBLIC_POSTHOG_KEY` optional, empty string treated as absent                                                     | Required breaks `pnpm dev` for anyone without a project — the user today — and makes every slice unverifiable. `KEY=` is how people turn a key off, and zod rejects `""` (measured), so without normalisation that line takes the whole app down.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 4   | `NEXT_PUBLIC_POSTHOG_HOST`, `z.url()`, default `https://us.i.posthog.com`                                              | Matches the SDK's own documented `api_host` default. Zero-config for the common case, one env line for EU. A malformed value throws loudly instead of silently shipping events to the wrong continent — and §3.3 contains the throw.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 5   | `defaults: "2026-08-29"` **and** an explicit `capture_pageview: "history_change"`                                      | `defaults` is the behaviour lock; unset freezes us on the legacy defaults forever. The explicit `capture_pageview` is deliberate redundancy: it is the single property AC 1 rests on, and asserting it is a real assertion, where asserting only a date string would leave the SDK's date→behaviour mapping untested.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 6   | No `onRouterTransitionStart` hook                                                                                      | The SDK's `historyAutocapture` already patches `pushState`/`replaceState` and `popstate` **from the core bundle** (verified in the installed `dist`, not just the typings), so the hook would double-capture — and it fires before the URL changes, so its `$current_url` would name the page being left.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 7   | `autocapture: false`                                                                                                   | Day 5's exercise is "which of the events I added actually fired"; `$autocapture` noise works against it, and autocapture serialises element text from screens that will show candidate names. One line for AI-45 to reverse.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 8   | `disable_session_recording: true` and `disable_external_dependency_loading: true`                                      | **Round 1 challenged this as possibly killing `history_change`; disproved and now evidenced (§2).** The flag occurs twice in the bundle — as its own default, and inside the `[ExternalScriptsLoader]` `<script>`-injecting helper, its only consumer. Pageview capture never goes through that path.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 9   | Analytics runs in development, not production-only                                                                     | AC 1 is stated on localhost. The usual `NODE_ENV === "production"` guard would fail the ticket outright.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 10  | `@/env` and `posthog-js` both reached by dynamic `import()` inside the `try`                                           | Verified: Next requires the instrumentation module at module scope with no `try`, before `appBootstrap`, so a static import that throws costs the whole app its hydration and no `try` of ours can catch it. Dynamic imports move both evaluations inside the guard. Cost: init a tick after hydration starts, which Next's docs bless.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 11  | `startAnalytics` returns a discriminated status and takes injectable `deps`                                            | This is what makes the AC 4 tests capable of failing: each failure mode is asserted by its own `reason`. A `void`-returning `initAnalytics()` could only be tested for "did not throw", which is close to vacuous.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 12  | ~~A **dev-only** `console.warn` on the disabled and failed paths~~ → **always warn, no gate**                          | **Overturned in round 1.** `env.NODE_ENV` is untrustworthy in the browser: Next defines only member expressions of `process.env`, and `env.ts` passes the whole object, which on the client is the `next/dist/compiled/process` shim with `env={}` — so the getter returns its `"development"` default in a production build. The gate would have shipped to production anyway while its production-case test could only ever pass against an injected fake.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 13  | ~~`POSTHOG_PERSONAL_API_KEY` declared in `.env.example`~~ → **README + §5 only**                                       | **Overturned in round 1.** `check-env.sh` _fails_ on a declared key that resolves to nothing, and it contradicted this row's own rule that the workspace which reads a key owns it. Nothing reads it yet. AI-44 declares and validates it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 14  | `POSTHOG_PROJECT_ID` **not** added                                                                                     | Nothing in the repository reads it; only §5's `curl` needs it, and it inlines it.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 15  | Source scans as the mechanical guard for AC 2 and AC 4                                                                 | **Extended in round 1.** Originally one scan for `process.env`. Round 1 showed AC 4's real guard — that neither `@/env` nor `posthog-js` is statically imported at value level — had no test at all, because the `deps`-injecting tests never exercise the real import style. Two more scans, same `node:fs` machinery.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| 16  | `.env.example` states that the project API key is not a secret                                                         | It is inlined into the client bundle by design. Without the note, a future reviewer "fixes" it into a server-side proxy and breaks ingestion for no gain.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 17  | `core-js: false` in `pnpm-workspace.yaml`'s `allowBuilds`                                                              | **Measured in this worktree:** `pnpm add` writes a `core-js: set this to true or false` placeholder and `pnpm install` exits `1` until it is a boolean; `false` makes it exit `0`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 18  | `on_request_error` deliberately not wired                                                                              | Ingestion failures are the SDK's own async requests and never reach our call stack. A callback would be one more thing that can throw, on a path already fail-open by construction.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 19  | The `query:read` scope for AC 3 is a checked fact, not an assumption                                                   | **Added in round 1.** PostHog's events API reference names `query:read` under "Required API key scopes" — checked twice, independently, and moved into §2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 20  | Design prose trimmed to contracts                                                                                      | **Adopted in round 1.** Verbatim file bodies, snippets, the full type block and the default-`deps` expressions were below design altitude. What survives is what a DoD asserts: the two env schemas and defaults, the `AnalyticsStatus` reasons, and the seven `init` options.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 21  | The base commit's 48 failing tests are **recorded, not fixed**; every DoD pins the failure set                         | **Added in round 1; root cause and ownership settled in round 2.** The cause is **Node v26.2.0's experimental global `localStorage`**, which is `undefined` without `--localstorage-file` and shadows jsdom's working one — not a vitest/jsdom incompatibility, which is why the `environmentOptions.jsdom.url` probe changed nothing. **Ownership: a separate ticket, not AI-27.** The remedy is a toolchain decision with repo-wide reach (pin Node via `engines`/`.nvmrc` versus restore the binding in `vitest.setup.ts`) needing its own README entry; burying it in a PostHog PR would make both changes harder to review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 22  | §5 step 9 hard-codes the **private** API host rather than reusing `NEXT_PUBLIC_POSTHOG_HOST`                           | **Added in round 2 — the critic was right and the spec was wrong.** PostHog splits hosts: `us.i.posthog.com` serves public POST-only ingestion, `us.posthog.com` serves the personal-key REST API (§2). The old step 9 would have returned a 404 the remedy list said was impossible. Deriving one host from the other by dropping `.i` is a trap, so the private host is written out and `404`/redirect is now a named remedy.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 23  | §5 step 11 asserts only the two names AI-27 owns, not a repo-wide `PASS`                                               | **Corrected in round 2.** `check-env.sh` is already failing on the base for `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `DIRECT_DATABASE_URL` — there is no `.env.local` in this worktree at all (measured). The old wording promised a `PASS` that step 3 could never produce. This applies §1's base-red honesty clause to the second red check, which round 0 applied only to `pnpm check`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 24  | Slice 3 DoD 3 no longer preconditions on `.env.local` existing                                                         | **Adopted in round 2, by removal.** `.env.local` does not exist and `dotenv -e` tolerates that, so the clause was false and invited an implementer to create an untracked env file to satisfy a DoD that never needed one.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 25  | ~~Slice 2 DoD 9 grep-guarded the `posthog-js` bundle for `historyAutocapture` / `"history_change"===`~~ → **dropped**  | **Adopted in round 2, by removal, and the critic's second option was the right one.** The wide form asserts a minifier artifact — operand order and quote style are the minifier's to choose, so a routine patch reds it with no behaviour change. The narrow form is worse than useless: `historyAutocapture` would still appear as a registry key even if the implementation moved behind the external-scripts loader, so it could not fail on the regression it claimed to guard — a vacuous check. The version is lockfile-pinned, so an upgrade is already a deliberate, reviewed PR; §2 records the fact and §5 step 6 is the human detector.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 26  | `$pageview` sends candidate-bearing URL paths to PostHog — **declined, recorded**                                      | **Added in round 2.** `$current_url` on `/candidates/<id>` ships that id to a third party on every navigation. AC 1 mandates pageview capture, so there is nothing here to turn off without failing the ticket; the ids are opaque UUIDs carrying no candidate attributes; and every other collection lever is already at its most conservative. Recorded so §8's "every choice moves conservative" claim is complete rather than appearing to have missed a case. If path-level identifiers ever become a concern, PostHog's `mask_personal_data_properties` and a `before_send` URL scrubber are the levers, and they belong to whoever owns the privacy decision — not to this chore.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 27  | §5 step 6 proves `history_change` with `history.pushState` from the devtools console                                   | **Added in round 3 — the critic was right that the old step could not fail.** Ground-checked: `apps/web/src` has no `next/link` import, its only `next/navigation` import is a server-side `notFound()`, and `jobs/page.tsx`'s `<a href="/jobs">` is a plain anchor. There is no client-side navigation surface, so "navigate to `/jobs`" meant typing a URL — a full document load whose fresh `$pageview` is indistinguishable in live events from step 5's, reporting success either way. `pushState` is the exact method the SDK patches, so the console call exercises the real path. Deferring to AI-45 was rejected: AI-45 is blocked on this ticket, and a chore should not hand its own acceptance criterion to a feature that cannot start until it merges.                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 28  | `loadEnv()` is ordered before `loadClient()`, and the missing-key branch returns first                                 | **Added in round 3.** Nothing in AC 4 or the `reason` contract needs the SDK to answer `missing-key`, and absent is the key's state for every developer, every CI run and the user until §5 step 3 — so the unordered shape downloaded 83 KB gzipped on 100% of loads for a disabled feature. The ordering is stated in §3.3's contract, not just asserted in a DoD, because a DoD is only enforceable if the contract it checks exists. Slice 2 DoD 5 now pins `loadClient` as uncalled, which goes red the moment the short-circuit is removed. Checked for dead cases: all three `init-failed` injections stay reachable, but the `loadClient`-rejects and `init`-throws cases must now inject an env carrying a key or they short-circuit as `missing-key` and pass without reaching the guard — DoD 6 says so explicitly.                                                                                                                                                                                                                                                                                                                                                               |
| 29  | `internal_or_test_user_hostname: null` is passed explicitly — a seventh `init` option                                  | **Added in round 4. The critic found the defect and recommended record-only; the user overrode that, and the override is right for two reasons.** (1) It makes §3.4's "no person profiles are created" true as written, instead of a claim carrying a documented exception on the only host the app runs on today. (2) It is the same pattern this spec already chose for `capture_pageview` in 🟡 #5: the critic's own point was that DoD 3 "cannot catch it — the option is computed inside `init` from `defaults`, not passed by `analyticsOptions`", and passing it explicitly is precisely what converts an invisible, version-drifting behaviour into one a test asserts. "A seventh option for no benefit" undervalues making the behaviour assertable. **Correction to the instruction as issued:** the value is `null`, not `undefined` — the SDK's merge helper `es` skips undefined (`void 0 !== s[n] && …`), so `undefined` would have been a silent no-op that left the profile being created while the DoD went green. `null` is the SDK's own documented disable idiom and is in the declared type (§2). `defaults` stays pinned; unpinning it would revert `history_change`. |
| 30  | `next build` is red on the base too; slice 3 DoD 3 asserts the artifact, not the exit code                             | **Added after implementation, from slice 3.** `packages/db/src/client.ts:45` reads `env.DATABASE_URL` at module scope, so page-data collection throws with no `.env.local` — reproduced on bare `origin/main`. The evidence DoD 3 needs is unaffected: Turbopack emits `.next/static/chunks` in the compile phase, which completes before the failing one, and the grep is falsifiable (2 files with the module, 0 without — measured). Requiring exit `0` would have imported a third pre-existing failure into this ticket's DoD, the same mistake round 0 made with `pnpm check` and round 2 caught with `check-env.sh`. **Not AI-27's to fix:** it is a defect in another workspace, the remedy is a lazy-versus-eager env design decision with repo-wide reach, and folding it into a PostHog chore would make both changes harder to review. Reported as its own ticket.                                                                                                                                                                                                                                                                                                               |
| 31  | The zod-on-the-client cost — 64 KB gzipped, on every page load, key configured or not — is accepted, not designed away | **Added from the post-implementation code review (verdict APPROVED), correcting §7.9.** `startAnalytics`'s `loadEnv()` runs before the key check, so its dynamic `import("@/env")` fetches unconditionally; measured on the real build, that chunk is 284 KB raw / 64 KB gzipped, all zod. The ordering in §3.3 only makes the other half — the 82 KB gzipped `posthog-js` SDK chunk — conditional on a key existing; it does nothing for the env chunk. Splitting `@/env` so the key check does not pull in the full zod-validated module would remove the 64 KB too, but that is a design of its own (which keys the split covers, whether `EnvValidationError` still applies) on a chore already four slices deep, so it is deferred rather than done here. §7.6's "parse lazily per key" idea does not help: zod is imported either way, only how many schemas run inside it changes. Follow-up ticket, not this one.                                                                                                                                                                                                                                                                    |
| 32  | The `missing-key` `console.warn` firing on every visitor forever — reviewer's finding, declined for this ticket        | **Added from the post-implementation code review (verdict APPROVED).** The argument that `missing-key` is a configured state rather than an anomaly, so warning on it forever is noise while `init-failed` is the actual signal, is reasonable on its own. But slice 2 DoD 8 asserts _both_ paths warn, and that shape survived its own critique round for an unrelated reason — a `NODE_ENV` gate is unreliable client-side (🟡 #12) — not because the noise question was settled. Changing it now means changing the spec, the DoD and the test together, which is a design change, not a hardening pass. Left as-is; recorded here so it is a live question for a follow-up rather than an oversight.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

---

## 7. Risks and land-mines

1. **`pnpm check` is red on the base commit — 48 tests, three files.** Cause: **Node v26.2.0's
   experimental global `localStorage`**, `undefined` without `--localstorage-file`, shadowing jsdom's
   working one (§2). Not AI-27's, reproducible for anyone on Node 26, and **owned by a separate
   ticket** — the fix is a toolchain decision (pin Node versus restore the binding in
   `vitest.setup.ts`) that needs its own README decision entry. It will bite AI-45 and every other
   worktree on this base. AI-27 proceeds with DoDs that pin the failure set (§1).
2. **A sibling worktree is already on `feat/ai-45-funnel-analytics` at the same base commit.** AI-45 is
   _blocked by_ this ticket and is in flight anyway. It shares `pnpm-lock.yaml` and will want
   `src/lib/analytics.ts`. Expect a lockfile conflict and a duplicated analytics module unless AI-27
   lands first and AI-45 rebases. A scheduling call for the human.
3. **`pnpm install` exits `1` until the `core-js` placeholder becomes `false`.** Measured. A fresh
   checkout and CI both break.
4. **`check-env.sh` is already failing on the base and stays failing.** There is no `.env.local` in
   this worktree, so it reports `NEXT_PUBLIC_APP_URL`, `DATABASE_URL` and `DIRECT_DATABASE_URL` as
   unset (measured). AI-27 adds two more names to that list until §5 step 3 populates them. The two
   new keys are genuinely part of the deploy contract — shipped code reads them — so declaring them is
   correct; the app tolerates them being unset at runtime while the deploy check flags it. The risk is
   that two new names are easy to miss inside five, which is why §5 step 11 checks for those two names
   specifically rather than for a `PASS`.
5. **`next build` is already failing on the base commit and stays failing.** `packages/db/src/client.ts`
   reads `env.DATABASE_URL` at module scope, so Next's page-data collection throws with no
   `.env.local`; which route reports it is nondeterministic across the 9 workers. Measured: it clears
   with syntactically valid connection strings and needs no live database. Not AI-27's — its own
   ticket, same reasoning as §7.1. Slice 3 DoD 3 is written against the build _artifact_ for exactly
   this reason.
6. **`@/env` reaches the browser for the first time.** `startAnalytics`'s `catch` contains the throw,
   so the page is fine — but a malformed `NEXT_PUBLIC_APP_URL`, unrelated to analytics, will disable
   analytics with `reason: "init-failed"`. That is why the warning carries the error. A follow-up
   could make `env.ts` parse the client schema lazily per key; not worth doing here.
7. **A host/region mismatch is silent.** Every ingestion request 401s and the page looks identical. §5
   step 4's `?__posthog_debug=true` is the detection mechanism; there is no automated one.
8. **Two PostHog hosts, easy to conflate.** `NEXT_PUBLIC_POSTHOG_HOST` is ingestion only; the REST API
   is on `us.posthog.com`/`eu.posthog.com` (§2). AI-44 will need the second one and must not reuse the
   env key.
9. **Bundle weight — two costs, only one of them conditional.** Measured on the real build
   (`apps/web/.next/static/chunks`, gzip of the raw chunk file): `startAnalytics`'s `loadEnv()` runs
   before the key check, on **every** page load, key configured or not, and its dynamic
   `import("@/env")` always fetches — **284 KB raw / 64 KB gzipped**, dominated by zod 4. `@/env`
   was server-only before this ticket (its only prior importer was `src/app/api/status/route.ts`),
   so zod is new to the client bundle and arrives solely from this branch — confirmed by
   `grep -rl ZodError apps/web/.next/static/chunks`, which matches only that one chunk. **That 64
   KB gzipped lands on every developer's machine and every CI page load today, reading two
   constants Next already inlined at build time — it does not wait on §5 step 3.** The ordering in
   §3.3 does still do real work, for the other half: the `posthog-js` SDK chunk — **82 KB
   gzipped**, plus `preact`, `core-js` and `dompurify` — is confirmed unfetched while the key is
   unset, because `loadClient()` is never reached. So the cost that genuinely lands only once a key
   exists is 82 KB, not the 146 KB combined total; the previous wording of this risk conflated the
   two. Splitting `@/env` so the key check does not need the full zod-validated module would remove
   the unconditional 64 KB too, but that is a design of its own and out of scope for this ticket —
   🟡 #31 records the cost as accepted rather than designed away, and notes that §7.6's "parse
   lazily per key" idea does not help here: zod is imported either way.
10. **`defaults: "2026-08-29"` is dated five days ahead of today.** Valid in the installed
    `ConfigDefaults` union. If a future resolution predates it, fall back to the newest date that
    version offers and update the options test.
11. **A `posthog-js` upgrade could move history autocapture behind the external-scripts loader**, which
    `disable_external_dependency_loading: true` blocks — silently killing client-side-navigation
    pageviews. No automated guard exists (🟡 #25 explains why the candidate one was vacuous). The
    version is lockfile-pinned, so an upgrade is a deliberate reviewed PR; re-run §5 step 6 — the
    `history.pushState` console check, which is the only thing that can actually detect this — after
    one.
12. **No unit test can prove Next loads `src/instrumentation-client.ts`.** The build-output grep
    (slice 3 DoD 3) is the closest automated proof; the pageview in the PostHog UI is the real one, and
    it is human-gated.
13. **A new external service, free-tier.** Cost commitment is nil today — recorded so that it is a
    conscious nil.
14. **`.mcp.json` is committed.** AI-44 must read `POSTHOG_PERSONAL_API_KEY` from `.env.local`.

---

## 8. Escalations (🔴)

**None.** Each candidate was checked against the bar and cleared it:

- **Not a one-way door.** No migration, no destructive operation, no data deleted. Removing PostHog
  later is deleting one dependency, one module, one file and two env keys.
- **No external contract changes.** `$pageview` is PostHog's own event name, not a contract we own.
- **PII / security: resolved conservatively, with one case declined in the open.** The decision _to
  send data to PostHog_ was made by the ticket. Every collection lever available to this plan is at
  its most conservative setting — autocapture off, session replay off, external script loading off,
  anonymous person profiles off. **The one case that is not turned off is `$pageview`'s
  `$current_url`, which carries candidate and application ids on `/candidates/<id>`-style routes**
  (🟡 #26): AC 1 mandates pageview capture, so turning it off would fail the ticket, and the ids are
  opaque. It is named here rather than left to look like an oversight. Turning collection **up** would
  be the escalation.
- **No material cost.** Free tier, no infrastructure.
- **No product ambiguity without a default.** Every fork had a defensible v1; all thirty are in §6.
- **No conflict with `MEMORY.md` or `CLAUDE.md`.** The `allowBuilds` note is applied (🟡 #17). The one
  tension — "ask rather than assume" versus deciding and logging — is recorded at the top of §6.

**The base-commit breakage (§7.1) was flagged, not escalated, and ownership is now settled:** it gets
its own ticket rather than riding along in this PR.

---

## 9. Review

**Round 1** returned **`VERDICT: CHANGES_REQUESTED`** — five `SHOULD`s and one `NIT`.

| Finding                                                                 | Disposition                                                                                                                                                                                                                     |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Slice 2 DoD 8 was a vacuous check — its failure mechanism did not exist | **Adopted in full** (🟡 #15). The `deps`-injecting tests stub `loadClient`, so the real import style was never exercised. Two source scans replace it, reusing slice 1's `node:fs`.                                             |
| `disable_external_dependency_loading` might kill `history_change`       | **Fix adopted, hypothesis disproved** (🟡 #8, §2). Installed and measured: the history-patching class is inline in the core bundle and instantiated synchronously; the flag's only consumer is the `<script>`-injecting loader. |
| `env.NODE_ENV` in the browser is never established                      | **Adopted in full, by removal** (🟡 #12). Verified in Next's source. Gate deleted, `NODE_ENV` dropped from `AnalyticsEnv`, warn now unconditional.                                                                              |
| AC 3's scope and its proof command may not match                        | **Adopted** (🟡 #19). `query:read` verified twice and moved into §2. _Round 2 found this fix incomplete — see below._                                                                                                           |
| `POSTHOG_PERSONAL_API_KEY` in `.env.example` reds a repo-wide gate      | **Adopted** (🟡 #13). Removed.                                                                                                                                                                                                  |
| NIT: below design altitude                                              | **Adopted** (🟡 #20).                                                                                                                                                                                                           |

**Round 2** returned **`VERDICT: CHANGES_REQUESTED`** — two `SHOULD`s and three `NIT`s. All five
adopted; two of them by deleting something.

| Finding                                                         | Disposition                                                                                                                                                                                                                                                                                                             |
| --------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5 step 9 curls the ingestion host, not the API host            | **Adopted** (🟡 #22). Verified against PostHog's reference: `us.i.posthog.com` is public/ingestion, `us.posthog.com` is the private REST API. Step 9 hard-codes the private host, `404`/redirect is a named remedy, and the split is now a §2 fact. Round 1 settled the scope and left the host untouched — a real gap. |
| §5 step 11 and §7.4 assumed `check-env.sh` was green            | **Adopted** (🟡 #23). Measured: it already fails on three keys because this worktree has no `.env.local`. Step 11 now checks that AI-27's two names are absent from the FAIL list; §7.4 rewritten.                                                                                                                      |
| NIT: slice 3 DoD 3's ".env.local present" precondition is false | **Adopted, by removal** (🟡 #24).                                                                                                                                                                                                                                                                                       |
| NIT: slice 2 DoD 9 asserts a minified substring                 | **Adopted, by removal** (🟡 #25). The narrow variant the critic offered would have been vacuous — `historyAutocapture` survives as a registry key even if the implementation moves — so the DoD is dropped entirely and the exposure is recorded as §7.11 instead.                                                      |
| NIT: `$current_url` PII not named in §8                         | **Declined on the merits, recorded** (🟡 #26). AC 1 mandates pageview capture and the ids are opaque, so there is nothing to turn off; §8 now names the case so the conservative-posture claim is complete.                                                                                                             |

**Round 3** returned **`CHANGES_REQUESTED`** — two `SHOULD`s. Both adopted, both one-liners.

| Finding                                                    | Disposition                                                                                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| §5 step 6 is unperformable — no client-nav surface exists  | **Adopted** (🟡 #27). Verified independently: no `next/link`, one server-side `notFound()`, one plain anchor. The step was `MEMORY.md`'s recurring defect — it reported success whether `history_change` worked or not, and it was the sole detector §7.11 relied on. Replaced with a `history.pushState` console step, with the wrong failure diagnosis corrected; propagated to §1's AC-1 row and §7.11. |
| `startAnalytics` never orders key-check before client-load | **Adopted** (🟡 #28). The ordering is now in §3.3's contract and pinned by slice 2 DoD 5 (`loadClient` never called), so it can actually go red. §7.9 rewritten: the 83 KB is conditional on analytics being configured, not an unavoidable cost of the dynamic import. DoD 6 amended so the two cases that now sit behind the key check still reach their guard.                                          |

**Round 4** returned **`CHANGES_REQUESTED`** — one `SHOULD`, disposition decided by the user.

| Finding                                                                                                                       | Disposition                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `defaults: "2026-08-29"` silently enables `internal_or_test_user_hostname`, creating a person profile on every localhost load | **Adopted as an explicit override, not record-only** (🟡 #29). Every step of the critic's chain verified in the installed bundle — the resolver line, `Do()`, `setInternalOrTestUser`, and that `Yo()` blocks only under `person_profiles: "never"`. **The instruction's value was wrong and is corrected:** `undefined` is a no-op because the SDK's `es` merge helper skips undefined values, so the fix ships as `null`, which the SDK's own typing documents as the disable idiom. Seventh option added, DoD 3 upgraded to `toStrictEqual`, `$pageleave` and the benign-defaults audit folded into §2. |

**After implementation, from slice 3:** `next build` turned out to be red on the base commit as well
(🟡 #30, §7.5) — a third pre-existing failure, none of them AI-27's. Slice 3 DoD 3 was reworded from
the build's exit code to the build's artifact, which is the only part of it that was ever reachable
offline. The pattern across all four rounds is the same one this spec keeps re-learning: a DoD that
inherits someone else's red check is not a DoD.

**Found while ground-checking, not raised by any critic:** the base commit's 48 failing tests
(§7.1, 🟡 #21). Round 0 said "`pnpm check` green" in every DoD, which was unachievable before a line of
AI-27 was written.

## 10. Human handoff results

Reserved for §5. Record region, project id and the date each of AC 1 and AC 3 was verified.
