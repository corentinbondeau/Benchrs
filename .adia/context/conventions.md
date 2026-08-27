# Conventions — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-27 (reconciliation fiche-joueur-composition)

## ⚠️ REGLE DE CONTRIBUTION BLOQUANTE — parite avec le fork `legacy-app/`
> **Toute modification de `src/` DOIT etre repercutee dans `legacy-app/src/`.**

```bash
# apres toute modification de src/, avant de committer :
npm run sync:legacy        # = bash scripts/sync-legacy.sh  -> replique src/ vers legacy-app/src/
npm run check:legacy-parity # = node scripts/check-legacy-parity.mjs -> verifie la parite
```
- Le job CI **`legacy-parity` est bloquant** : sans synchronisation, la PR ne passe pas.
- Un ecart **intentionnel** doit etre declare dans l'**allowlist** de `scripts/check-legacy-parity.mjs` (ne pas le laisser en derive silencieuse).
- `legacy-app/` est un fork Next 14 / React 18 / Tailwind 3 ; il est **ignore par ESLint** (`eslint.config.mjs`) et son typecheck CI est non bloquant.
- Corollaire : ne jamais editer `legacy-app/src/` a la main — c'est une copie generee.
- Le meme principe vaut pour `vercel.json` / `legacy-app/vercel.json` (verrouille par `src/__tests__/legacy/vercel-crons.test.ts`).

## Nommage
- **Fichiers** : kebab-case pour les composants (`ConvocationsDialog.tsx` = PascalCase pour composants React)
- **Variables/fonctions** : camelCase (`ensureAttendanceRows`, `createAdminClient`)
- **Types/interfaces** : PascalCase (`EventType`, `AttendanceStatus`)
- **Constantes** : UPPER_SNAKE_CASE (`NOTIFICATION_TYPES`, `DRILL_TYPES`)
- **Routes API** : kebab-case dans les dossiers (`/api/notifications/send`)

## Imports
- Path alias `@/*` → `./src/*` (configure dans tsconfig.json)
- Imports relatifs non utilises — tout passe par `@/`
- Pas d'ordre d'import impose (pas de plugin ESLint specifique)

## Style de code
- `"use client"` explicite en haut des fichiers client
- TypeScript strict mode (`strict: true` dans tsconfig)
- Pas de point-virgule obligatoire mais usage quasi-systematique
- Composants : fonctions exportees (pas de default export sauf layouts/pages)
- Server Components par defaut (Next.js App Router)

## Conventions Git
- Messages en francais, prefixes `feat:` / `fix:` / `docs:`
- Commits gros lots (feature batches avec migrations)
- Branches : `main` (dev), `staging`, `production`
- Pas de GitFlow strict — trunk-based sur main

## Patterns
- Supabase admin client pour toutes les operations serveur (bypass RLS)
- Supabase browser client pour les operations client
- `authFetch` wrapper pour les appels API authentifies cote client
- Contextes React (AuthProvider, TeamProvider) pour l'etat global
- `useQueryCache` hook custom pour le cache client
- **Fonctions pures extraites dans `src/lib/<domaine>/`** — toute regle metier decidable (affectation, normalisation, projection) sort du composant vers un module pur, sans I/O ni React, avec son test colocalise. Exemples : `src/lib/lineup/`, `src/lib/profile/`, `src/lib/attendance/`.
- **Tests colocalises pour les fonctions pures** — `foo.ts` + `foo.test.ts` dans le meme dossier. Les tests transverses/structurels restent dans `src/__tests__/`.
- **Composants mutualises plutot que dupliques** — quand une meme UI est requise a 2 endroits, extraire un composant unique pilote par des props (ex. `LineupEditor` + `showEventPicker`) plutot que dupliquer. L'appelant devient un simple wrapper.
- **Source de verite unique pour les valeurs persistees** — les libelles stockes en base (ex. `POSITION_LABELS`) sont declares une seule fois ; les modules historiques deviennent de simples re-exports (`src/lib/positions.ts`).
- **Types partages dans `src/types/index.ts`** — pas de redeclaration locale d'un type de domaine ; les nouvelles cles d'un type persiste restent optionnelles (retro-compatibilite des donnees existantes).
- **Coach-gating** : `userRole === "coach" || userRole === "owner"` ; prevoir systematiquement une variante read-only pour les autres roles.
- ⛔ **Ne jamais inclure `role` dans un `update` de `profiles`** — le trigger SQL `prevent_self_role_change` (`072_security_fixes.sql:49-66`) leve une exception, meme pour un coach.
