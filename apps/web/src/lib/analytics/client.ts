import type { PostHogConfig } from "posthog-js";

/**
 * The two `@/env` values analytics needs. Kept as a narrow local shape, rather than importing
 * `@/env`'s own type, so this module's public surface does not shift every time an unrelated
 * key is added to the client schema — and so `@/env` never has to appear here as a value-level
 * import (see {@link AnalyticsDeps}).
 */
export interface AnalyticsEnv {
  readonly NEXT_PUBLIC_POSTHOG_KEY?: string;
  readonly NEXT_PUBLIC_POSTHOG_HOST: string;
}

/**
 * The two PostHog methods TalentScout calls — `init` from {@link startAnalytics}, `capture` from
 * the browser sink — kept to their own interface rather than `posthog-js`'s `PostHog` class so
 * tests can stub them without constructing a real client.
 */
export interface AnalyticsClient {
  init(token: string, config?: Partial<PostHogConfig>): unknown;
  capture(event: string, properties?: Record<string, unknown>): unknown;
}

/**
 * Outcome of {@link startAnalytics}. Never a rejection — every failure mode resolves with the
 * `reason` it failed for, so a caller (or a test) can assert *why* analytics did not start
 * rather than only that the call didn't throw.
 */
export type AnalyticsStatus =
  | { readonly enabled: true }
  | { readonly enabled: false; readonly reason: "missing-key" | "init-failed" };

/**
 * The two calls {@link startAnalytics} needs, injectable so tests can drive each failure mode
 * without touching the real `@/env` or `posthog-js` modules. The production defaults reach both
 * through a dynamic `import()` inside `startAnalytics`'s own `try` — Next.js requires
 * `src/instrumentation-client.ts` at module scope with no `try` of its own before hydration
 * begins, so a static import that throws here would take the whole app down with it. Neither
 * module may appear in this file as a value-level import; both do appear as `import type` above.
 */
export interface AnalyticsDeps {
  loadEnv: () => Promise<{ env: AnalyticsEnv }>;
  loadClient: () => Promise<AnalyticsClient>;
}

const defaultDeps: AnalyticsDeps = {
  loadEnv: async () => {
    const { env } = await import("@/env");
    return { env };
  },
  loadClient: async () => {
    const { default: posthog } = await import("posthog-js");
    return posthog;
  },
};

/**
 * The exact `posthog.init` options TalentScout ships with. A pure function so the contract is
 * something a test can assert against directly, rather than reconstructing it from a call spy.
 * See docs/specs/ai-27-posthog-event-capture.md §3.4 for why each of the seven is set.
 */
export function analyticsOptions(host: string): Partial<PostHogConfig> {
  return {
    api_host: host,
    // Pins the SDK's behavior lock so a future posthog-js upgrade cannot silently change
    // defaults under us.
    defaults: "2026-08-29",
    // Initial load and App Router client-side navigations, stated explicitly rather than left
    // to `defaults` alone.
    capture_pageview: "history_change",
    // Day 5 asks which of our own events fired; autocapture noise works against that, and it
    // would serialize element text from screens that show candidate data.
    autocapture: false,
    // Replay of a recruiting screen is candidate PII, and nothing before Day 9 needs it.
    disable_session_recording: true,
    // Stops PostHog from requesting the external bundles for replay, surveys, site apps and
    // the toolbar — deletes the "a blocked third-party script broke the page" failure category
    // rather than catching it. Verified not to affect `history_change` pageview capture.
    disable_external_dependency_loading: true,
    // Cancels the person profile that `defaults: "2026-08-29"` would otherwise create on
    // every localhost load. Must be `null`, not `undefined`: the SDK's config merge drops
    // undefined values outright, so an explicit `undefined` would silently leave the default
    // active. `null` is the SDK's own documented idiom for disabling it.
    internal_or_test_user_hostname: null,
  };
}

let started: Promise<AnalyticsClient | undefined> = Promise.resolve(undefined);

/**
 * Initializes PostHog when a key is configured, and never throws or rejects. Called once from
 * `src/instrumentation-client.ts`, which Next.js runs before hydration with no `try`/`catch` of
 * its own, so every failure mode here must resolve rather than reject — analytics must never be
 * the reason a page fails to render.
 *
 * `deps.loadEnv()` runs first, and the `"missing-key"` branch returns before `deps.loadClient()`
 * is reached: the key is absent for every developer, every CI run, and the user until the
 * project exists, and answering `"missing-key"` needs nothing from the SDK — so the ~83 KB
 * gzipped client chunk is only fetched once analytics is actually configured.
 */
export function startAnalytics(deps: AnalyticsDeps = defaultDeps): Promise<AnalyticsStatus> {
  const run = initialise(deps);
  started = run.then((result) => result.client);
  return run.then((result) => result.status);
}

/**
 * Resolves to the client {@link startAnalytics} initialised, once it has settled, or to
 * `undefined` when analytics is off — no key, a failed init, or `startAnalytics` never called.
 * Waiting matters: `posthog-js` drops a `capture` made before `init` rather than queueing it, and
 * `startAnalytics` is asynchronous, so an event fired on a page's first render would otherwise
 * race it and be lost.
 */
export function analyticsClient(): Promise<AnalyticsClient | undefined> {
  return started;
}

async function initialise(
  deps: AnalyticsDeps,
): Promise<{ status: AnalyticsStatus; client?: AnalyticsClient }> {
  try {
    const { env } = await deps.loadEnv();

    if (!env.NEXT_PUBLIC_POSTHOG_KEY) {
      console.warn("[analytics] disabled: missing-key");
      return { status: { enabled: false, reason: "missing-key" } };
    }

    const client = await deps.loadClient();
    client.init(env.NEXT_PUBLIC_POSTHOG_KEY, analyticsOptions(env.NEXT_PUBLIC_POSTHOG_HOST));

    return { status: { enabled: true }, client };
  } catch (error) {
    console.warn("[analytics] disabled: init-failed", error);
    return { status: { enabled: false, reason: "init-failed" } };
  }
}
