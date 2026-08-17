/** Shared, app-wide types. Feature-local types belong next to the feature. */

/** Makes the listed keys of `T` optional. */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/** A discriminated result type for operations that can fail without throwing. */
export type Result<T, E = Error> = { ok: true; data: T } | { ok: false; error: E };
