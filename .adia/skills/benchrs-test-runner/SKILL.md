---
name: benchrs-test-runner
description: Exécuter les tests Benchrs (Playwright E2E)
generated_by: init_project
generated_at: 2026-08-18
project: benchrs
---

## Objectif
Lancer les tests E2E du projet Benchrs.

## Procédure
1. Installer les navigateurs : `npx playwright install --with-deps chromium`
2. Lancer tous les tests : `npx playwright test`
3. Lancer un projet spécifique :
   - Desktop : `npx playwright test --project=chromium`
   - Mobile : `npx playwright test --project=mobile-chromium`
4. Voir le rapport : `npx playwright show-report`

## Configuration
- Fichier : `playwright.config.ts`
- Dossier de tests : `e2e/`
- Base URL : `http://127.0.0.1:3000`
- Web server : `npm run build && npm run start` (auto-lancé)
- Timeout build : 240s

## Tests existants
- `e2e/public.spec.ts` — test minimal des pages publiques

## Notes
- Les variables d'env Supabase doivent être configurées pour le build
- En CI : 2 workers, 2 retries, rapport HTML uploadé en cas d'échec
