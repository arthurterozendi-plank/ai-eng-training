import type { AnalyticsSink } from "@/lib/analytics/capture";
import { analyticsClient } from "@/lib/analytics/client";

/**
 * The browser {@link AnalyticsSink}: hands an event `captureAnalyticsEvent` has already validated
 * to the `posthog-js` client `startAnalytics` initialised. Pass it as the sink argument —
 * `captureAnalyticsEvent(event, posthogSink)` — never call it directly, or the catalog check is
 * skipped.
 *
 * Waits for `startAnalytics` to settle before capturing, so an event fired on first render is
 * delivered rather than dropped. When analytics never started — no key, or a failed init — it
 * captures nothing and logs nothing: `startAnalytics` has already warned once, and a warning per
 * event would bury it.
 */
export const posthogSink: AnalyticsSink = async (name, properties) => {
  const client = await analyticsClient();
  client?.capture(name, properties);
};
