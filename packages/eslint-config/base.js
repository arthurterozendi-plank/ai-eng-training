import nextTs from "eslint-config-next/typescript";
import prettier from "eslint-config-prettier/flat";
import { defineConfig, globalIgnores } from "eslint/config";

/**
 * Shared ESLint configuration for framework-free packages: TypeScript rules only, no React
 * or Next.js plugins. `eslint-config-next/typescript` is typescript-eslint's recommended set
 * with two rules downgraded to warnings — it pulls in nothing Next-specific.
 */
export const baseConfig = defineConfig([
  ...nextTs,
  // Disables ESLint rules that conflict with Prettier. Must stay last.
  prettier,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Added:
    "coverage/**",
  ]),
]);

export default baseConfig;
