---
name: benchrs-ci-pipeline
description: Pipeline CI GitHub Actions pour Benchrs
generated_by: init_project
generated_at: 2026-08-24
project: benchrs
---

## Objectif
Comprendre et debugger la pipeline CI de Benchrs.

## Procedure
1. La CI se declenche sur :
   - Push sur `main` ou `production`
   - Pull requests
2. Jobs :
   - **lint-and-build** : `npm ci` → `tsc --noEmit` → `eslint` → `next build`
   - **e2e** : `npm ci` → `playwright install chromium` → `playwright test`
3. Verifier en local avant push :
   ```bash
   npx tsc --noEmit && npm run lint && npm run build
   ```
4. Lancer les E2E en local :
   ```bash
   npx playwright install --with-deps chromium
   npx playwright test
   ```

## Conventions
- Node 22 en CI
- Secrets CI : NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, MISTRAL_API_KEY
- Deploiement Vercel automatique (pas dans la CI GitHub)
- Les crons Vercel sont definis dans `vercel.json`
