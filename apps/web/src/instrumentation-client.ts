import { startAnalytics } from "@/lib/analytics";

// Next requires this module at the root (or `src/`) of the app and evaluates it at module
// scope, before hydration, with no `try`/`catch` of its own (spec §2, §3.3) — so it may not
// import anything that can throw while the module graph loads. `startAnalytics` never rejects;
// its promise is intentionally left unawaited, matching Next's own "Analytics tracking" example
// for this file convention.
void startAnalytics();
