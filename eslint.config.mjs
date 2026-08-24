import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

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
    plugins: { "react-hooks": reactHooks },
    // The two classic rules only. The plugin's full recommended set also turns
    // on its newer compiler-adjacent rules (set-state-in-effect and friends),
    // which flag a lot of existing, working code — a separate cleanup, not a
    // lint config change.
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "error",
    },
  },
  // Must be last: disables stylistic rules that would fight Prettier
  prettier,
);
