---
name: benchrs-project-structure
description: Structure et navigation dans le projet Benchrs
generated_by: init_project
generated_at: 2026-08-24
project: benchrs
---

## Objectif
Comprendre la structure du projet Benchrs pour naviguer efficacement.

## Arbre principal
```
src/
  app/
    (auth)/          # Pages auth (login, register, join, forgot-password)
    (dashboard)/     # Pages dashboard (layout avec AuthProvider/TeamProvider)
    api/             # 49 API routes Next.js (serverless functions)
    c/[slug]/        # Page publique club
    live/[eventId]/  # Score live public
    offline/         # Page hors-ligne PWA
    layout.tsx       # Root layout (ThemeProvider, Toaster, InstallPrompt)
  components/        # Composants React (ui/, layout/, match/, training/, etc.)
  lib/               # Logique metier, hooks, helpers, AI generators
  types/             # Types TypeScript (index.ts unique)
supabase/
  migrations/        # 74 migrations SQL
e2e/                 # Tests Playwright
public/              # Assets statiques, sw.js, manifest.json
```

## Conventions
- API routes : `src/app/api/<domaine>/<action>/route.ts`
- Pages dashboard : `src/app/(dashboard)/<feature>/page.tsx`
- Composants : `src/components/<domaine>/` ou `src/components/ui/` (shadcn)
- Lib helpers : `src/lib/<nom>.ts` ou `src/lib/<domaine>/`
- Path alias : `@/*` → `./src/*`
