import nextVitals from "eslint-config-next/core-web-vitals";
import { defineConfig } from "eslint/config";

import { baseConfig } from "./base.js";

/**
 * Shared ESLint configuration for Next.js applications: Core Web Vitals, React and jsx-a11y
 * on top of the base TypeScript rules. `baseConfig` is spread last because it ends with the
 * Prettier conflict-disabling config, which must stay last.
 */
export const nextConfig = defineConfig([...nextVitals, ...baseConfig]);

export default nextConfig;
