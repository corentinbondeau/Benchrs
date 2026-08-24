import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Configuration Vitest pour benchrs
 * - Environnement jsdom (simule le DOM navigateur)
 * - Alias @/ → ./src/ (cohérent avec tsconfig.json)
 * - Setup file : charge jest-dom et les mocks Next.js
 */
export default defineConfig({
  plugins: [react()],
  test: {
    // Environnement DOM simulé
    environment: "jsdom",

    // Fichier de setup exécuté avant chaque suite
    setupFiles: ["src/__tests__/setup.ts"],

    // Pattern des fichiers de tests unitaires/intégration
    include: ["src/**/*.{test,spec}.{ts,tsx}"],

    // Exclure les tests E2E Playwright
    exclude: ["e2e/**", "node_modules/**"],

    // Activer les globals (describe, it, expect) sans import explicite
    globals: true,

    // Résolution des alias pour require() CJS (nécessaire pour les tests qui utilisent require("@/..."))
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },

    // Force Vitest à transformer les modules du bridge @/ pour que les mocks s'appliquent
    server: {
      deps: {
        inline: [/@\/hooks\/useDashboardData/],
      },
    },

    // Coverage (héritée de main)
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
  },
  resolve: {
    alias: [
      // Alias général @/ → src/ (identique à tsconfig.json)
      // Note: le bridge CJS useDashboardData-cjs-bridge.js est utilisé
      // uniquement par test_require.test.cjs via node_modules/@/
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
});
