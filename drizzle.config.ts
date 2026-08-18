import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit deliberately declares no `dbCredentials`: `generate`, `export` and `check` never
 * open a connection, which keeps this ticket's DoD checkable offline (see
 * docs/specs/ai-34-domain-model.md §2). drizzle-kit compiles this file with esbuild + `require`,
 * which does not resolve tsconfig `paths` — it must not import through `@/`.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema/*.ts",
  out: "./drizzle",
});
