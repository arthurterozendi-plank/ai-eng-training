import {
  ANALYTICS_EVENT_PROPERTY_SCHEMAS,
  type AnalyticsEvent,
  type AnalyticsEventName,
} from "@/lib/analytics/events";

/**
 * Where a validated event actually goes. AI-27's browser client and AI-112's server-side
 * emitter each implement this — this ticket ships no implementation of its own. Generic over
 * which of the six catalog names it is called with, so a real sink's `properties` parameter is
 * narrowed to that one name's own shape rather than the uncorrelated union of all six — fixing
 * that correlation here is the point of shipping the contract before its callers exist (review
 * round 1, NIT), not something AI-27 and AI-112 should each work around with their own cast.
 * Two of the six catalog events are server-emitted by design
 * (docs/specs/ai-45-funnel-analytics.md §3.5), and a server-side adapter's own capture call is
 * typically asynchronous, so the signature must allow a thenable — not necessarily a native
 * `Promise` — and `captureAnalyticsEvent` is what turns its rejection into a caught, logged
 * failure instead of an unhandled one. See docs/specs/ai-45-funnel-analytics.md §4.
 *
 * **Where the correlation does and does not reach.** Calling `sink` from
 * `captureAnalyticsEvent` needs no cast, and a per-name handler written as its own function —
 * `(properties: JobViewedEvent["properties"]) => …` — correlates fully. It does **not** reach
 * inside a single sink that branches on `name` with `if`/`switch`: TypeScript cannot narrow a
 * co-dependent parameter from a runtime check on a generic type argument, so `properties`
 * stays the union of all six shapes in every branch regardless of which `name` was matched.
 * Write one handler function per name and dispatch between them, rather than one function that
 * branches internally — the former is what this correlation actually buys you.
 */
export type AnalyticsSink = <Name extends AnalyticsEventName>(
  name: Name,
  properties: Extract<AnalyticsEvent, { name: Name }>["properties"],
) => void | PromiseLike<void>;

/**
 * The single runtime choke point every event passes through before it leaves the process.
 * Looks up the catalog schema for `event.name`, parses `event.properties` against it, and
 * calls `sink` with the parsed value on success. On any failure it logs once via
 * `console.error` and returns without ever calling `sink` or throwing:
 *
 * - `event.name` is not one of the six catalog names.
 * - `event.properties` fails the catalog schema for `event.name`.
 * - `sink` throws synchronously.
 * - `sink` returns something thenable that rejects.
 *
 * `event.name` is typed as one of the six catalog names, but the lookup below is written as
 * if it were not: a JavaScript caller, an `as any` cast, or a name left stale by a rename can
 * all reach this function with a `name` the catalog does not recognise — including, sharply,
 * an inherited `Object.prototype` key such as `"toString"` or `"constructor"`, which a plain
 * object index does not distinguish from a missing one (review round 1, BLOCKER: those names
 * used to sail past a falsy check and throw at `.safeParse`). `Object.hasOwn` is what actually
 * makes that distinction — unlike a bad property value or a bad sink, a missing own key is not
 * something a `try`/`catch` around the sink call protects against, so it has to be checked
 * before the sink is ever reached.
 */
export function captureAnalyticsEvent(event: AnalyticsEvent, sink: AnalyticsSink): void {
  // `event` itself is checked before `event.name` is ever read: a JavaScript caller can pass
  // `null`/`undefined` just as easily as an unlisted name, and dereferencing `.name` on either
  // would throw before `Object.hasOwn` gets a chance to run (review round 2, NIT).
  if (!event || !Object.hasOwn(ANALYTICS_EVENT_PROPERTY_SCHEMAS, event.name)) {
    // `event?.name` is passed as its own argument rather than interpolated into the message,
    // because this is the one branch where it is still an untrusted, caller-supplied value —
    // every other `console.error` below runs only after `event.name` is confirmed to be one
    // of the six known catalog literals (review round 2, NIT).
    console.error("captureAnalyticsEvent: event name is not in the catalog", event?.name);
    return;
  }

  const schema = ANALYTICS_EVENT_PROPERTY_SCHEMAS[event.name];
  const result = schema.safeParse(event.properties);

  if (!result.success) {
    console.error(
      `captureAnalyticsEvent: "${event.name}" failed property validation`,
      // Safe to log: zod 4.4.3's issues carry `{ origin, code, format, pattern, path,
      // message }` and no `input` field, so the rejected *value* never reaches this log.
      // The one exception is an `unrecognized_keys` issue's `keys` field, which does echo the
      // caller-supplied *key names* that triggered it (e.g. a stray `candidate_email`
      // property name) — never their values. That distinction is load-bearing for AC 4's PII
      // guarantee and worth re-checking on a zod upgrade or a custom `.refine()` message,
      // either of which could start echoing more than key names.
      result.error,
    );
    return;
  }

  try {
    const outcome = sink(event.name, result.data);

    // `instanceof Promise` would miss a non-native thenable — a server-side adapter's own
    // wrapper type, or a test double, say — and let its rejection escape unhandled (review
    // round 1, SHOULD). A duck-typed `.then` check is what spec §4's "when the sink returns a
    // thenable" actually means.
    if (outcome && typeof outcome.then === "function") {
      Promise.resolve(outcome).catch((error: unknown) => {
        console.error(`captureAnalyticsEvent: sink rejected for "${event.name}"`, error);
      });
    }
  } catch (error) {
    console.error(`captureAnalyticsEvent: sink threw for "${event.name}"`, error);
  }
}
