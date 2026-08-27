# Tests — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-27 (reconciliation fiche-joueur-composition)

## Volumetrie
- **406 tests unitaires Vitest** (339 avant l'US fiche-joueur-composition, soit **+67**)
- 3 specs E2E Playwright (`e2e/public.spec.ts`)

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
- `npm test` — lance les tests unitaires Vitest (single run, via `vitest run`)
- `npm run test:watch` — Vitest en watch mode
- `npm run test:coverage` — Vitest avec couverture
- `npm run test:unit` — lance les tests unitaires Vitest (watch mode)
- `npm run test:unit:run` — lance les tests unitaires Vitest (single run)
- `npm run check:legacy-parity` — verifie la parite `src/` ↔ `legacy-app/src/` (**joue aussi en CI, bloquant**)
- `npm run sync:legacy` — replique `src/` vers `legacy-app/src/` (a lancer apres toute modif de `src/`)
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

## Organisation des tests — 2 conventions coexistantes

### 1. Colocalisation (convention par defaut pour les FONCTIONS PURES)
Le test vit **a cote** du module qu'il teste : `foo.ts` + `foo.test.ts` dans le meme dossier.
C'est la convention retenue pour tout nouveau helper pur (aucune I/O, aucun React).

| Dossier | Modules testes |
|---------|----------------|
| `src/lib/lineup/` | `positions.test.ts`, `formations.test.ts`, `autoCompose.test.ts`, `toMatchLineups.test.ts` |
| `src/lib/profile/` | `buildProfileAttributesPayload.test.ts` |
| `src/lib/attendance/` | `computeAttendanceRate.test.ts` |
| `src/lib/season/`, `src/lib/stats/`, `src/lib/` | `stats.test.ts`, `buildLeaderboard.test.ts`, `seasonReport.test.ts`, `legacyUserAgent.test.ts` |

### 2. Dossiers `__tests__/` (tests transverses, structurels et de garde-fou)
- `src/__tests__/legacy/` — **NOUVEAU** : `parity.test.ts`, `vercel-crons.test.ts`
- `src/__tests__/pages/` — `lineup-extraction.test.ts` (**NOUVEAU**), `tactics-split.test.ts`, `settings-team-split.test.ts`, `suspense-boundaries.test.ts`
- `src/__tests__/hooks/`, `src/__tests__/lib/`, `src/__tests__/layout/`, `src/__tests__/deps/`, `src/__tests__/team/`, `src/__tests__/auth/`, `src/__tests__/perf/`, `src/__tests__/charts/`, `src/__tests__/components/`
- `src/lib/__tests__/` — `deliver-notifications.test.ts`, `auto-convocations.test.ts`
- `src/app/api/notifications/__tests__/` — `cron-order.test.ts`
- `src/hooks/__tests__/` — `use-dashboard-data-availability.test.ts`

## Tests ajoutes par l'US fiche-joueur-composition

### src/lib/lineup/positions.test.ts
Verrouille les 10 cles de postes, la stabilite des libelles persistes en base, la coherence `POSITIONS` ↔ `POSITION_LABELS`, `labelToKey` (libelle connu, inconnu, null/undefined) et `POSITION_FAMILY`.

### src/lib/lineup/formations.test.ts
Verrouille les 9 formations x 11 slots, l'invariant `label/x/y` identiques aux valeurs d'origine, la presence d'exactement un slot `GK` par formation, et la desambiguisation "Milieu D" (`MD` defensif vs `AD`/`AG` couloir selon la formation).

### src/lib/lineup/autoCompose.test.ts
Priorite absolue du gardien, score principal (2) > secondaire (1), absence de repli par famille, determinisme (tri par `id` a score egal, independance de l'ordre d'entree), slot sans candidat laisse vide, respect de `benchSize` et remplissage de `unassigned`. **Test de verrou** : `preferred_foot` n'influence jamais le resultat.

### src/lib/lineup/toMatchLineups.test.ts
Filtrage des `player_id` null (slots et banc), `team_id` present sur chaque ligne (anti-RLS), dedoublonnage des joueurs, `is_starter`/`position_label` corrects pour titulaires et remplacants, tolerance a `bench`/`positions` absents.

### src/lib/profile/buildProfileAttributesPayload.test.ts
Normalisation du pied fort (valeurs valides / invalides / null), filtrage des postes secondaires hors `POSITIONS`, exclusion du poste principal, dedoublonnage, preservation de l'ordre. **Test de verrou securite** : la cle `role` n'est jamais presente dans le payload.

### src/__tests__/pages/lineup-extraction.test.ts
Verrouille l'extraction : `FeuilletMatchTab.tsx` reste un wrapper, la logique de composition n'est pas dupliquee, `LineupEditor` est bien l'unique editeur.

### src/__tests__/legacy/parity.test.ts
Verifie la parite structurelle entre `src/` et `legacy-app/src/` (meme garde-fou que le job CI `legacy-parity`).

### src/__tests__/legacy/vercel-crons.test.ts
Verifie la coherence des crons declares dans `vercel.json` et `legacy-app/vercel.json` (2 crons orphelins supprimes par cette US).

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
- Le noyau de composition (`src/lib/lineup/`) et les helpers de profil (`src/lib/profile/`) sont **entierement couverts** (fonctions pures)
- Tests unitaires couvrent le systeme de delivery et auto-convocations (critique)
- `LineupEditor.tsx` (686 l., composant client) n'est couvert que **indirectement** (tests structurels d'extraction) — pas de test de rendu/interaction
- **Pas de tests d'integration** sur les API routes
- Les tests E2E ne couvrent que les pages publiques (pas d'auth)
- Pas de tests unitaires sur les generators du cron (rappels, digest, echeances, etc.)
