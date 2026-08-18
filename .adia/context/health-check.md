# Health Check — Benchrs

**Score global: 4/10**

## Positif
- ✅ CI/CD fonctionnel (GitHub Actions: typecheck + lint + build + E2E Playwright)
- ✅ ESLint configuré (core-web-vitals + TypeScript)
- ✅ Security headers complets (CSP, HSTS, X-Frame-Options, nosniff)
- ✅ API routes sécurisées (auth + team scoping + anti-SSRF)
- ✅ TypeScript strict mode
- ✅ PWA fonctionnelle (manifest, service worker, push notifications)
- ✅ Custom query cache avec deduplication

## Améliorations recommandées
- ⚠️ **99% des pages sont des composants client** — migration vers Server Components pour le data fetching
- ⚠️ **Waterfall de chargement** : AuthProvider (2 queries) → TeamProvider (3-4 queries) → widgets (15+ queries) — tout séquentiel, tout côté client
- ⚠️ **Pas de code-splitting** sur les composants lourds (recharts ~150KB, ExerciseSchematic 1071 LOC)
- ⚠️ **framer-motion** listé en dépendance mais jamais importé — poids mort (~80KB gzip en node_modules)
- ⚠️ **`<img>` natif** utilisé au lieu de `next/image` dans les pages auth et layout — pas d'optimisation automatique
- ⚠️ **Fichiers page.tsx très gros** (2014 LOC settings/team, 1605 LOC tactics) — maintenance difficile
- ⚠️ **useQueryCache 30s TTL** sans persistence — cache perdu à chaque navigation
- ⚠️ **Pas d'API caching** : aucun header `Cache-Control` sur les routes API

## Problèmes détectés
- ❌ **Pas de tests unitaires** — 0 fichier de test hors 1 E2E
- ❌ **Pas de Prettier/formatter** configuré
- ❌ **Pas de pre-commit hooks** (ni husky, ni pre-commit-config)
- ❌ **Pas de couverture de code** configurée
- ❌ **Pas de `.editorconfig`**
- ❌ **Pas de SonarQube** ni d'analyse statique avancée
- ❌ **Pas de Lighthouse CI** / performance monitoring
- ❌ **Dépendance morte** : framer-motion n'est importé nulle part mais pèse dans node_modules

## Score détaillé
| Critère | Score |
|---------|-------|
| Tests présents et fonctionnels | 0.5/2 (E2E minimal) |
| CI/CD configuré | 1/1 ✅ |
| Linting/formatting configuré | 0.5/1 (lint oui, format non) |
| Pre-commit hooks | 0/1 ❌ |
| Documentation à jour | 0.5/1 (AGENTS.md exhaustif, README minimal) |
| Pas de secrets en dur | 0.5/1 (VAPID fallback hardcodé) |
| Couverture de code configurée | 0/1 ❌ |
| Conventions de code cohérentes | 0.5/1 (nommage OK, formatting inconsistant) |
| Dépendances à jour | 0.5/1 (Next.js 16 récent, framer-motion inutilisé) |
