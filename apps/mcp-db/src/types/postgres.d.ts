// postgres.js's own `UnsafeQueryOptions` type declares only `prepare`; passing `{ simple: false
// }` to `sql.unsafe()` — the flag that stops the simple query protocol from parsing more than
// one statement per call — fails `tsc` with TS2353. This augmentation closes that gap once,
// here, rather than casting at the call site that carries the security property.
import "postgres";

declare module "postgres" {
  interface UnsafeQueryOptions {
    simple?: boolean | undefined;
  }
}
