import "server-only";

import { PostHog } from "posthog-node";

import type { AnalyticsSink } from "@/lib/analytics/capture";
import { env } from "@/env";

let client: PostHog | undefined;

function serverClient(): PostHog | undefined {
  const key = env.POSTHOG_PROJECT_KEY;
  if (!key) return undefined;
  client ??= new PostHog(key, { host: env.POSTHOG_INGEST_HOST });
  return client;
}

/**
 * The server {@link AnalyticsSink}: hands an event `captureAnalyticsEvent` has already validated
 * to `posthog-node`. Pass it as the sink argument — `captureAnalyticsEvent(event,
 * posthogServerSink)` — never call it directly, or the catalog check is skipped. `server-only`
 * makes a Client Component import of this module a build error, so `posthog-node` never reaches
 * the browser bundle.
 *
 * Sends with `captureImmediate` and returns its promise rather than queueing: a serverless
 * function can be frozen the moment its response is sent, taking an unflushed queue with it.
 * Keeping the function alive until that promise settles is the caller's job.
 *
 * No `distinctId` is sent. `posthog-node` then gives the event a random id and creates no person
 * profile, which keeps a domain identity out of PostHog. A caller that needs the event joined to
 * a browser visitor's funnel must decide where that id comes from.
 *
 * When `POSTHOG_PROJECT_KEY` is unset it captures nothing and logs nothing.
 */
export const posthogServerSink: AnalyticsSink = async (name, properties) => {
  await serverClient()?.captureImmediate({ event: name, properties });
};
