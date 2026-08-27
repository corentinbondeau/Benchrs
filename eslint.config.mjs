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
    // Fork legacy : code identique à src/ (garanti par npm run check:legacy-parity),
    // buildé avec sa propre toolchain (Next 14 / ESLint 8). Le linter racine
    // (Next 16 / ESLint 9) n'a pas à l'analyser — cohérent avec l'exclusion
    // déjà présente dans tsconfig.json.
    "legacy-app/**",
  ]),
]);

export default eslintConfig;
