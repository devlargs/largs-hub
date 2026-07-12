import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["dist/**", "dist-electron/**", "release/**", "node_modules/**"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      // The codebase uses `_`-prefixed params for intentionally unused IPC
      // event args (`_event`, `_wc`, ...)
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // `catch {}` is an established pattern here for best-effort operations
      // (view teardown, executeJavaScript on possibly-gone pages)
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["electron/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: { globals: globals.browser },
  },
  // Must be last: disables stylistic rules that would fight Prettier
  prettier,
);
