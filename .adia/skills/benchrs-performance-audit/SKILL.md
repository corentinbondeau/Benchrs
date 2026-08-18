---
name: benchrs-performance-audit
description: Audit de performance Benchrs — latence et bundle
generated_by: init_project
generated_at: 2026-08-18
project: benchrs
---

## Objectif
Identifier et corriger les problèmes de performance (latence initiale + fluidité).

## Problèmes identifiés

### 1. Waterfall de chargement initial
- AuthProvider: `getSession()` + `fetchProfile()` (2 requêtes séquentielles)
- TeamProvider: `loadTeams()` (3-4 requêtes séquentielles, APRÈS AuthProvider)
- Dashboard widgets: 7+ requêtes Supabase indépendantes (APRÈS TeamProvider)
- **Total**: 12-15+ requêtes séquentielles avant contenu visible

### 2. Zéro Server Components
- 53/54 pages sont `"use client"` → tout le JS doit charger + hydrater avant le premier fetch
- `force-dynamic` sur le layout empêche le caching statique
- Aucun usage de `React.Suspense` ou streaming SSR

### 3. Bundle client lourd
- recharts (~150KB gzip) importé dans 4 composants sans code-splitting
- framer-motion en dépendance mais jamais importé (poids mort)
- Fichiers page de 1000-2000 LOC sans découpage

### 4. Cache non-persistant
- `useQueryCache` (30s TTL in-memory) perdu à chaque navigation
- Pas de `stale-while-revalidate`

## Procédure d'audit
1. `npx next build` — analyser les tailles de bundles dans `.next/`
2. Chercher les chunks > 100KB : `find .next -name "*.js" -size +100k`
3. Analyser le tree de rendu : AuthProvider → TeamProvider → page
4. Compter les requêtes Supabase au chargement : ouvrir DevTools Network
5. Mesurer le TTFB et LCP avec Lighthouse

## Axes d'optimisation
- Migrer le dashboard vers des Server Components (data fetching SSR)
- `React.lazy`/`next/dynamic` sur recharts et composants lourds
- Supprimer framer-motion des dépendances
- Paralléliser les requêtes auth + team (`Promise.all`)
- Ajouter des headers `Cache-Control` sur les API routes
- Utiliser `next/image` au lieu de `<img>` natif
