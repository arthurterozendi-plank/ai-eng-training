import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit deliberately declares no `dbCredentials`: `generate`, `export` and `check` never
 * open a connection, which keeps this ticket's DoD checkable offline (see
 * docs/specs/ai-34-domain-model.md §2). drizzle-kit compiles this file with esbuild + `require`,
 * which does not resolve tsconfig `paths` — it must not import through `@/`.
 */
export default defineConfig({
  dialect: "postgresql",
  // The extglob excludes co-located `*.test.ts` files: a plain `*.ts` glob matches them too,
  // and drizzle-kit `require`s every matched file, which fails on a test file's top-level
  // `vitest` import (measured: "Vitest cannot be imported ... using require()").
  schema: "./src/lib/db/schema/!(*.test).ts",
  out: "./drizzle",
});
