# Tests — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24 (reconciliation fix-auto-convocations)

## Frameworks

### Vitest (unitaires) — NOUVEAU
- **Framework** : Vitest ^4.1.11
- **Config** : `vitest.config.ts`
- **Environment** : node
- **Include** : `src/**/*.{test,spec}.{ts,tsx}`
- **Exclude** : node_modules, e2e, .next
- **Coverage** : @vitest/coverage-v8 (text + lcov)
- **Alias** : `@` → `./src`

### Playwright (E2E)
- **Framework** : Playwright
- **Config** : `playwright.config.ts`
- **Nombre de tests** : 3 specs dans `e2e/public.spec.ts`

## Commandes
- `npm run test:unit` — lance les tests unitaires Vitest (watch mode)
- `npm run test:unit:run` — lance les tests unitaires Vitest (single run)
- `npx playwright test` — lance les tests E2E
- `npx playwright test --project=chromium` — uniquement desktop
- `npx playwright test --project=mobile-chromium` — uniquement mobile
- `npx playwright show-report` — ouvrir le rapport HTML

## Configuration Playwright
- Navigateurs : Chromium (desktop) + Pixel 5 (mobile)
- Base URL : `http://127.0.0.1:3000`
- Web Server : `npm run build && npm run start` (build complet avant test)
- Retries : 2 en CI, 0 en local
- Trace : `on-first-retry`
- Timeout serveur : 240s

## Tests unitaires existants (Vitest)

### deliver-notifications (src/lib/__tests__/deliver-notifications.test.ts)
- Envoie le push et marque delivered_at quand une souscription active existe
- Marque delivered_at meme quand aucune souscription push n'existe (bug bloquant corrige)
- Marque delivered_at meme quand push_enabled=false dans les preferences (bug bloquant corrige)
- Supprime la souscription expiree (410) et marque quand meme delivered_at
- Appelle ensureAttendanceRows et met a jour convocations_sent_at pour les convocations
- Retourne des compteurs a zero quand il n'y a aucune notification pending

### auto-convocations (src/lib/__tests__/auto-convocations.test.ts)
- Cree les convocations et notifications pour un evenement dans la fenetre lead_days
- Ne cree aucune convocation si convocations_sent_at est deja renseigne (dedup)
- Ne cree pas de convocations si convocation_lead_days vaut 0 ou null
- N'insere pas de doublon attendance si le joueur est deja convoque manuellement
- Inclut les parents des joueurs convoques dans les notifications

### cron-order (src/app/api/notifications/__tests__/cron-order.test.ts)
- Appelle deliverPendingNotifications AVANT createAutoConvocations
- Appelle deliverPendingNotifications EN PREMIER (index 0 dans callOrder)
- A deja appele deliverPendingNotifications si createAutoConvocations echoue

## Tests E2E existants (e2e/public.spec.ts)
- Page de connexion se rend correctement
- Page hors-ligne affiche le message
- Score live public gere un lien invalide

## Couverture et lacunes
- Tests unitaires couvrent le systeme de delivery et auto-convocations (critique)
- **Pas de tests d'integration** sur les API routes
- Les tests E2E ne couvrent que les pages publiques (pas d'auth)
- Pas de tests unitaires sur les generators du cron (rappels, digest, echeances, etc.)
