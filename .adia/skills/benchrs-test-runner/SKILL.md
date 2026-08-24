---
name: benchrs-test-runner
description: Lancer et ecrire les tests Playwright pour Benchrs
generated_by: init_project
generated_at: 2026-08-24
project: benchrs
---

## Objectif
Lancer les tests E2E Playwright et en ecrire de nouveaux pour Benchrs.

## Procedure
1. Installer les navigateurs si necessaire :
   ```bash
   npx playwright install --with-deps chromium
   ```
2. Lancer tous les tests :
   ```bash
   npx playwright test
   ```
3. Lancer un test specifique :
   ```bash
   npx playwright test e2e/public.spec.ts
   ```
4. Lancer en mode UI (debug) :
   ```bash
   npx playwright test --ui
   ```
5. Voir le rapport :
   ```bash
   npx playwright show-report
   ```

## Conventions
- Tests dans `e2e/` (pas `tests/` ni `__tests__/`)
- Nommage : `<domaine>.spec.ts`
- Base URL : `http://127.0.0.1:3000`
- Projets : chromium (desktop) + mobile-chromium (Pixel 5)
- Le web server build+start avant les tests (240s timeout)
- Retries : 2 en CI, 0 en local
- Assertions Playwright (`expect(page).toHaveTitle(...)`)
