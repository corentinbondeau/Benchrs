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
    // Nécessaire pour que require("@/hooks/useDashboardData") fonctionne dans les tests
    server: {
      deps: {
        // Pattern: matcher le chemin filesystem du bridge dans node_modules/@/
        inline: [/@\/hooks\/useDashboardData/],
      },
    },
  },
  resolve: {
    alias: [
      // Alias spécifique pour le bridge CJS de useDashboardData (tests P1.4)
      // Le test P1.4 fait require("@/hooks/useDashboardData") qui ne peut pas résoudre
      // le .ts nativement en CJS. Ce bridge JS est résolvable par Node CJS.
      {
        find: "@/hooks/useDashboardData",
        replacement: path.resolve(__dirname, "./src/hooks/useDashboardData-cjs-bridge.js"),
      },
      // Alias général @/ → src/ (identique à tsconfig.json)
      {
        find: "@",
        replacement: path.resolve(__dirname, "./src"),
      },
    ],
  },
});
