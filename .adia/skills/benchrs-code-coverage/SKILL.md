---
name: benchrs-code-coverage
description: Configuration de la couverture de code pour Benchrs
generated_by: init_project
generated_at: 2026-08-18
project: benchrs
---

## Objectif
Ajouter la couverture de code au projet Benchrs.

## Procédure recommandée
1. Installer Vitest (compatible React 19 + Next.js) :
   ```bash
   npm install --save-dev vitest @vitejs/plugin-react @testing-library/react @testing-library/jest-dom
   ```
2. Créer `vitest.config.ts` :
   ```ts
   import { defineConfig } from 'vitest/config'
   import react from '@vitejs/plugin-react'
   export default defineConfig({
     plugins: [react()],
     test: {
       environment: 'jsdom',
       coverage: { provider: 'v8', reporter: ['text', 'html'] },
       alias: { '@/': './src/' }
     }
   })
   ```
3. Ajouter les scripts dans `package.json` :
   ```json
   { "test": "vitest", "test:coverage": "vitest --coverage" }
   ```

## Priorités de test (par impact)
1. `src/lib/queryCache.ts` — logique pure, facile à tester
2. `src/lib/api-auth.ts` — guards de sécurité
3. `src/lib/training/phases.ts` + `exercises.ts` — constantes
4. `src/lib/goals.ts` — helpers de saison
5. API routes critiques (notifications/cron, auth)
