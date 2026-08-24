# Conventions — Benchrs
> Genere par @init_project le 2026-08-24 — Projet Benchrs
> Derniere mise a jour : 2026-08-24

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
