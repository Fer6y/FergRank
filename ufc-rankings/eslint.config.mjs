import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Preview dev-server build artifacts (npm run dev:preview / dev:preview2).
    // Gitignored, but ESLint still walks them without an explicit ignore —
    // they generate ~14k spurious lint problems that drown out real ones.
    ".next-preview*/**",
  ]),
]);

export default eslintConfig;
