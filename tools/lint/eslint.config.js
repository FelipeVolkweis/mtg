// typescript-eslint needs the TypeScript compiler API, which TypeScript 7
// does not ship. This workspace installs TypeScript 6 next to
// typescript-eslint for type-aware linting only; `tsc` stays on the root's
// TypeScript 7. The root eslint.config.js re-exports this file.
import js from "@eslint/js";
import { fileURLToPath } from "node:url";
import tseslint from "typescript-eslint";

const root = fileURLToPath(new URL("../..", import.meta.url));

export default tseslint.config(
  {
    ignores: [
      "dist/",
      "node_modules/",
      "tools/lint/node_modules/",
      "test-results/",
      "playwright-report/",
      "catalog/",
      "public/",
      ".claude/",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommendedTypeChecked,
    ],
    languageOptions: {
      parserOptions: {
        project: [
          "./tsconfig.server.json",
          "./tsconfig.client.json",
          "./tsconfig.tests.json",
        ],
        tsconfigRootDir: root,
      },
    },
    rules: {
      // Promises: errors from the start.
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      // Too many hits to fix with the lint setup; quality roadmap Q13 fixes
      // them and turns each back to "error".
      "@typescript-eslint/no-unnecessary-type-assertion": "warn",
      "@typescript-eslint/no-unsafe-member-access": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/no-unsafe-assignment": "warn",
      "@typescript-eslint/no-unsafe-argument": "warn",
      "@typescript-eslint/require-await": "warn",
    },
  },
  {
    files: ["**/*.{js,mjs}"],
    extends: [js.configs.recommended],
    languageOptions: {
      globals: { process: "readonly", console: "readonly", URL: "readonly" },
    },
  },
);
